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

CRITICAL EMAIL DRAFT CONSISTENCY RULE - THIS IS MANDATORY:
- When you show the user a detailed email draft in your response, you MUST pass that EXACT SAME content to emails_compose_draft
- The content parameter in emails_compose_draft MUST be identical to what you show the user word-for-word
- NEVER show the user a formatted email with greetings, body paragraphs, and signatures, then pass only a brief summary to the tool
- NEVER create brief summaries in the tool while describing detailed emails to the user
- Example: If you tell the user "Hi Michelle, Thank you for your email regarding the Direct Debit setup. I will look into the transactions..." then the content parameter must contain that EXACT text including the greeting, body, and signature
- If you show the user a multi-line formatted email, pass that EXACT multi-line formatted email to the tool
- This rule applies to ALL email drafts without exception

CRITICAL DATE & TIME AWARENESS:
- Current date and time: {{CURRENT_TIME}} ({{USER_TIMEZONE}})
- When users ask about time periods like "next week", "this week", "today", "tomorrow", use the "period" parameter in calendar_list_events
- The tool automatically calculates correct date ranges based on the user's timezone
- ALWAYS use the period parameter for natural language time requests instead of calculating dates yourself
- The tool returns currentUserTime and userTimezone so you can reference the correct dates in your response
- Examples: period: "next week", period: "today", period: "this week"

