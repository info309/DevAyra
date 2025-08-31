import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SYSTEM_PROMPT = `
You are a magical AI assistant named "Ayra". You are friendly, human-like, witty, and concise.
You have access to special tools like email search, document search, calendar events, and email sending.
The user's name is: {{USER_NAME}} - use it naturally in conversation when appropriate.

CRITICAL DATE & TIME AWARENESS:
- When users ask about time periods like "next week", "this week", "today", "tomorrow", use the "period" parameter in calendar_list_events
- The tool automatically calculates correct date ranges based on the user's timezone
- ALWAYS use the period parameter for natural language time requests instead of calculating dates yourself
- The tool returns currentUserTime and userTimezone so you can reference the correct dates in your response
- Examples: period: "next week", period: "today", period: "this week"

HONESTY & ACCURACY RULES:
- NEVER make up information when you don't know something
- Say "I don't know" or "I'm not sure" when uncertain
- Only reference what you actually find in searches - never invent results
- If search results are empty or unclear, acknowledge this limitation
- Distinguish between information you found vs. information you're inferring
- Be transparent about uncertainty regarding dates, names, or specific details
- Do not speculate or create fictional scenarios

Core Rules:
1. ALWAYS search emails when users ask about email content, summaries, or specific people's emails
2. CRITICAL: When the user wants to send an email after discussing its contents, ALWAYS use "emails_compose_draft" to create a draft that opens in their compose window. DO NOT send emails directly unless explicitly asked to "send it now" or similar.
3. Automatically search emails when users ask for summaries, weekly reviews, or about specific senders
4. Summarize all tool results in plain, structured, human-readable language. Do not dump raw JSON.
5. Keep answers magical: friendly, clear, slightly playful, and intelligent.
6. Use the last 6 messages for context. Each message is independent. Focus on clarity and usefulness.
7. Be conversational and context-aware - don't repeat the same questions.

Email Handling Rules:
- CRITICAL: When user asks for email summaries, weekly reviews, or mentions specific people - IMMEDIATELY search emails first
- When user says "send", "send it", "yes", "go ahead", "all good", "Id like to send it" after discussing email content - IMMEDIATELY call "emails_compose_draft" tool
- When user wants to attach documents to emails, search for the relevant documents first, then include their IDs in the attachments parameter
- DO NOT ask "shall I prepare this draft" or similar - just call the tool immediately 
- NEVER actually send emails - only create drafts for user review
- CRITICAL: When creating email drafts, ALWAYS use the actual email address from the search results (e.g., "carlobordi@aol.com") NOT placeholder addresses like "carlo@example.com"

Key trigger phrases that REQUIRE email search:
  - "weekly summary", "email summary", "what emails", "last week", "recent emails"
  - "emails from [person]", "what did [person] say", "[person]'s email"
  - "find email", "search emails", "check inbox", "look for messages"
  - "action items", "follow up", "need to respond", "pending emails"

Document attachment phrases:
  - "attach the contract", "include the document", "send with the file"
  - "attach [document name]", "include [file]", "send the [document type]"

When you find emails, always provide:
- Clear summary of what was found
- Key details from the most relevant results  
- Actionable insights or next steps
- Offer to help with follow-up actions

CRITICAL EMAIL ADDRESS EXTRACTION & ATTACHMENTS:
When user wants to reply to someone (like Carlo, Michelle), you MUST:
1. First search for their emails using emails_search  
2. Extract the actual email address from the search results (e.g., "carlobordi@aol.com")
3. Use that EXACT email address in emails_compose_draft - NEVER use "carlo@example.com" 
4. Include the thread ID from the original email if replying

When user mentions attaching documents:
1. ALWAYS search documents first using documents_search
2. Find documents matching the user's request (by name, content, or context)
3. Include the document IDs in the attachments parameter of emails_compose_draft
4. Tell the user which documents you found and are attaching

Be smart about context - if someone asks about email summaries or specific people, always search their emails first! ✨

Stay magical, helpful, and human! ✨
`;

