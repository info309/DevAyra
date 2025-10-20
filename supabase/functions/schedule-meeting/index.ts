import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to create Google Meet link via Calendar API
async function createGoogleMeetLink(accessToken: string, title: string, startTime: string, endTime: string): Promise<string | null> {
  try {
    const event = {
      summary: title,
      start: {
        dateTime: startTime,
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime,
        timeZone: 'UTC',
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      console.error('Failed to create Meet link:', await response.text());
      return null;
    }

    const data = await response.json();
    
    if (data.conferenceData && data.conferenceData.entryPoints) {
      const videoEntry = data.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      );
      
      if (videoEntry) {
        return videoEntry.uri;
      }
    }

    return null;
  } catch (error) {
    console.error('Error creating Google Meet link:', error);
    return null;
  }
}

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

    // Auto-generate Google Meet link for virtual meetings if not provided
    if (meetingData.meeting_type === 'virtual' && 
        meetingData.meeting_platform === 'google_meet' && 
        !meetingData.meeting_link) {
      try {
        // Get Gmail connection for access token
        const { data: connection } = await supabaseClient
          .from('gmail_connections')
          .select('access_token')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();

        if (connection && connection.access_token) {
          const meetLink = await createGoogleMeetLink(
            connection.access_token,
            meetingData.title,
            meetingData.start_time,
            meetingData.end_time
          );
          
          if (meetLink) {
            meetingData.meeting_link = meetLink;
            console.log('Auto-generated Google Meet link:', meetLink);
          }
        }
      } catch (error) {
        console.error('Failed to auto-generate Meet link:', error);
        // Continue without Meet link - user can add it manually
      }
    }

    // Create meeting in database
    const { data: meeting, error: insertError } = await supabaseClient
      .from('meetings')
      .insert([meetingData])
      .select()
      .single();

    if (insertError) throw insertError;

    // Create calendar event
    try {
      const { data: calendarEvent, error: calendarError } = await supabaseClient
        .from('calendar_events')
        .insert([{
          user_id: user.id,
          title: meetingData.title,
          description: meetingData.description,
          start_time: meetingData.start_time,
          end_time: meetingData.end_time,
          all_day: false,
          is_synced: false,
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
    const icsContent = generateICS(meetingData);

    // Send email invitations to all attendees
    if (meetingData.attendees && meetingData.attendees.length > 0) {
      try {
        await supabaseClient.functions.invoke('gmail-api', {
          body: {
            action: 'send',
            to: meetingData.attendees.map((a: any) => a.email).join(','),
            subject: `Meeting Invitation: ${meetingData.title}`,
            content: generateEmailContent(meetingData, user),
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

function generateICS(meeting: any): string {
  const startDate = new Date(meeting.start_time);
  const endDate = new Date(meeting.end_time);
  
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
LOCATION:${meeting.meeting_link || meeting.location || ''}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

function generateEmailContent(meeting: any, user: any): string {
  const startDate = new Date(meeting.start_time);
  const endDate = new Date(meeting.end_time);

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
      ${meeting.meeting_link ? `<strong>🔗 Meeting Link:</strong> <a href="${meeting.meeting_link}">${meeting.meeting_link}</a><br/>` : ''}
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
