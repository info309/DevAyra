/**
 * Utility to generate ICS (iCalendar) format calendar invitation files
 * These can be attached to emails to allow recipients to add meetings to their calendar
 */

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO format
  endTime: string; // ISO format
  organizerName?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  attendeeName?: string;
}

/**
 * Generates an ICS file content for a calendar event
 */
export function generateICSContent(event: CalendarEvent): string {
  // Format dates to ICS format (YYYYMMDDTHHMMSSZ)
  const formatDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startDate = formatDate(event.startTime);
  const endDate = formatDate(event.endTime);
  const now = formatDate(new Date().toISOString());
  
  // Generate unique ID for the event
  const uid = `${now}-${Math.random().toString(36).substring(7)}@ayra.app`;

  // Build ICS content
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ayra AI Assistant//Meeting Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${escapeICSText(event.title)}`,
  ];

  // Add optional fields
  if (event.description) {
    icsContent.push(`DESCRIPTION:${escapeICSText(event.description)}`);
  }

  if (event.location) {
    icsContent.push(`LOCATION:${escapeICSText(event.location)}`);
  }

  // Add organizer
  if (event.organizerEmail) {
    const organizerName = event.organizerName || event.organizerEmail;
    icsContent.push(`ORGANIZER;CN=${escapeICSText(organizerName)}:mailto:${event.organizerEmail}`);
  }

  // Add attendee
  if (event.attendeeEmail) {
    const attendeeName = event.attendeeName || event.attendeeEmail;
    icsContent.push(`ATTENDEE;CN=${escapeICSText(attendeeName)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${event.attendeeEmail}`);
  }

  // Add status and other fields
  icsContent.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Meeting Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return icsContent.join('\r\n');
}

/**
 * Escape special characters in ICS text fields
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Convert ICS content to base64 for attachment
 */
export function icsToBase64(icsContent: string): string {
  return btoa(icsContent);
}

/**
 * Create a calendar invitation attachment object
 */
export function createCalendarAttachment(event: CalendarEvent): {
  content: string;
  filename: string;
  mimeType: string;
  encoding: string;
} {
  const icsContent = generateICSContent(event);
  const base64Content = icsToBase64(icsContent);
  
  // Create filename from event title
  const safeTitle = event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeTitle}_invite.ics`;

  return {
    content: base64Content,
    filename,
    mimeType: 'text/calendar',
    encoding: 'base64'
  };
}

/**
 * Format a meeting invitation for email body with calendar details
 */
export function formatMeetingInvitationEmail(event: CalendarEvent): string {
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  
  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

  let emailBody = `You're invited to a meeting!\n\n`;
  emailBody += `📅 Meeting: ${event.title}\n`;
  emailBody += `🕐 When: ${formatDateTime(startDate)}\n`;
  emailBody += `⏱️ Duration: ${duration} minutes\n`;
  
  if (event.location) {
    emailBody += `📍 Location: ${event.location}\n`;
  }
  
  if (event.description) {
    emailBody += `\n📝 Details:\n${event.description}\n`;
  }

  emailBody += `\n✨ A calendar invitation is attached to this email. Click on it to add this meeting to your calendar.\n`;
  emailBody += `\nLooking forward to connecting!\n`;

  return emailBody;
}

