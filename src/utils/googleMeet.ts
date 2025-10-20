/**
 * Google Meet API Integration
 * Utilities for creating and managing Google Meet spaces
 */

import { supabase } from '@/integrations/supabase/client';

interface MeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
}

interface CreateMeetSpaceOptions {
  title?: string;
}

/**
 * Get access token for Google Meet API from Gmail connection
 */
async function getGoogleAccessToken(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: connection, error } = await supabase
      .from('gmail_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (error || !connection) {
      console.error('No active Gmail connection found:', error);
      return null;
    }

    return connection.access_token;
  } catch (error) {
    console.error('Error getting Google access token:', error);
    return null;
  }
}

/**
 * Create a Google Meet space using the Google Meet REST API
 * @param options Optional configuration for the Meet space
 * @returns Meet space details including meeting URI and code
 */
export async function createGoogleMeetSpace(
  options: CreateMeetSpaceOptions = {}
): Promise<MeetSpace | null> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      throw new Error('No Google access token available. Please connect your Google account.');
    }

    // Create a new space using Google Meet REST API
    // Note: The Meet API creates spaces that are linked to Google Calendar events
    const response = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          entryPointAccess: 'ALL', // Anyone with the link can join
          accessType: 'OPEN', // Open access
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Meet API error:', errorText);
      
      // If Meet API fails, we can fall back to creating a calendar event with conferenceData
      console.log('Falling back to calendar-based Meet link generation');
      return await createMeetViaCalendarEvent(options);
    }

    const data = await response.json();
    
    return {
      name: data.name,
      meetingUri: data.meetingUri,
      meetingCode: data.meetingCode,
    };
  } catch (error) {
    console.error('Error creating Google Meet space:', error);
    
    // Fallback to calendar-based Meet link generation
    return await createMeetViaCalendarEvent(options);
  }
}

/**
 * Fallback method: Create a Google Meet link by creating a calendar event with conferenceData
 * This is more reliable and doesn't require the Meet API to be enabled
 */
async function createMeetViaCalendarEvent(
  options: CreateMeetSpaceOptions = {}
): Promise<MeetSpace | null> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      throw new Error('No Google access token available');
    }

    // Create a temporary calendar event with Google Meet conference
    const now = new Date();
    const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    const event = {
      summary: options.title || 'Quick Meet',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
      const errorText = await response.text();
      console.error('Calendar API error:', errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.conferenceData && data.conferenceData.entryPoints) {
      const videoEntry = data.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      );
      
      if (videoEntry) {
        // Extract the meeting code from the URI
        const meetingCode = data.conferenceData.conferenceId || 
                           videoEntry.uri.split('/').pop();
        
        return {
          name: data.id,
          meetingUri: videoEntry.uri,
          meetingCode: meetingCode,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error creating Meet via Calendar:', error);
    return null;
  }
}

/**
 * Generate a simple Google Meet link (without API)
 * This creates a meet.google.com link with a random code
 * Note: This is a fallback method that doesn't use the official API
 */
export function generateSimpleMeetLink(): string {
  // Generate a random meeting code (Google Meet codes are typically 10-12 characters)
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  const segments = [];
  
  for (let i = 0; i < 3; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    segments.push(segment);
  }
  
  return `https://meet.google.com/${segments.join('-')}`;
}

/**
 * Extract meeting code from a Google Meet URL
 */
export function extractMeetingCode(meetUrl: string): string | null {
  try {
    const url = new URL(meetUrl);
    if (url.hostname === 'meet.google.com') {
      return url.pathname.slice(1); // Remove leading slash
    }
    return null;
  } catch {
    return null;
  }
}

