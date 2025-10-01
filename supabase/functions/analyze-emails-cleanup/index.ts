import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
  internalDate: string;
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

    console.log('Starting email analysis for user:', user.id);

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

    // Fetch emails from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const afterDate = Math.floor(ninetyDaysAgo.getTime() / 1000);

    console.log('Fetching emails after:', ninetyDaysAgo.toISOString());

    const gmailListUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&q=after:${afterDate}`;
    
    const listResponse = await fetch(gmailListUrl, {
      headers: {
        'Authorization': `Bearer ${connection.access_token}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(`Gmail API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    console.log(`Found ${messages.length} messages to analyze`);

    // Group emails by sender
    const senderGroups = new Map<string, {
      senderEmail: string;
      senderDomain: string;
      senderName: string;
      emails: EmailMessage[];
      hasUnsubscribe: boolean;
      openedCount: number;
      repliedCount: number;
      importantKeywords: Set<string>;
      firstDate: Date;
      lastDate: Date;
    }>();

    const importantKeywords = [
      'invoice', 'receipt', 'booking', 'reservation', 'confirmation',
      'ticket', 'order', 'payment', 'transaction', 'statement',
      'account', 'password', 'security', 'verify', 'reset'
    ];

    // Fetch and analyze each message
    for (const message of messages.slice(0, 100)) { // Limit to 100 for performance
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`;
      const msgResponse = await fetch(msgUrl, {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
        },
      });

      if (!msgResponse.ok) continue;

      const msgData: EmailMessage = await msgResponse.json();
      const headers = msgData.payload.headers;

      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const unsubscribeHeader = headers.find(h => h.name.toLowerCase() === 'list-unsubscribe');
      
      // Parse sender email
      const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/(\S+@\S+)/);
      const senderEmail = emailMatch ? emailMatch[1] : fromHeader;
      const senderDomain = senderEmail.split('@')[1] || senderEmail;
      const senderName = fromHeader.replace(/<.+?>/, '').trim().replace(/"/g, '');

      // Check for important keywords
      const foundKeywords = new Set<string>();
      const searchText = (subjectHeader + fromHeader).toLowerCase();
      for (const keyword of importantKeywords) {
        if (searchText.includes(keyword)) {
          foundKeywords.add(keyword);
        }
      }

      // Check if opened (no UNREAD label)
      const isOpened = !msgData.labelIds?.includes('UNREAD');
      
      // Check if in SENT (user replied)
      const isReplied = msgData.labelIds?.includes('SENT') || false;

      const msgDate = new Date(parseInt(msgData.internalDate));

      if (!senderGroups.has(senderEmail)) {
        senderGroups.set(senderEmail, {
          senderEmail,
          senderDomain,
          senderName,
          emails: [],
          hasUnsubscribe: !!unsubscribeHeader,
          openedCount: 0,
          repliedCount: 0,
          importantKeywords: new Set(),
          firstDate: msgDate,
          lastDate: msgDate,
        });
      }

      const group = senderGroups.get(senderEmail)!;
      group.emails.push(msgData);
      if (isOpened) group.openedCount++;
      if (isReplied) group.repliedCount++;
      if (unsubscribeHeader) group.hasUnsubscribe = true;
      foundKeywords.forEach(kw => group.importantKeywords.add(kw));
      if (msgDate < group.firstDate) group.firstDate = msgDate;
      if (msgDate > group.lastDate) group.lastDate = msgDate;
    }

    console.log(`Grouped into ${senderGroups.size} sender groups`);

    // Save analysis to database
    const analysisRecords = [];
    for (const [_, group] of senderGroups) {
      const hasImportantKeywords = group.importantKeywords.size > 0;
      const hasInteraction = group.openedCount > 0 || group.repliedCount > 0;

      let recommendedAction = 'review';
      if (hasImportantKeywords) {
        recommendedAction = 'keep';
      } else if (group.hasUnsubscribe && !hasInteraction && group.emails.length > 3) {
        recommendedAction = 'unsubscribe';
      } else if (!hasInteraction && group.emails.length > 5) {
        recommendedAction = 'organize';
      }

      analysisRecords.push({
        user_id: user.id,
        sender_email: group.senderEmail,
        sender_domain: group.senderDomain,
        sender_name: group.senderName,
        email_count: group.emails.length,
        unread_count: group.emails.filter(e => e.labelIds?.includes('UNREAD')).length,
        has_unsubscribe_header: group.hasUnsubscribe,
        user_opened_count: group.openedCount,
        user_replied_count: group.repliedCount,
        contains_important_keywords: hasImportantKeywords,
        important_keywords: Array.from(group.importantKeywords),
        recommended_action: recommendedAction,
        first_email_date: group.firstDate.toISOString(),
        last_email_date: group.lastDate.toISOString(),
      });
    }

    // Delete old analysis and insert new
    await supabase
      .from('email_cleanup_analysis')
      .delete()
      .eq('user_id', user.id);

    const { error: insertError } = await supabase
      .from('email_cleanup_analysis')
      .insert(analysisRecords);

    if (insertError) {
      console.error('Error inserting analysis:', insertError);
      throw insertError;
    }

    console.log(`Analysis complete: ${analysisRecords.length} sender groups analyzed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        senderGroups: analysisRecords.length,
        message: `Analyzed ${messages.length} emails from ${analysisRecords.length} senders`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in analyze-emails-cleanup:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
