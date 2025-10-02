import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const meetingData = await req.json();

    // Create meeting in database
    const { data: meeting, error: insertError } = await supabaseClient
      .from('meetings')
      .insert([meetingData])
      .select()
      .single();

    if (insertError) throw insertError;

    // Create calendar event and Google Meet link if needed
    let generatedMeetLink = meetingData.meeting_link;
    
    try {
      // Check if Google Meet is selected and auto-generate link
      if (meetingData.meeting_platform === 'google_meet' && !meetingData.meeting_link) {
        console.log('Auto-generating Google Meet link');
        
        const { data: gmailConnection } = await supabaseClient
          .from('gmail_connections')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (gmailConnection) {
          try {
            // Create Google Calendar event with conference data
            const calendarEventData = {
              summary: meetingData.title,
              description: meetingData.description,
              start: {
                dateTime: meetingData.start_time,
                timeZone: 'UTC',
              },
              end: {
                dateTime: meetingData.end_time,
                timeZone: 'UTC',
              },
              conferenceData: {
                createRequest: {
                  requestId: crypto.randomUUID(),
                  conferenceSolutionKey: {
                    type: 'hangoutsMeet',
                  },
                },
              },
            };

            const { data: calendarResult, error: calendarApiError } = await supabaseClient.functions.invoke('calendar-api', {
              body: {
                action: 'create',
                event: calendarEventData,
              },
            });

            if (!calendarApiError && calendarResult?.event?.hangoutLink) {
              generatedMeetLink = calendarResult.event.hangoutLink;
              console.log('Google Meet link generated:', generatedMeetLink);
              
              // Update meeting with generated link
              await supabaseClient
                .from('meetings')
                .update({ meeting_link: generatedMeetLink })
                .eq('id', meeting.id);
            } else {
              console.error('Failed to generate Google Meet link:', calendarApiError);
            }
          } catch (meetError) {
            console.error('Error generating Google Meet link:', meetError);
          }
        }
      }

      // Create local calendar event
      const { data: calendarEvent, error: calendarError } = await supabaseClient
        .from('calendar_events')
        .insert([{
          user_id: user.id,
          title: meetingData.title,
          description: meetingData.description,
          start_time: meetingData.start_time,
          end_time: meetingData.end_time,
          all_day: false,
          is_synced: meetingData.meeting_platform === 'google_meet',
        }])
        .select()
        .single();

      if (!calendarError && calendarEvent) {
        await supabaseClient
          .from('meetings')
          .update({ calendar_event_id: calendarEvent.id })
          .eq('id', meeting.id);
      }
    } catch (calendarError) {
      console.error('Calendar event creation failed:', calendarError);
    }

    // Generate .ics file content
    const icsContent = generateICS(meetingData, generatedMeetLink);

    // Send email invitations to all attendees
    if (meetingData.attendees && meetingData.attendees.length > 0) {
      try {
        await supabaseClient.functions.invoke('gmail-api', {
          body: {
            action: 'send',
            to: meetingData.attendees.map((a: any) => a.email).join(','),
            subject: `Meeting Invitation: ${meetingData.title}`,
            content: generateEmailContent(meetingData, user, generatedMeetLink),
            attachments: [{
              filename: 'meeting.ics',
              content: btoa(icsContent),
              mimeType: 'text/calendar',
            }],
          },
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, meeting }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateICS(meeting: any, meetLink?: string): string {
  const startDate = new Date(meeting.start_time);
  const endDate = new Date(meeting.end_time);
  const finalMeetLink = meetLink || meeting.meeting_link;
  
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Ayra//Meeting Scheduler//EN
BEGIN:VEVENT
UID:${crypto.randomUUID()}@ayra.app
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:${meeting.title}
DESCRIPTION:${meeting.description || ''}
LOCATION:${finalMeetLink || meeting.location || ''}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

function generateEmailContent(meeting: any, user: any, meetLink?: string): string {
  const startDate = new Date(meeting.start_time);
  const endDate = new Date(meeting.end_time);
  const finalMeetLink = meetLink || meeting.meeting_link;

  return `
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">Meeting Invitation</h2>
  
  <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0; color: #555;">${meeting.title}</h3>
    
    ${meeting.description ? `<p style="color: #666;">${meeting.description}</p>` : ''}
    
    <div style="margin: 15px 0;">
      <strong>📅 Date:</strong> ${startDate.toLocaleDateString()}<br/>
      <strong>🕐 Time:</strong> ${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}<br/>
      ${finalMeetLink ? `<strong>🔗 Meeting Link:</strong> <a href="${finalMeetLink}">${finalMeetLink}</a><br/>` : ''}
      ${meeting.location ? `<strong>📍 Location:</strong> ${meeting.location}<br/>` : ''}
    </div>
    
    ${meeting.attendees && meeting.attendees.length > 0 ? `
    <div style="margin-top: 15px;">
      <strong>👥 Attendees:</strong>
      <ul style="margin: 5px 0;">
        ${meeting.attendees.map((a: any) => `<li>${a.name} (${a.email})</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    ${meeting.notes ? `<div style="margin-top: 15px; font-style: italic; color: #666;">Note: ${meeting.notes}</div>` : ''}
  </div>
  
  <p style="color: #666;">This meeting has been added to your calendar (see attached .ics file).</p>
  
  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    Organized by ${user.email}<br/>
    Powered by Ayra
  </p>
</body>
</html>
  `;
}
