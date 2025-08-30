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
    console.log('Auto-cache emails job started');

    // Get all users with active Gmail connections
    const { data: connections, error: connectionsError } = await supabase
      .from('gmail_connections')
      .select('user_id, access_token, email_address')
      .eq('is_active', true);

    if (connectionsError) {
      throw connectionsError;
    }

    console.log(`Found ${connections?.length || 0} active Gmail connections`);

    for (const connection of connections || []) {
      try {
        console.log(`Caching emails for user: ${connection.user_id}`);

        // Call Gmail API to get emails
        const { data: emailData, error: emailError } = await supabase.functions.invoke('gmail-api', {
          body: {
            action: 'getEmails',
            query: 'in:inbox',
            maxResults: 100
          },
          headers: {
            'Authorization': `Bearer ${connection.access_token}`
          }
        });

        if (emailError) {
          console.error(`Failed to fetch emails for user ${connection.user_id}:`, emailError);
          continue;
        }

        if (emailData?.conversations && Array.isArray(emailData.conversations)) {
          // Call cache-emails function to store the emails
          const { error: cacheError } = await supabase.functions.invoke('cache-emails', {
            body: {
              conversations: emailData.conversations
            },
            headers: {
              'Authorization': `Bearer ${connection.access_token}`
            }
          });

          if (cacheError) {
            console.error(`Failed to cache emails for user ${connection.user_id}:`, cacheError);
          } else {
            console.log(`Successfully cached emails for user: ${connection.user_id}`);
          }
        }
      } catch (error) {
        console.error(`Error processing user ${connection.user_id}:`, error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Auto-cache job completed',
      processedUsers: connections?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Auto-cache emails function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});