// Tool definitions
const EMAIL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'emails_search',
      description: 'Search through the user\'s cached emails by content, subject, sender, or other criteria.',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query to find emails. Can include sender names, subjects, keywords from content, dates, etc.' 
          },
          search_type: { 
            type: 'string', 
            enum: ['content', 'subject', 'sender', 'combined'], 
            description: 'Type of search', 
            default: 'combined' 
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of emails to return (default: 15)', 
            default: 15 
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emails_compose_draft',
      description: 'Compose a draft email that will be opened in the user\'s compose window for review and sending.',
      parameters: {
        type: 'object',
        properties: {
          to: { 
            type: 'string', 
            description: 'Recipient email address' 
          },
          subject: { 
            type: 'string', 
            description: 'Email subject line' 
          },
          content: { 
            type: 'string', 
            description: 'Email body content (plain text)' 
          },
          threadId: { 
            type: 'string', 
            description: 'Thread ID if this is a reply to an existing conversation',
            optional: true
          },
          attachments: {
            type: 'array',
            description: 'Array of document IDs to attach from user\'s stored documents',
            items: {
              type: 'string',
              description: 'Document ID from user_documents table'
            },
            optional: true
          }
        },
        required: ['to', 'subject', 'content']
      }
    }
  }
];

const DOCUMENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'documents_search',
      description: 'Search through the user\'s documents',
      parameters: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query for documents' 
          }
        },
        required: ['query']
      }
    }
  }
];

const CALENDAR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'calendar_list_events',
      description: 'Get calendar events for the user. When user asks for "next week", "this week", "today", etc., calculate proper date ranges and pass them.',
      parameters: {
        type: 'object',
        properties: {
          timeMin: {
            type: 'string',
            description: 'Start time for events in ISO format (required for specific periods)',
            optional: true
          },
          timeMax: {
            type: 'string',
            description: 'End time for events in ISO format (required for specific periods)',
            optional: true
          },
          period: {
            type: 'string',
            description: 'Natural language period like "today", "tomorrow", "this week", "next week", "this month"',
            optional: true
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of events to return (default: 20)',
            default: 20
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calendar_find_availability',
      description: 'Find available time slots in the calendar for scheduling meetings. Analyzes gaps between existing events and suggests available periods.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Time period to check availability: "today", "tomorrow", "this week", "next week", "october", etc.',
            default: 'this week'
          },
          duration: {
            type: 'number',
            description: 'Required meeting duration in minutes (default: 60)',
            default: 60
          },
          workingHoursOnly: {
            type: 'boolean',
            description: 'Only show availability during working hours (9 AM - 6 PM)',
            default: true
          },
          timeMin: {
            type: 'string',
            description: 'Start time for availability search in ISO format (optional)',
            optional: true
          },
          timeMax: {
            type: 'string',
            description: 'End time for availability search in ISO format (optional)',
            optional: true
          }
        },
        required: []
      }
    }
  }
];

