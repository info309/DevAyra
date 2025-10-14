import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    responseStatus?: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Calendar API request received');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid token');
    }

    // Get user's Gmail connection
    const { data: connection, error: connectionError } = await supabaseClient
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ error: 'GMAIL_NOT_CONNECTED' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const { action, ...requestData } = await req.json();

    switch (action) {
      case 'list':
        return await listEvents(connection, requestData, supabaseClient);
      case 'create':
        return await createEvent(connection, requestData, supabaseClient);
      case 'update':
        return await updateEvent(connection, requestData, supabaseClient, user.id);
      case 'delete':
        return await deleteEvent(connection, requestData, supabaseClient, user.id);
      default:
        throw new Error('Invalid action');
    }

  } catch (error: any) {
    console.error('Error in calendar-api function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
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
    const errorData = await response.json();
    console.error('Token refresh failed:', errorData);
    
    // Check if it's an invalid_grant error (revoked access)
    if (errorData.error === 'invalid_grant') {
      throw new Error('INVALID_GRANT');
    }
    
    throw new Error('Failed to refresh access token');
  }

  const tokens = await response.json();
  return tokens.access_token;
}

async function makeCalendarRequest(connection: any, endpoint: string, options: any = {}, supabaseClient?: any) {
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
    try {
      accessToken = await refreshAccessToken(connection);
      
      // Persist the new access token to database
      if (supabaseClient) {
        console.log('Persisting refreshed access token to database');
        const { error: updateError } = await supabaseClient
          .from('gmail_connections')
          .update({ 
            access_token: accessToken, 
            updated_at: new Date().toISOString(),
            last_error: null 
          })
          .eq('id', connection.id);
        
        if (updateError) {
          console.error('Failed to persist access token:', updateError);
        } else {
          console.log('Successfully persisted refreshed access token');
        }
      }
      
      response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (refreshError: any) {
      console.error('Token refresh failed:', refreshError);
      
      // Check if it's an invalid_grant error (revoked access)
      if (refreshError.message === 'INVALID_GRANT' && supabaseClient) {
        console.log('Access revoked, marking connection as inactive');
        await supabaseClient
          .from('gmail_connections')
          .update({ 
            is_active: false,
            last_error: 'Google account access has been revoked. Please reconnect your account.',
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id);
        
        throw new Error('GOOGLE_ACCESS_REVOKED');
      }
      
      throw refreshError;
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Calendar API error:', errorText);
    throw new Error(`Calendar API error: ${response.status} ${errorText}`);
  }

  // For DELETE requests or 204 No Content responses, don't try to parse JSON
  if (response.status === 204 || options.method === 'DELETE') {
    return {};
  }

  // Check if response has content before parsing JSON
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return {};
  }

  return response.json();
}

async function listEvents(connection: any, { timeMin, timeMax }: any, supabaseClient: any) {
  console.log('Listing calendar events');
  
  const params = new URLSearchParams({
    calendarId: 'primary',
    singleEvents: 'true',
    orderBy: 'startTime',
    ...(timeMin && { timeMin }),
    ...(timeMax && { timeMax }),
  });

  const data = await makeCalendarRequest(connection, `/calendars/primary/events?${params}`, {}, supabaseClient);
  
  return new Response(
    JSON.stringify({ events: data.items || [] }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

async function createEvent(connection: any, { event }: { event: CalendarEvent }, supabaseClient: any) {
  console.log('Creating calendar event in Google Calendar');
  
  // Check if event has attendees to determine if we should send notifications
  const hasAttendees = event.attendees && event.attendees.length > 0;
  const sendUpdates = hasAttendees ? 'all' : 'none';
  
  console.log(`Event has ${event.attendees?.length || 0} attendees, sendUpdates: ${sendUpdates}`);
  
  // Add sendUpdates parameter to notify attendees
  const endpoint = `/calendars/primary/events?sendUpdates=${sendUpdates}`;
  
  const data = await makeCalendarRequest(connection, endpoint, {
    method: 'POST',
    body: JSON.stringify(event),
  }, supabaseClient);

  return new Response(
    JSON.stringify({ event: data }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

async function updateEvent(connection: any, { eventId, event }: { eventId: string; event: CalendarEvent }, supabaseClient: any, userId: string) {
  console.log('Updating calendar event');
  
  const data = await makeCalendarRequest(connection, `/calendars/primary/events/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(event),
  }, supabaseClient);

  return new Response(
    JSON.stringify({ event: data }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

async function deleteEvent(connection: any, { eventId }: { eventId: string }, supabaseClient: any, userId: string) {
  console.log('Deleting calendar event');
  
  await makeCalendarRequest(connection, `/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
  }, supabaseClient);

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
}

serve(handler);