CALENDAR EVENT CREATION:
- ALWAYS prefer using when_text for scheduling (e.g., "next Monday 3pm", "tomorrow 8:30", "in 2 hours")
- Let the server parse natural language dates - don't calculate ISO timestamps yourself
- If the server returns an ambiguity message, ask a clarifying question and retry
- Examples: when_text: "next Monday 3pm", when_text: "tomorrow 8:30 for 45 minutes"

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
- CRITICAL EMAIL CONTENT CONSISTENCY: The content you tell the user you're writing MUST be identical to what you pass to emails_compose_draft. Do not create brief summaries in the tool while describing detailed emails to the user.
- MANDATORY: If you show the user a formatted email with "Hi [Name]," greeting, multiple paragraphs, and "Best, [Your Name]" signature, you MUST pass that EXACT formatted text to the emails_compose_draft tool, not a shortened summary

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
      name: 'calendar_create_event',
      description: 'Create a new calendar event for the user. PREFER using when_text for natural language scheduling (e.g., "next Monday 3pm") instead of calculating ISO timestamps yourself.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Event title/name'
          },
          description: {
            type: 'string',
            description: 'Optional event description or details',
            optional: true
          },
          when_text: {
            type: 'string',
            description: 'Natural language time like "next Monday 3pm", "tomorrow 8:30", "in 2 hours", "Mon 1st 15:00-16:00". Use this instead of start_time/end_time when user provides natural language.',
            optional: true
          },
          duration_minutes: {
            type: 'number',
            description: 'Duration in minutes if no end time specified in when_text (default: 60)',
            default: 60,
            optional: true
          },
          start_time: {
            type: 'string',
            description: 'Event start time in ISO format (e.g., 2024-12-31T14:00:00Z). Only use if when_text is not provided.',
            optional: true
          },
          end_time: {
            type: 'string',
            description: 'Event end time in ISO format (e.g., 2024-12-31T15:00:00Z). Only use if when_text is not provided.',
            optional: true
          },
          all_day: {
            type: 'boolean',
            description: 'Whether this is an all-day event (default: false)',
            default: false,
            optional: true
          },
          reminder_minutes: {
            type: 'number',
            description: 'Minutes before event to send reminder (default: 15)',
            default: 15,
            optional: true
          }
        },
        required: ['title']
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
    let dateRange = null;
    
    // Check for date-related queries and parse them
    const datePatterns = [
      /last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /this (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})(st|nd|rd|th)?/i,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})(st|nd|rd|th)?/i,
      /last week/i,
      /this week/i,
      /today/i,
      /yesterday/i
    ];

    // Parse Gmail-style date queries first
    const gmailAfterMatch = searchTerm.match(/after:(\d{4}-\d{2}-\d{2})/);
    const gmailBeforeMatch = searchTerm.match(/before:(\d{4}-\d{2}-\d{2})/);
    
    if (gmailAfterMatch || gmailBeforeMatch) {
      console.log('Detected Gmail-style date query');
      try {
        let startDate = null;
        let endDate = null;
        
        if (gmailAfterMatch) {
          startDate = new Date(gmailAfterMatch[1]);
          startDate.setHours(0, 0, 0, 0);
          console.log('Gmail after date:', startDate.toISOString());
        }
        
        if (gmailBeforeMatch) {
          endDate = new Date(gmailBeforeMatch[1]);
          endDate.setHours(23, 59, 59, 999);
          console.log('Gmail before date:', endDate.toISOString());
        }
        
        // If only one date is specified, create a single day range
        if (startDate && !endDate) {
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 1);
          endDate.setHours(23, 59, 59, 999);
        } else if (!startDate && endDate) {
          startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 1);  
          startDate.setHours(0, 0, 0, 0);
        }
        
        if (startDate && endDate) {
          dateRange = { start: startDate, end: endDate };
          console.log(`Parsed Gmail date range:`, dateRange);
        }
      } catch (gmailDateError) {
        console.warn('Gmail date parsing failed:', gmailDateError);
      }
    }
    
    // If no Gmail date found, try natural language patterns
    if (!dateRange) {
      // Parse date expressions
      for (const pattern of datePatterns) {
        const match = searchTerm.match(pattern);
        if (match) {
          console.log(`Detected date pattern: ${match[0]}`);
          
          try {
            const now = new Date();
            let targetDate = new Date();
            
            if (match[0].includes('last thursday')) {
              // Find last Thursday
              const today = now.getDay(); // 0 = Sunday, 4 = Thursday
              const daysBack = today >= 4 ? today - 4 : today + 3; // Days since last Thursday
              targetDate.setDate(now.getDate() - daysBack - 7); // Go back to previous week's Thursday
            } else if (match[0].includes('thursday') && match[0].includes('august') && match[0].includes('28')) {
              // Parse "Thursday, August 28th" - use current year
              targetDate = new Date(now.getFullYear(), 7, 28); // August is month 7 (0-indexed)
            } else if (match[0].includes('yesterday')) {
              targetDate.setDate(now.getDate() - 1);
            } else if (match[0].includes('today')) {
              targetDate = now;
            } else if (match[0].includes('last week')) {
              // Last week range
              const startOfLastWeek = new Date(now);
              startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
              const endOfLastWeek = new Date(startOfLastWeek);
              endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
              dateRange = { start: startOfLastWeek, end: endOfLastWeek };
            } else if (match[0].includes('this week')) {
              // This week range  
              const startOfWeek = new Date(now);
              startOfWeek.setDate(now.getDate() - now.getDay());
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              dateRange = { start: startOfWeek, end: endOfWeek };
            }
            
            if (!dateRange && targetDate) {
              // Single day range
              const startOfDay = new Date(targetDate);
              startOfDay.setHours(0, 0, 0, 0);
              const endOfDay = new Date(targetDate);
              endOfDay.setHours(23, 59, 59, 999);
              dateRange = { start: startOfDay, end: endOfDay };
            }
            
            console.log(`Parsed date range:`, dateRange);
          } catch (dateError) {
            console.warn('Date parsing failed:', dateError);
          }
          
          break; // Stop after first match
        }
      }
    }
    
    let searchResults = [];
    
    // If we have a date range, search by date first
    if (dateRange) {
      console.log(`Searching emails between ${dateRange.start.toISOString()} and ${dateRange.end.toISOString()}`);
      
      const { data: dateResults, error: dateError } = await supabase
        .from('cached_emails')
        .select('*')
        .eq('user_id', userId)
        .gte('date_sent', dateRange.start.toISOString())
        .lte('date_sent', dateRange.end.toISOString())
        .order('date_sent', { ascending: false })
        .limit(50);

      if (!dateError && dateResults) {
        searchResults = dateResults;
        console.log(`Found ${searchResults.length} results by date range`);
      } else {
        console.error('Date search error:', dateError);
      }
    }
    
    // If no date results or no date query, fall back to text search
    if (searchResults.length === 0) {
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

      searchResults = senderResults || [];
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
    
    // Map common timezone names to proper IANA timezone identifiers
    let userTimezone = userProfile?.timezone || 'GMT';
    
    // Handle common timezone mappings
    const timezoneMap: Record<string, string> = {
      'GMT': 'Europe/London', // This properly handles GMT/BST transitions
      'UTC': 'UTC',
      'EST': 'America/New_York',
      'PST': 'America/Los_Angeles',
      'CST': 'America/Chicago',
      'MST': 'America/Denver'
    };
    
    // Use IANA timezone if available, otherwise keep the original
    const ianaTimezone = timezoneMap[userTimezone] || userTimezone;
    console.log(`User timezone: ${userTimezone} -> ${ianaTimezone}`);
    
    // Get current date/time in user's timezone using proper IANA timezone
    const now = new Date();
    const currentUserTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: ianaTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    console.log(`Current time in user timezone (${ianaTimezone}): ${currentUserTime}`);
    
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
          // Check for specific day patterns like "next friday", "this monday", etc.
          const dayMatch = period.toLowerCase().match(/(this|next|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
          
          if (dayMatch) {
            const [, timeRef, dayName] = dayMatch;
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDay = dayNames.indexOf(dayName); // 0 = Sunday, 1 = Monday, etc.
            
            // Use user's current date in their timezone 
            const userCurrentDate = new Date(userNow);
            const currentDay = userCurrentDate.getDay();
            
            console.log(`Current user date: ${userCurrentDate.toDateString()}, day: ${currentDay}`);
            console.log(`Looking for ${timeRef} ${dayName} (day ${targetDay})`);
            
            let targetDate = new Date(userCurrentDate);
            
            if (timeRef === 'next') {
              // Find next occurrence of the day
              let daysToAdd = targetDay - currentDay;
              if (daysToAdd <= 0) daysToAdd += 7; // If today or past, go to next week
              targetDate.setDate(targetDate.getDate() + daysToAdd);
            } else if (timeRef === 'this') {
              // Find this week's occurrence
              let daysToAdd = targetDay - currentDay;
              if (daysToAdd < 0) daysToAdd += 7; // If past in week, go to next occurrence
              targetDate.setDate(targetDate.getDate() + daysToAdd);
            } else if (timeRef === 'last') {
              // Find last occurrence of the day
              let daysToSubtract = currentDay - targetDay;
              if (daysToSubtract <= 0) daysToSubtract += 7; // If today or future, go to last week
              targetDate.setDate(targetDate.getDate() - daysToSubtract);
            }
            
            console.log(`Calculated target date: ${targetDate.toDateString()}`);
            
            // Create separate date objects to avoid mutation
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            defaultTimeMin = startOfDay.toISOString();
            defaultTimeMax = endOfDay.toISOString();
            console.log(`Final date range: ${defaultTimeMin} to ${defaultTimeMax}`);
          } else {
            // Default to next 7 days
            defaultTimeMin = userNow.toISOString();
            defaultTimeMax = new Date(userNow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          }
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
    
    // Check if user has an active Gmail connection
    const { data: gmailConnection } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    // If no active connection, check if there's an inactive one with error
    if (!gmailConnection) {
      const { data: inactiveConnection } = await supabase
        .from('gmail_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (inactiveConnection && inactiveConnection.last_error) {
        return {
          requiresReconnect: true,
          message: inactiveConnection.last_error,
          events: [],
          currentUserTime,
          userTimezone
        };
      }
    }

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
      userTimezone: ianaTimezone
    };
  } catch (error) {
    console.error('Calendar events error:', error);
    return { error: `Calendar events failed: ${error.message}` };
  }
}

// Fallback date parsing for common phrases
function fallbackDateParsing(when_text: string, userTimezone: string) {
  const now = new Date();
  const text = when_text.toLowerCase().trim();
  
  // Parse "next thursday at 10am" type phrases
  const nextDayMatch = text.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?/);
  if (nextDayMatch) {
    const dayName = nextDayMatch[1];
    const hour = parseInt(nextDayMatch[2]);
    const minutes = nextDayMatch[3] ? parseInt(nextDayMatch[3].substring(1)) : 0;
    const ampm = nextDayMatch[4] || (hour < 12 ? 'am' : 'pm');
    
    const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName);
    const currentDay = now.getDay();
    let daysUntilNext = dayIndex - currentDay;
    if (daysUntilNext <= 0) daysUntilNext += 7;
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntilNext);
    
    let finalHour = hour;
    if (ampm === 'pm' && hour !== 12) finalHour += 12;
    if (ampm === 'am' && hour === 12) finalHour = 0;
    
    targetDate.setHours(finalHour, minutes, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setHours(targetDate.getHours() + 1); // Default 1 hour duration
    
    return {
      start: targetDate.toISOString(),
      end: endDate.toISOString()
    };
  }
  
  // Parse "thursday at 10am" type phrases (this week)
  const thisDayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?/);
  if (thisDayMatch) {
    const dayName = thisDayMatch[1];
    const hour = parseInt(thisDayMatch[2]);
    const minutes = thisDayMatch[3] ? parseInt(thisDayMatch[3].substring(1)) : 0;
    const ampm = thisDayMatch[4] || (hour < 12 ? 'am' : 'pm');
    
    const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName);
    const currentDay = now.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    
    let finalHour = hour;
    if (ampm === 'pm' && hour !== 12) finalHour += 12;
    if (ampm === 'am' && hour === 12) finalHour = 0;
    
    targetDate.setHours(finalHour, minutes, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setHours(targetDate.getHours() + 1); // Default 1 hour duration
    
    return {
      start: targetDate.toISOString(),
      end: endDate.toISOString()
    };
  }
  
  return null;
}

