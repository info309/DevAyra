import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkActionRequest {
  senderEmail: string;
  action: 'unsubscribe' | 'delete' | 'trash' | 'organize' | 'label';
  labelName?: string;
  unsubscribeUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { senderEmail, action, labelName, unsubscribeUrl }: BulkActionRequest = await req.json();

    if (!senderEmail || !action) {
      throw new Error('Missing required fields: senderEmail and action');
    }

    console.log(`Starting bulk action: ${action} for sender: ${senderEmail}`);

    // Get Gmail connection
    const { data: connection, error: connError } = await supabase
      .from('gmail_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      throw new Error('No active Gmail connection found');
    }

    // Create cleanup history record
    const { data: historyRecord } = await supabase
      .from('cleanup_history')
      .insert({
        user_id: user.id,
        action_type: action,
        sender_email: senderEmail,
        sender_domain: senderEmail.split('@')[1],
        status: 'processing',
      })
      .select()
      .single();

    try {
      // Search for all emails from this sender
      const searchQuery = `from:${senderEmail}`;
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=500`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
        },
      });

      if (!searchResponse.ok) {
        throw new Error(`Gmail search error: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const messages = searchData.messages || [];
      const messageIds = messages.map((m: any) => m.id);

      console.log(`Found ${messageIds.length} messages from ${senderEmail}`);

      let processedCount = 0;

      if (action === 'unsubscribe') {
        // Try to visit the unsubscribe URL if provided
        if (unsubscribeUrl) {
          try {
            console.log(`Attempting to unsubscribe via URL: ${unsubscribeUrl}`);
            const unsubResponse = await fetch(unsubscribeUrl, {
              method: 'GET',
              redirect: 'follow',
            });
            console.log(`Unsubscribe URL response: ${unsubResponse.status}`);
          } catch (error) {
            console.error('Error visiting unsubscribe URL:', error);
            // Continue anyway - we'll still move emails to label
          }
        }
        
        // Move emails to "Unsubscribed" label
        await moveEmailsToLabel(connection.access_token, messageIds, 'Unsubscribed');
        processedCount = messageIds.length;
      } else if (action === 'trash') {
        // Move to trash
        for (const messageId of messageIds) {
          const trashUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`;
          await fetch(trashUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${connection.access_token}`,
            },
          });
          processedCount++;
        }
      } else if (action === 'delete') {
        // Permanently delete (use with caution!)
        for (const messageId of messageIds) {
          const deleteUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`;
          await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${connection.access_token}`,
            },
          });
          processedCount++;
        }
      } else if (action === 'organize' || action === 'label') {
        // Apply label
        const label = labelName || 'Subscriptions';
        await moveEmailsToLabel(connection.access_token, messageIds, label);
        processedCount = messageIds.length;
      }

      // Update history record
      await supabase
        .from('cleanup_history')
        .update({
          status: 'completed',
          emails_affected: processedCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', historyRecord.id);

      console.log(`Bulk action complete: ${processedCount} emails processed`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          emailsProcessed: processedCount,
          action,
          senderEmail,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (error: any) {
      // Update history with error
      await supabase
        .from('cleanup_history')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', historyRecord.id);

      throw error;
    }

  } catch (error: any) {
    console.error('Error in bulk-email-actions:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function moveEmailsToLabel(accessToken: string, messageIds: string[], labelName: string) {
  // First, get or create the label
  const labelsUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/labels';
  const labelsResponse = await fetch(labelsUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  const labelsData = await labelsResponse.json();
  let labelId = labelsData.labels?.find((l: any) => l.name === labelName)?.id;

  if (!labelId) {
    // Create the label
    const createResponse = await fetch(labelsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    });

    const createData = await createResponse.json();
    labelId = createData.id;
  }

  // Apply label to messages (batch)
  const batchUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify';
  await fetch(batchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids: messageIds,
      addLabelIds: [labelId],
      removeLabelIds: ['INBOX'],
    }),
  });
}
