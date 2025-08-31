import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== AUTO CACHE CALENDAR FUNCTION START ===');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all active Gmail connections
    const { data: connections, error: connectionsError } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('is_active', true);

    if (connectionsError) {
      console.error('Error fetching connections:', connectionsError);
      return new Response(JSON.stringify({ error: connectionsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${connections?.length || 0} active connections`);

    for (const connection of connections || []) {
      try {
        console.log(`Caching calendar events for user: ${connection.user_id}`);
        
        // Fetch calendar events from Google Calendar API
        const events = await fetchGoogleCalendarEvents(connection);
        
        if (events && events.length > 0) {
          // Cache events in our database
          await cacheCalendarEvents(supabase, connection.user_id, events);
          console.log(`Cached ${events.length} events for user ${connection.user_id}`);
        } else {
          console.log(`No events found for user ${connection.user_id}`);
        }
        
      } catch (userError) {
        console.error(`Error processing user ${connection.user_id}:`, userError);
        // Continue with next user instead of failing the whole job
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processedConnections: connections?.length || 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Auto cache calendar error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

async function refreshAccessToken(connection: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const tokens = await response.json();
  return tokens.access_token;
}

async function makeCalendarRequest(connection: any, endpoint: string, options: any = {}) {
  let accessToken = connection.access_token;
  
  // Try request with current token
  let response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // If unauthorized, try refreshing token
  if (response.status === 401) {
    console.log('Access token expired, refreshing...');
    accessToken = await refreshAccessToken(connection);
    
    response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Calendar API error:', errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function fetchGoogleCalendarEvents(connection: any) {
  try {
    // Get events from the next 3 months
    const now = new Date();
    const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    const params = new URLSearchParams({
      calendarId: 'primary',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: now.toISOString(),
      timeMax: threeMonthsFromNow.toISOString(),
      maxResults: '250'
    });

    const data = await makeCalendarRequest(connection, `/calendars/primary/events?${params}`);
    return data.items || [];
    
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error);
    return [];
  }
}

async function cacheCalendarEvents(supabase: any, userId: string, googleEvents: any[]) {
  try {
    // First, delete existing events for this user (we'll do a full refresh)
    await supabase
      .from('calendar_events')
      .delete()
      .eq('user_id', userId)
      .eq('is_synced', true);

    // Convert Google Calendar events to our format and insert
    const eventsToInsert = googleEvents.map(event => ({
      user_id: userId,
      title: event.summary || 'Untitled Event',
      description: event.description || null,
      start_time: event.start?.dateTime || event.start?.date,
      end_time: event.end?.dateTime || event.end?.date,
      all_day: !event.start?.dateTime, // If no time, it's all day
      external_id: event.id,
      calendar_id: 'primary',
      is_synced: true,
      reminder_minutes: event.reminders?.overrides?.[0]?.minutes || null
    }));

    if (eventsToInsert.length > 0) {
      const { error } = await supabase
        .from('calendar_events')
        .insert(eventsToInsert);

      if (error) {
        console.error('Error inserting calendar events:', error);
        throw error;
      }
    }

  } catch (error) {
    console.error('Error caching calendar events:', error);
    throw error;
  }
}

serve(handler);