async function createCalendarEvent(userId: string, eventData: any) {
  try {
    console.log(`Creating calendar event for user ${userId}:`, eventData);
    
    const { 
      title, 
      when_text, 
      duration_minutes = 60, 
      start_time, 
      end_time, 
      description = '', 
      all_day = false, 
      reminder_minutes = 15,
      client_timezone 
    } = eventData;
    
    if (!title) {
      return { error: 'Title is required' };
    }
    
    let finalStartTime, finalEndTime, finalAllDay = all_day;
    
    // Parse natural language if when_text is provided
    if (when_text) {
      console.log(`Parsing natural language: "${when_text}"`);
      
      try {
        // Get user timezone
        let userTimezone = 'UTC';
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('timezone')
            .eq('user_id', userId)
            .maybeSingle();
          userTimezone = profile?.timezone || client_timezone || 'UTC';
        } catch (tzError) {
          console.log('Using client timezone fallback:', client_timezone || 'UTC');
          userTimezone = client_timezone || 'UTC';
        }
        
        console.log(`Using timezone: ${userTimezone}`);
        
        // Import chrono for natural language date parsing
        const { parse } = await import('https://esm.sh/chrono-node@2.7.5');
        const { fromZonedTime, toZonedTime } = await import('https://esm.sh/date-fns-tz@2.1.0');
        const { addMinutes, format } = await import('https://esm.sh/date-fns@2.30.0');
        
        // Parse the natural language date
        const referenceDate = toZonedTime(new Date(), userTimezone);
        const parsed = parse(when_text, referenceDate, { forwardDate: true });
        console.log(`Parsed results:`, parsed);
        
        if (!parsed || parsed.length === 0) {
          console.log(`No parse results for: "${when_text}"`);
          return { 
            error: `I couldn't understand the time "${when_text}". Could you be more specific? For example: "next Monday 3pm", "tomorrow 8:30", or "September 1st at 2pm"` 
          };
        }
        
        const result = parsed[0];
        console.log(`First parse result:`, result);
        
        // Check if we have a confident parse
        if (!result.start || !result.start.date()) {
          console.log(`Parse result missing start date:`, result.start);
          return { 
            error: `The time "${when_text}" is ambiguous. Could you specify the exact date and time? For example: "Monday September 1st at 3pm"` 
          };
        }
        
        let startLocal = result.start.date();
        let endLocal;
        
        // Check if end time was detected
        if (result.end && result.end.date()) {
          endLocal = result.end.date();
        } else {
          // No end time detected, add duration
          endLocal = addMinutes(startLocal, duration_minutes);
        }
        
        // Check if this should be an all-day event (no specific time mentioned)
        if (!result.start.get('hour') && !result.start.get('minute')) {
          finalAllDay = true;
          // For all-day events, set to start of day and end of day
          startLocal.setHours(0, 0, 0, 0);
          endLocal = new Date(startLocal);
          endLocal.setHours(23, 59, 59, 999);
        }
        
        // Convert to UTC for storage
        finalStartTime = fromZonedTime(startLocal, userTimezone).toISOString();
        finalEndTime = fromZonedTime(endLocal, userTimezone).toISOString();
        
        console.log(`Parsed times: ${format(startLocal, 'PPpp')} - ${format(endLocal, 'PPpp')} (${userTimezone})`);
        console.log(`UTC times: ${finalStartTime} - ${finalEndTime}`);
        
      } catch (parseError) {
        console.error('Date parsing error:', parseError);
        
        // Fallback: Try manual parsing for common phrases
        try {
          console.log('Attempting fallback parsing for:', when_text);
          const fallbackResult = fallbackDateParsing(when_text, userTimezone);
          if (fallbackResult) {
            finalStartTime = fallbackResult.start;
            finalEndTime = fallbackResult.end;
            console.log('Fallback parsing successful:', finalStartTime, finalEndTime);
          } else {
            return { 
              error: `I had trouble parsing "${when_text}". Could you try a different format? For example: "next Monday 3pm", "tomorrow at 8:30am", or "September 1st 2pm-3pm"` 
            };
          }
        } catch (fallbackError) {
          console.error('Fallback parsing also failed:', fallbackError);
          return { 
            error: `I had trouble parsing "${when_text}". Could you try a different format? For example: "next Monday 3pm", "tomorrow at 8:30am", or "September 1st 2pm-3pm"` 
          };
        }
      }
      
    } else if (start_time && end_time) {
      // Use provided ISO times
      finalStartTime = start_time;
      finalEndTime = end_time;
    } else {
      return { error: 'Either when_text or both start_time and end_time must be provided' };
    }
    
    // Validate that end_time is after start_time
    const startDate = new Date(finalStartTime);
    const endDate = new Date(finalEndTime);
    
    if (endDate <= startDate) {
      return { error: 'End time must be after start time' };
    }
    
    // Insert into local calendar events table
    const { data: newEvent, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: userId,
        title,
        description,
        start_time: finalStartTime,
        end_time: finalEndTime,
        all_day: finalAllDay,
        reminder_minutes,
        is_synced: false // Initially not synced to Google Calendar
      })
      .select()
      .single();
    
    if (error) {
      console.error('Calendar event creation error:', error);
      return { error: `Failed to create calendar event: ${error.message}` };
    }
    
    console.log('Calendar event created successfully:', newEvent.id);
    
    // Try to sync with Google Calendar if user has active connection
    const { data: gmailConnection } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
    
    let syncStatus = 'local_only';
    let syncMessage = '';
    
    if (gmailConnection) {
      try {
        // Convert the event data to Google Calendar format
        const googleEvent = {
          summary: title,
          description,
          start: finalAllDay ? 
            { date: finalStartTime.split('T')[0] } : 
            { dateTime: finalStartTime, timeZone: 'UTC' },
          end: finalAllDay ? 
            { date: finalEndTime.split('T')[0] } : 
            { dateTime: finalEndTime, timeZone: 'UTC' },
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: reminder_minutes }]
          }
        };

        // Call the calendar API function to create the event in Google Calendar
        const calendarApiResponse = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/calendar-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            event: googleEvent
          }),
        });
        
        if (calendarApiResponse.ok) {
          const syncResult = await calendarApiResponse.json();
          
          // Update the local event with Google Calendar ID
          await supabase
            .from('calendar_events')
            .update({ 
              is_synced: true,
              google_event_id: syncResult.event?.id 
            })
            .eq('id', newEvent.id);
            
          syncStatus = 'synced';
          syncMessage = ' and synced to Google Calendar';
        } else {
          const errorResponse = await calendarApiResponse.text();
          console.log('Google Calendar sync failed:', errorResponse);
          syncMessage = ' (saved locally, Google Calendar sync failed)';
        }
      } catch (syncError) {
        console.error('Google Calendar sync error:', syncError);
        syncMessage = ' (saved locally, Google Calendar sync failed)';
      }
    } else {
      syncMessage = ' (saved locally only - connect Google Calendar for syncing)';
    }
    
    return {
      success: true,
      event: {
        id: newEvent.id,
        title: newEvent.title,
        description: newEvent.description,
        startTime: newEvent.start_time,
        endTime: newEvent.end_time,
        isAllDay: newEvent.all_day,
        reminderMinutes: newEvent.reminder_minutes,
        syncStatus
      },
      message: `Calendar event "${title}" created successfully${syncMessage}!`
    };
  } catch (error) {
    console.error('Calendar event creation error:', error);
    return { error: `Calendar event creation failed: ${error.message}` };
  }
}