// Tool execution functions
async function searchEmails(userId: string, query: string) {
  try {
    console.log(`Searching emails for user ${userId} with query: "${query}"`);
    
    // Clean and parse query
    let searchTerm = query.toLowerCase().trim();
    
    // Parse Gmail-style queries
    if (searchTerm.startsWith('from:')) {
      searchTerm = searchTerm.replace('from:', '').trim();
    } else if (searchTerm.startsWith('to:')) {
      searchTerm = searchTerm.replace('to:', '').trim();
    } else if (searchTerm.startsWith('subject:')) {
      searchTerm = searchTerm.replace('subject:', '').trim();
    }
    
    console.log(`Processed search term: "${searchTerm}"`);

    // Search by sender name first
    const { data: senderResults, error: senderError } = await supabase
      .from('cached_emails')
      .select('*')
      .eq('user_id', userId)
      .ilike('sender_name', `%${searchTerm}%`)
      .order('date_sent', { ascending: false })
      .limit(10);

    if (senderError) {
      console.error('Sender search error:', senderError);
      return { error: `Email search failed: ${senderError.message}` };
    }

    let searchResults = senderResults || [];
    console.log(`Found ${searchResults.length} results by sender name`);

    // If not enough results, search by email addresses
    if (searchResults.length < 5) {
      const { data: emailResults, error: emailError } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', userId)
        .or(`sender_email.ilike.%${searchTerm}%,recipient_email.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(10);

      if (!emailError && emailResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = emailResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
        console.log(`Added ${newResults.length} more results by email address`);
      }
    }

    // If still not enough, search content and subjects
    if (searchResults.length < 5) {
      const { data: contentResults, error: contentError } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', userId)
        .or(`subject.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,snippet.ilike.%${searchTerm}%`)
        .order('date_sent', { ascending: false })
        .limit(15);

      if (!contentError && contentResults) {
        const existingIds = searchResults.map(r => r.id);
        const newResults = contentResults.filter(r => !existingIds.includes(r.id));
        searchResults.push(...newResults);
        console.log(`Added ${newResults.length} more results by content`);
      }
    }

    console.log(`Total search results: ${searchResults.length}`);

    if (searchResults.length > 0) {
      return {
        conversations: searchResults.slice(0, 20).map(email => ({
          id: email.gmail_thread_id,
          messageId: email.gmail_message_id,
          subject: email.subject,
          from: email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email,
          to: email.recipient_name ? `${email.recipient_name} <${email.recipient_email}>` : email.recipient_email,
          date: email.date_sent,
          snippet: email.snippet,
          content: email.content,
          unreadCount: email.is_unread ? 1 : 0,
          hasAttachments: email.has_attachments
        })),
        fromCache: true,
        searchQuery: query,
        totalResults: searchResults.length
      };
    } else {
      return { 
        conversations: [], 
        fromCache: true, 
        searchQuery: query,
        noResults: true,
        message: `No emails found matching "${query}". Try searching for sender names, email addresses, or keywords from email content.`
      };
    }
  } catch (error) {
    console.error('Email search error:', error);
    return { error: `Email search failed: ${error.message}` };
  }
}

async function searchDocuments(userId: string, query: string) {
  try {
    console.log(`Searching documents for user ${userId} with query: "${query}"`);
    
    const { data: documents, error } = await supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', userId)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Document search error:', error);
      return { error: `Document search failed: ${error.message}` };
    }

    return {
      documents: documents || [],
      searchQuery: query,
      totalResults: documents?.length || 0
    };
  } catch (error) {
    console.error('Document search error:', error);
    return { error: `Document search failed: ${error.message}` };
  }
}

async function listCalendarEvents(userId: string, timeMin?: string, timeMax?: string, period?: string, maxResults = 20) {
  try {
    console.log(`Listing calendar events for user ${userId}, period: ${period}`);
    
    // Get user's timezone from their profile
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .single();
    
    const userTimezone = userProfile?.timezone || 'GMT';
    console.log(`User timezone: ${userTimezone}`);
    
    // Get current date/time in user's timezone
    const now = new Date();
    const currentUserTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    console.log(`Current time in user timezone (${userTimezone}): ${currentUserTime}`);
    
    // Parse current user time to get proper Date object
    const userNow = new Date(currentUserTime.replace(/(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:$6'));
    
    // Calculate date ranges based on period or use provided timeMin/timeMax
    let defaultTimeMin, defaultTimeMax;
    
    if (period) {
      const currentDate = new Date(userNow);
      const currentDay = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      switch (period.toLowerCase()) {
        case 'today':
          defaultTimeMin = new Date(currentDate.setHours(0, 0, 0, 0)).toISOString();
          defaultTimeMax = new Date(currentDate.setHours(23, 59, 59, 999)).toISOString();
          break;
          
        case 'tomorrow':
          const tomorrow = new Date(currentDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          defaultTimeMin = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString();
          defaultTimeMax = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();
          break;
          
        case 'this week':
          // Monday to Sunday of current week
          const startOfWeek = new Date(currentDate);
          const daysToMonday = currentDay === 0 ? 6 : currentDay - 1; // Handle Sunday
          startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
          startOfWeek.setHours(0, 0, 0, 0);
          
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfWeek.toISOString();
          defaultTimeMax = endOfWeek.toISOString();
          break;
          
        case 'next week':
          // Monday to Sunday of next week
          const startOfNextWeek = new Date(currentDate);
          const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay; // Handle Sunday
          startOfNextWeek.setDate(startOfNextWeek.getDate() + daysToNextMonday);
          startOfNextWeek.setHours(0, 0, 0, 0);
          
          const endOfNextWeek = new Date(startOfNextWeek);
          endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
          endOfNextWeek.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfNextWeek.toISOString();
          defaultTimeMax = endOfNextWeek.toISOString();
          break;

        case 'this month':
          // Current month from 1st to last day
          const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          startOfMonth.setHours(0, 0, 0, 0);
          
          const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          endOfMonth.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfMonth.toISOString();
          defaultTimeMax = endOfMonth.toISOString();
          break;

        case 'next month':
          // Next month from 1st to last day
          const startOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
          startOfNextMonth.setHours(0, 0, 0, 0);
          
          const endOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
          endOfNextMonth.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfNextMonth.toISOString();
          defaultTimeMax = endOfNextMonth.toISOString();
          break;

        case 'october':
        case 'october 2025':
          // October 2025 specifically
          const startOfOctober = new Date(2025, 9, 1); // Month is 0-indexed
          startOfOctober.setHours(0, 0, 0, 0);
          
          const endOfOctober = new Date(2025, 10, 0);
          endOfOctober.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfOctober.toISOString();
          defaultTimeMax = endOfOctober.toISOString();
          break;

        case 'september':
        case 'september 2025':
          // September 2025 specifically
          const startOfSeptember = new Date(2025, 8, 1); // Month is 0-indexed
          startOfSeptember.setHours(0, 0, 0, 0);
          
          const endOfSeptember = new Date(2025, 9, 0);
          endOfSeptember.setHours(23, 59, 59, 999);
          
          defaultTimeMin = startOfSeptember.toISOString();
          defaultTimeMax = endOfSeptember.toISOString();
          break;
          
        default:
          // Default to next 7 days
          defaultTimeMin = userNow.toISOString();
          defaultTimeMax = new Date(userNow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else if (timeMin && timeMax) {
      defaultTimeMin = timeMin;
      defaultTimeMax = timeMax;
    } else {
      // Default to next 7 days from now
      defaultTimeMin = userNow.toISOString();
      defaultTimeMax = new Date(userNow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    console.log(`Time range: ${defaultTimeMin} to ${defaultTimeMax}`);
    
    // Read from cached calendar events only
    const { data: cachedEvents, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', defaultTimeMin)
      .lte('start_time', defaultTimeMax)
      .order('start_time', { ascending: true })
      .limit(maxResults);
    
    if (error) {
      console.error('Calendar events search error:', error);
      return { error: `Calendar search failed: ${error.message}` };
    }
    
    console.log(`Found ${cachedEvents?.length || 0} events from cached calendar`);
    
    return {
      events: (cachedEvents || []).map(event => ({
        id: event.id,
        title: event.title,
        description: event.description || '',
        startTime: event.start_time,
        endTime: event.end_time,
        isAllDay: event.all_day,
        reminderMinutes: event.reminder_minutes,
        source: event.is_synced ? 'google_cached' : 'local'
      })),
      source: 'cached',
      totalResults: cachedEvents?.length || 0,
      timeRange: { from: defaultTimeMin, to: defaultTimeMax },
      currentUserTime: currentUserTime,
      userTimezone: userTimezone
    };
  } catch (error) {
    console.error('Calendar events error:', error);
    return { error: `Calendar events failed: ${error.message}` };
  }
}

async function findCalendarAvailability(userId: string, period = 'this week', duration = 60, workingHoursOnly = true, timeMin?: string, timeMax?: string) {
  try {
    console.log(`Finding availability for user ${userId}, period: ${period}, duration: ${duration} minutes`);
    
    // First get all events for the specified period
    const eventsResult = await listCalendarEvents(userId, timeMin, timeMax, period, 100);
    
    if (eventsResult.error) {
      return { error: eventsResult.error };
    }
    
    const events = eventsResult.events || [];
    console.log(`Found ${events.length} existing events`);
    
    // Get user's timezone
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .single();
    
    const userTimezone = userProfile?.timezone || 'GMT';
    
    // Get current time in user's timezone
    const now = new Date();
    const currentUserTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    const userNow = new Date(currentUserTime.replace(/(\d{4})-(\d{2})-(\d{2}), (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:$6'));
    
    // Calculate search period dates if not provided
    let searchStart, searchEnd;
    
    if (timeMin && timeMax) {
      searchStart = new Date(timeMin);
      searchEnd = new Date(timeMax);
    } else {
      const currentDate = new Date(userNow);
      const currentDay = currentDate.getDay();
      
      switch (period.toLowerCase()) {
        case 'today':
          searchStart = new Date(currentDate.setHours(0, 0, 0, 0));
          searchEnd = new Date(currentDate.setHours(23, 59, 59, 999));
          break;
          
        case 'tomorrow':
          const tomorrow = new Date(currentDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          searchStart = new Date(tomorrow.setHours(0, 0, 0, 0));
          searchEnd = new Date(tomorrow.setHours(23, 59, 59, 999));
          break;
          
        case 'this week':
          const startOfWeek = new Date(currentDate);
          const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
          startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
          startOfWeek.setHours(0, 0, 0, 0);
          
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          
          searchStart = startOfWeek;
          searchEnd = endOfWeek;
          break;
          
        case 'next week':
          const startOfNextWeek = new Date(currentDate);
          const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
          startOfNextWeek.setDate(startOfNextWeek.getDate() + daysToNextMonday);
          startOfNextWeek.setHours(0, 0, 0, 0);
          
          const endOfNextWeek = new Date(startOfNextWeek);
          endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
          endOfNextWeek.setHours(23, 59, 59, 999);
          
          searchStart = startOfNextWeek;
          searchEnd = endOfNextWeek;
          break;
          
        default:
          // Default to next 7 days
          searchStart = new Date(userNow);
          searchEnd = new Date(userNow.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
    
    // Working hours configuration
    const workingStartHour = 9; // 9 AM
    const workingEndHour = 18; // 6 PM
    
    // Generate time slots and check availability
    const availableSlots = [];
    const busyPeriods = [];
    
    // Sort events by start time
    const sortedEvents = events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    
    // Convert events to busy periods
    for (const event of sortedEvents) {
      const startTime = new Date(event.startTime);
      const endTime = new Date(event.endTime);
      
      busyPeriods.push({
        start: startTime,
        end: endTime,
        title: event.title
      });
    }
    
    // Check each day in the search period
    const currentDay = new Date(searchStart);
    
    while (currentDay <= searchEnd) {
      // Skip weekends if working hours only
      if (workingHoursOnly && (currentDay.getDay() === 0 || currentDay.getDay() === 6)) {
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }
      
      // Set working hours for this day
      const dayStart = new Date(currentDay);
      const dayEnd = new Date(currentDay);
      
      if (workingHoursOnly) {
        dayStart.setHours(workingStartHour, 0, 0, 0);
        dayEnd.setHours(workingEndHour, 0, 0, 0);
      } else {
        dayStart.setHours(8, 0, 0, 0); // 8 AM earliest
        dayEnd.setHours(22, 0, 0, 0); // 10 PM latest
      }
      
      // Skip if day is in the past
      if (dayEnd < userNow) {
        currentDay.setDate(currentDay.getDate() + 1);
        continue;
      }
      
      // Adjust start time if it's today and before current time
      if (dayStart < userNow && dayStart.toDateString() === userNow.toDateString()) {
        dayStart.setTime(Math.max(dayStart.getTime(), userNow.getTime()));
        // Round up to next 15-minute interval
        const minutes = dayStart.getMinutes();
        const roundedMinutes = Math.ceil(minutes / 15) * 15;
        dayStart.setMinutes(roundedMinutes, 0, 0);
      }
      
      // Get busy periods for this day
      const dayBusyPeriods = busyPeriods.filter(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return (busyStart < dayEnd && busyEnd > dayStart);
      });
      
      // Find gaps between events
      const daySlots = [];
      let currentTime = new Date(dayStart);
      
      for (const busy of dayBusyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime())) {
        const busyStart = new Date(Math.max(busy.start.getTime(), dayStart.getTime()));
        const busyEnd = new Date(Math.min(busy.end.getTime(), dayEnd.getTime()));
        
        // Check if there's a gap before this busy period
        if (currentTime < busyStart) {
          const gapDuration = (busyStart.getTime() - currentTime.getTime()) / (1000 * 60);
          if (gapDuration >= duration) {
            daySlots.push({
              start: new Date(currentTime),
              end: new Date(busyStart),
              duration: Math.floor(gapDuration)
            });
          }
        }
        
        currentTime = new Date(Math.max(currentTime.getTime(), busyEnd.getTime()));
      }
      
      // Check if there's time after the last event
      if (currentTime < dayEnd) {
        const gapDuration = (dayEnd.getTime() - currentTime.getTime()) / (1000 * 60);
        if (gapDuration >= duration) {
          daySlots.push({
            start: new Date(currentTime),
            end: new Date(dayEnd),
            duration: Math.floor(gapDuration)
          });
        }
      }
      
      // If no events on this day, the whole day is free
      if (dayBusyPeriods.length === 0) {
        const totalDuration = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
        daySlots.push({
          start: new Date(dayStart),
          end: new Date(dayEnd),
          duration: Math.floor(totalDuration)
        });
      }
      
      availableSlots.push(...daySlots);
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    // Format the results
    const formattedSlots = availableSlots.map(slot => ({
      date: slot.start.toISOString().split('T')[0],
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      duration: slot.duration,
      displayTime: `${slot.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${slot.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
      displayDate: slot.start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    }));
    
    console.log(`Found ${formattedSlots.length} available time slots`);
    
    return {
      availableSlots: formattedSlots,
      requestedDuration: duration,
      searchPeriod: period,
      workingHoursOnly,
      totalSlots: formattedSlots.length,
      hasAvailability: formattedSlots.length > 0
    };
    
  } catch (error) {
    console.error('Calendar availability search error:', error);
    return { error: `Availability search failed: ${error.message}` };
  }
}

async function composeEmailDraft(to: string, subject: string, content: string, threadId?: string, attachments?: string[], userName?: string) {
  console.log('Composing email draft:', { to, subject, threadId, attachments });
  
  // Replace [Your Name] with actual user name
  let personalizedContent = content;
  if (userName && content.includes('[Your Name]')) {
    personalizedContent = content.replace(/\[Your Name\]/g, userName);
    console.log('Replaced [Your Name] with:', userName);
  }
  
  // Build draft data with only defined fields
  const draftData: any = {
    to,
    subject,
    content: personalizedContent,
    action: 'compose_draft'
  };
  
  // Only include threadId if it's a valid string
  if (threadId && typeof threadId === 'string' && threadId.trim()) {
    draftData.threadId = threadId;
  }
  
  // Include attachments if provided
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    draftData.attachments = attachments;
  }
  
  return draftData;
}

