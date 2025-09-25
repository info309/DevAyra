import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { conversations } = await req.json();

    if (!conversations || !Array.isArray(conversations)) {
      throw new Error('Invalid conversations data');
    }

    console.log(`Caching ${conversations.length} conversations for user ${user.id}`);
    console.log('Sample conversation structure:', JSON.stringify(conversations[0], null, 2));
    
    // Log email count for debugging
    const totalEmails = conversations.reduce((total, conv) => total + (conv.emails?.length || 0), 0);
    console.log(`Total emails to cache: ${totalEmails}`);

    // Process each conversation and its emails
    const emailsToCache = [];
    
    for (const conversation of conversations) {
      if (conversation.emails && Array.isArray(conversation.emails)) {
        for (const email of conversation.emails) {
          // Extract sender info
          const senderEmail = email.from?.includes('<') 
            ? email.from.match(/<([^>]+)>/)?.[1] || email.from
            : email.from || '';
          const senderName = email.from?.includes('<')
            ? email.from.split('<')[0]?.trim().replace(/"/g, '') || ''
            : email.from || '';

          // Extract recipient info  
          const recipientEmail = email.to?.includes('<')
            ? email.to.match(/<([^>]+)>/)?.[1] || email.to
            : email.to || '';
          const recipientName = email.to?.includes('<')
            ? email.to.split('<')[0]?.trim().replace(/"/g, '') || ''
            : email.to || '';

          // Parse the date to ISO format for PostgreSQL
          let parsedDate = null;
          if (email.date) {
            try {
              parsedDate = new Date(email.date).toISOString();
            } catch (error) {
              console.error('Failed to parse date:', email.date, error);
              parsedDate = new Date().toISOString(); // Fallback to current time
            }
          }

          emailsToCache.push({
            user_id: user.id,
            gmail_message_id: email.id,
            gmail_thread_id: conversation.id,
            subject: conversation.subject || email.subject || '',
            sender_email: senderEmail,
            sender_name: senderName,
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            content: email.content || '',
            snippet: email.snippet || '',
            date_sent: parsedDate,
            is_unread: email.unread || false,
            has_attachments: (email.attachments && email.attachments.length > 0) || false,
            attachment_info: email.attachments || null,
            email_type: 'inbox' // Default to inbox, could be enhanced later
          });
        }
      }
    }

    if (emailsToCache.length > 0) {
      // Use upsert to handle duplicates
      const { error: insertError } = await supabase
        .from('cached_emails')
        .upsert(emailsToCache, { 
          onConflict: 'user_id,gmail_message_id',
          ignoreDuplicates: false 
        });

      if (insertError) {
        console.error('Error caching emails:', insertError);
        throw insertError;
      }

      console.log(`Successfully cached ${emailsToCache.length} emails`);
    }

    return new Response(JSON.stringify({
      success: true,
      cachedCount: emailsToCache.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cache emails function error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error)?.message || 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});