async function composeEmailDraft(to: string, subject: string, content: string, threadId?: string, attachments?: string[], userName?: string) {
  console.log('Composing email draft:', { to, subject, threadId, attachments });
  
  try {
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
    
    return {
      draft: draftData,
      message: `Email draft prepared for ${to}`
    };
  } catch (error) {
    console.error('Error composing email draft:', error);
    return { error: `Failed to compose email draft: ${error.message}` };
  }
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
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    // The display_name is now automatically synced from Auth metadata
    // Fall back to email local part if somehow missing
    const userName = userProfile?.display_name || 
      (user.email ? user.email.split('@')[0] : 'there');

    console.log('User profile loaded:', userName);

    // Parse request
    const { message, sessionId, detectedTriggers = [], images = [], client_timezone, current_time } = await req.json();
    console.log('Request params:', { 
      messageLength: message?.length, 
      sessionId, 
      detectedTriggers,
      imageCount: images?.length || 0,
      clientTimezone: client_timezone,
      currentTime: current_time
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

    // Get conversation history (last 12 messages for better context)
    const { data: historyRaw } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(12);

    const conversationHistory = (historyRaw || [])
      .slice(-12)
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        role: msg.role,
        content: msg.content.trim()
      }));

    console.log('Conversation history length:', conversationHistory.length);

    // Context stitching: if user gives short response, add context from last assistant message
    const isShortResponse = message && message.trim().length <= 10 && 
      /^(yes|no|ok|sure|send|send it|confirm|cancel|proceed|go ahead)$/i.test(message.trim());
    
    let contextEnhancedMessage = message;
    if (isShortResponse && conversationHistory.length > 0) {
      const lastAssistantMessage = conversationHistory
        .slice()
        .reverse()
        .find(msg => msg.role === 'assistant');
      
      if (lastAssistantMessage) {
        contextEnhancedMessage = `Previous context: "${lastAssistantMessage.content.slice(0, 200)}..."\n\nUser response: ${message}`;
        console.log('Enhanced short response with context');
      }
    }

    // Prepare messages for OpenAI with personalized system prompt
    let personalizedSystemPrompt = SYSTEM_PROMPT.replace('{{USER_NAME}}', userName);
    
    // Get user timezone and format current time
    let userTimezone = 'UTC';
    let currentUserTime = 'Unknown';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      
      userTimezone = profile?.timezone || client_timezone || 'UTC';
      
      if (current_time) {
        const { format } = await import('https://esm.sh/date-fns@3.6.0');  
        const { toZonedTime } = await import('https://esm.sh/date-fns-tz@3.2.0');
        const currentTimeDate = new Date(current_time);
        const zonedTime = toZonedTime(currentTimeDate, userTimezone);
        currentUserTime = format(zonedTime, 'PPpp');
      }
    } catch (tzError) {
      console.log('Timezone formatting error:', tzError);
    }
    
    // Replace timezone and current time placeholders
    personalizedSystemPrompt = personalizedSystemPrompt
      .replace('{{CURRENT_TIME}}', currentUserTime)
      .replace('{{USER_TIMEZONE}}', userTimezone);
    
    const messages = [
      { role: 'system', content: personalizedSystemPrompt },
      ...conversationHistory
    ];

    // Add current message with images if present
    const currentMessage: any = {
      role: 'user',
      content: contextEnhancedMessage || 'What can you see in these images?'
    };

    // Add images to the current message if present
    if (images && images.length > 0) {
      currentMessage.content = [
        {
          type: 'text',
          text: contextEnhancedMessage || 'What can you see in these images?'
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

    // Always include email tools since they're core functionality
    const tools = [...EMAIL_TOOLS];
    
    // Add document tools if requested
    if (detectedTriggers.includes('document') || message.toLowerCase().includes('document') || message.toLowerCase().includes('file')) {
      tools.push(...DOCUMENT_TOOLS);
      console.log('Added document tools');
    }
    
    // Add calendar tools if requested - expanded triggers for natural language
    const calendarKeywords = [
      'calendar', 'schedule', 'meeting', 'appointment', 'event', 'busy', 'free', 'available', 
      'space', 'time', 'today', 'tomorrow', 'yesterday', 'week', 'month', 'day',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'next', 'this', 'last', 'upcoming', 'when', 'what time', 'book', 'reserve'
    ];
    
    if (detectedTriggers.includes('calendar') || 
        calendarKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
      tools.push(...CALENDAR_TOOLS);
      console.log('Added calendar tools');
    }

    console.log('Tools to use:', tools.map(t => t.function.name));

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
      
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          let result;

          console.log(`Executing tool: ${toolCall.function.name} with args:`, args);

          switch (toolCall.function.name) {
            case 'emails_search':
              result = await searchEmails(user.id, args.query);
              break;
            case 'documents_search':
              result = await searchDocuments(user.id, args.query);
              break;
            case 'calendar_list_events':
              result = await listCalendarEvents(user.id, args.timeMin, args.timeMax, args.period, args.maxResults);
              break;
            case 'calendar_create_event':
              result = await createCalendarEvent(user.id, { ...args, client_timezone });
              break;
            case 'emails_compose_draft':
              const { to, subject, content, threadId, attachments } = args;
              result = await composeEmailDraft(to, subject, content, threadId, attachments, userName);
              
              // If attachments were provided and the draft was successful, fetch document details
              if (attachments && attachments.length > 0 && result.draft) {
                try {
                  // Try to find documents by name (since AI might pass names instead of IDs)
                  const { data: attachedDocs, error: docError } = await supabase
                    .from('user_documents')
                    .select('id, name, file_path, mime_type, file_size')
                    .eq('user_id', user.id)
                    .or(attachments.map(att => `name.ilike.%${att}%`).join(','));
                  
                  if (docError) {
                    console.error('Error fetching documents:', docError);
                    result.attachedDocuments = [];
                  } else {
                    result.attachedDocuments = attachedDocs || [];
                    console.log('Found attached documents:', attachedDocs?.length || 0);
                  }
                } catch (attachmentError) {
                  console.error('Error processing attachments:', attachmentError);
                  result.attachedDocuments = [];
                }
              }
              break;
            default:
              result = { error: `Unknown tool: ${toolCall.function.name}` };
          }

          toolResults.push({
            toolCall,
            result
          });

          // Save tool message to database for UI rendering
          await supabase
            .from('assistant_messages')
            .insert({
              session_id: session.id,
              user_id: user.id,
              role: 'tool',
              content: JSON.stringify(result),
              tool_name: toolCall.function.name,
              tool_args: JSON.stringify(args),
              tool_result: JSON.stringify(result)
            });

          console.log(`Tool ${toolCall.function.name} executed, result:`, result?.conversations?.length || result?.documents?.length || result?.draft ? 'success' : 'error');
        } catch (toolError) {
          console.error('Tool execution error:', toolError);
          toolResults.push({
            toolCall,
            result: { error: `Tool execution failed: ${toolError.message}` }
          });
        }
      }

      // Get follow-up response from OpenAI with tool results
      if (toolResults.length > 0) {
        console.log('Getting follow-up response from OpenAI...');
        
        const toolMessages = toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.toolCall.id,
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
          if (toolResults.some(tr => tr.toolCall.function.name === 'emails_search')) {
            const emailResults = toolResults.find(tr => tr.toolCall.function.name === 'emails_search');
            if (emailResults?.result?.conversations?.length > 0) {
              finalResponse = `✨ I found ${emailResults.result.conversations.length} email(s) matching your search! Let me know if you'd like me to help with anything specific about these emails.`;
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