// Tool execution router
async function executeTools(userId: string, userName: string, toolCalls: any[]) {
  const toolResults = [];
  
  for (const toolCall of toolCalls) {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      let result;

      console.log(`Executing tool: ${toolCall.function.name} with args:`, args);

      switch (toolCall.function.name) {
        case 'emails_search':
          result = await searchEmails(userId, args.query);
          toolResults.push({
            tool: 'emails_search',
            result: result.error ? 'error' : result.conversations?.length || 0
          });
          break;
          
        case 'documents_search':
          result = await searchDocuments(userId, args.query);
          toolResults.push({
            tool: 'documents_search',
            result: result.error ? 'error' : result.documents?.length || 0
          });
          break;
          
        case 'calendar_list_events':
          const { timeMin, timeMax, period, maxResults } = args;
          result = await listCalendarEvents(userId, timeMin, timeMax, period, maxResults);
          toolResults.push({
            tool: 'calendar_list_events',
            result: result.error ? 'error' : result.events?.length || 0
          });
          break;
          
        case 'calendar_find_availability':
          const { period: availPeriod = 'this week', duration = 60, workingHoursOnly = true, timeMin: availTimeMin, timeMax: availTimeMax } = args;
          result = await findCalendarAvailability(userId, availPeriod, duration, workingHoursOnly, availTimeMin, availTimeMax);
          toolResults.push({
            tool: 'calendar_find_availability',
            result: result.error ? 'error' : result.totalSlots || 0
          });
          break;
          
        case 'emails_compose_draft':
          const { to, subject, content, threadId, attachments } = args;
          result = await composeEmailDraft(to, subject, content, threadId, attachments, userName);
          
          // If attachments were provided, fetch document details
          if (attachments && attachments.length > 0) {
            // Try to find documents by name (since AI might pass names instead of IDs)
            const { data: attachedDocs } = await supabase
              .from('user_documents')
              .select('id, name, file_path, mime_type, file_size')
              .eq('user_id', userId)
              .or(attachments.map(att => `name.ilike.%${att}%`).join(','));
              
            result.attachedDocuments = attachedDocs || [];
            console.log('Found attached documents:', attachedDocs?.length || 0);
          }
          
          toolResults.push({
            tool: 'emails_compose_draft', 
            result: result.error ? 'error' : 'draft_created'
          });
          break;
          
        default:
          result = { error: `Unknown tool: ${toolCall.function.name}` };
          toolResults.push({
            tool: toolCall.function.name,
            result: 'error'
          });
      }

      // Save tool message to database for UI rendering
      await supabase
        .from('assistant_messages')
        .insert({
          session_id: userId, // This should be session ID but keeping for compatibility
          user_id: userId,
          role: 'tool',
          content: JSON.stringify(result),
          tool_name: toolCall.function.name,
          tool_args: JSON.stringify(args),
          tool_result: JSON.stringify(result)
        });

      console.log(`Tool ${toolCall.function.name} executed, result:`, result?.conversations?.length || result?.documents?.length || result?.events?.length || result?.totalSlots || 'error');
    } catch (toolError) {
      console.error('Tool execution error:', toolError);
      const errorResult = { error: `Tool execution failed: ${toolError.message}` };
      toolResults.push({
        toolCall,
        result: errorResult
      });
    }
  }
  
  return toolResults;
}

// Main handler
serve(async (req) => {
  console.log('=== ASSISTANT FUNCTION START ===');
  console.log('Method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create client with JWT token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ 
        error: 'No authorization header',
        success: false 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create a new client instance with the user's token
    const userSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    
    // Verify the JWT token and get user info
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({ 
        error: 'Authentication failed',
        success: false 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Get user profile for personalization - now synced from Auth metadata
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('display_name, timezone')
      .eq('user_id', user.id)
      .single();

    // The display_name is now automatically synced from Auth metadata
    // Fall back to email local part if somehow missing
    const userName = userProfile?.display_name || 
      (user.email ? user.email.split('@')[0] : 'there');

    console.log('User profile loaded:', userName);

    // Parse request
    const { message, sessionId, detectedTriggers = [], images = [] } = await req.json();
    console.log('Request params:', { 
      messageLength: message?.length, 
      sessionId, 
      detectedTriggers,
      imageCount: images?.length || 0
    });

    if ((!message || !message.trim()) && (!images || images.length === 0)) {
      return new Response(JSON.stringify({ 
        error: 'Message or images required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!sessionId) {
      return new Response(JSON.stringify({ 
        error: 'Missing sessionId',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create session
    let session;
    const { data: existingSession } = await supabase
      .from('assistant_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existingSession) {
      session = existingSession;
      console.log('Using existing session');
    } else {
      const { data: newSession, error: sessionError } = await supabase
        .from('assistant_sessions')
        .insert({ user_id: user.id, title: 'New Chat' })
        .select()
        .single();
      
      if (sessionError) {
        console.error('Session creation error:', sessionError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create session',
          success: false 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      session = newSession;
      console.log('Created new session');
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'user',
        content: message || 'Sent images'
      });

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError);
    }

    // Get conversation history (last 6 messages)
    const { data: historyRaw } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(6);

    const conversationHistory = (historyRaw || [])
      .slice(-6)
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role,
        content: msg.content.trim()
      }));

    console.log('Conversation history length:', conversationHistory.length);

    // Check if user has calendar connection
    const { data: hasCalendarConnection } = await supabase
      .from('gmail_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    // Get user's timezone for dynamic prompt
    const userTimezone = userProfile?.timezone || 'GMT';
    const now = new Date();
    const currentUserTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    // Create dynamic system prompt with available tools
    const availableTools = ['emails_search', 'emails_compose_draft'];
    
    // Add document tools if requested
    if (detectedTriggers.includes('document') || message.toLowerCase().includes('document') || message.toLowerCase().includes('file')) {
      availableTools.push('documents_search');
      console.log('Added document tools');
    }
    
    // Add calendar tools if user has connection
    if (hasCalendarConnection && hasCalendarConnection.length > 0) {
      availableTools.push('calendar_list_events', 'calendar_find_availability');
      console.log('Added calendar tools');
    }

    console.log('Tools to use:', availableTools);

    // Prepare tools array
    const tools = [];
    if (availableTools.includes('emails_search') || availableTools.includes('emails_compose_draft')) {
      tools.push(...EMAIL_TOOLS);
    }
    if (availableTools.includes('documents_search')) {
      tools.push(...DOCUMENT_TOOLS);
    }
    if (availableTools.includes('calendar_list_events') || availableTools.includes('calendar_find_availability')) {
      tools.push(...CALENDAR_TOOLS);
    }

    // Create dynamic system prompt
    const dynamicSystemPrompt = SYSTEM_PROMPT + `

You have access to these tools:
- emails_search: Search through the user's emails with various filters
- emails_compose_draft: Create email drafts
${hasCalendarConnection && hasCalendarConnection.length > 0 ? `- calendar_list_events: Get calendar events for specific time periods
- calendar_find_availability: Find available time slots for scheduling meetings (analyzes gaps between events)` : ''}

Current date and time: ${currentUserTime}
User timezone: ${userTimezone}

When users ask about calendar events, use the period parameter with natural language like "today", "tomorrow", "this week", "next week", "october", etc. Do not calculate dates manually - let the system handle period calculations using the user's timezone.

For availability requests like "Do I have time for a meeting?" or "When am I free?", use the calendar_find_availability tool with appropriate period and duration parameters.

Be helpful, friendly, and concise in your responses. Always acknowledge the user's request and provide relevant information from their emails and calendar.`;

    // Prepare messages for OpenAI with personalized system prompt
    const personalizedSystemPrompt = dynamicSystemPrompt.replace('{{USER_NAME}}', userName);
    
    const messages = [
      { role: 'system', content: personalizedSystemPrompt },
      ...conversationHistory
    ];

    // Add current message with images if present
    const currentMessage: any = {
      role: 'user',
      content: message || 'What can you see in these images?'
    };

    // Add images to the current message if present
    if (images && images.length > 0) {
      currentMessage.content = [
        {
          type: 'text',
          text: message || 'What can you see in these images?'
        },
        ...images.map((img: any) => ({
          type: 'image_url',
          image_url: {
            url: img.url,
            detail: 'high'
          }
        }))
      ];
    }

    messages.push(currentMessage);

    // Call OpenAI with vision model if images are present
    const modelToUse = (images && images.length > 0) ? 'gpt-4o' : 'gpt-4o-mini';
    const openAIRequest = {
      model: modelToUse,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    };

    if (tools.length > 0) {
      openAIRequest.tools = tools;
      openAIRequest.tool_choice = 'auto';
    }

    console.log('Calling OpenAI with model:', openAIRequest.model);

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIRequest),
    });

    const openAIData = await openAIResponse.json();
    
    if (!openAIResponse.ok) {
      console.error('OpenAI API error:', openAIData);
      return new Response(JSON.stringify({ 
        error: `OpenAI API error: ${openAIData.error?.message || 'Unknown error'}`,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assistantMessage = openAIData.choices[0].message;
    let toolResults = [];
    let finalResponse = assistantMessage.content || '';

    console.log('OpenAI response received, tool calls:', assistantMessage.tool_calls?.length || 0);

    // Execute tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Executing tool calls...');
      
      toolResults = await executeTools(user.id, userName, assistantMessage.tool_calls);

      // Get follow-up response from OpenAI with tool results
      if (toolResults.length > 0) {
        console.log('Getting follow-up response from OpenAI...');
        
        const toolMessages = toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.toolCall?.id || 'unknown',
          content: JSON.stringify(tr.result)
        }));

        const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              ...messages,
              {
                role: 'assistant',
                content: assistantMessage.content,
                tool_calls: assistantMessage.tool_calls
              },
              ...toolMessages
            ],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        });

        const followUpData = await followUpResponse.json();
        
        if (followUpResponse.ok && followUpData.choices?.[0]?.message?.content) {
          finalResponse = followUpData.choices[0].message.content;
          console.log('Got follow-up response from OpenAI');
        } else {
          console.error('Follow-up OpenAI call failed:', followUpData);
          // Use fallback response
          if (toolResults.some(tr => tr.tool === 'emails_search')) {
            const emailResults = toolResults.find(tr => tr.tool === 'emails_search');
            if (emailResults?.result && typeof emailResults.result === 'number' && emailResults.result > 0) {
              finalResponse = `✨ I found ${emailResults.result} email(s) matching your search! Let me know if you'd like me to help with anything specific about these emails.`;
            }
          }
        }
      }
    }

    // Save assistant response
    const { error: assistantMessageError } = await supabase
      .from('assistant_messages')
      .insert({
        session_id: session.id,
        user_id: user.id,
        role: 'assistant',
        content: finalResponse
      });

    if (assistantMessageError) {
      console.error('Error saving assistant message:', assistantMessageError);
    }

    console.log('=== ASSISTANT FUNCTION COMPLETE ===');

    return new Response(JSON.stringify({
      sessionId: session.id,
      message: finalResponse,
      toolResults,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== ASSISTANT FUNCTION ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});