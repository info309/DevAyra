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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
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

    console.log('Starting subscription analysis for user:', user.id);

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

    // Group subscriptions by sender
    const subscriptions = new Map<string, {
      senderEmail: string;
      senderDomain: string;
      senderName: string;
      emailCount: number;
      unsubscribeUrl: string;
      sampleSubjects: string[];
    }>();

    // Fetch and analyze each message (limit to 200 for performance)
    for (const message of messages.slice(0, 200)) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`;
      const msgResponse = await fetch(msgUrl, {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`,
        },
      });

      if (!msgResponse.ok) continue;

      const msgData: EmailMessage = await msgResponse.json();
      const headers = msgData.payload.headers;

      // Only process emails with unsubscribe headers
      const unsubscribeHeader = headers.find(h => h.name.toLowerCase() === 'list-unsubscribe');
      if (!unsubscribeHeader) continue;

      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      
      // Parse sender email
      const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/(\S+@\S+)/);
      const senderEmail = emailMatch ? emailMatch[1] : fromHeader;
      const senderDomain = senderEmail.split('@')[1] || senderEmail;
      const senderName = fromHeader.replace(/<.+?>/, '').trim().replace(/"/g, '');

      // Extract unsubscribe URL
      const urlMatch = unsubscribeHeader.value.match(/<(https?:\/\/[^>]+)>/);
      const unsubscribeUrl = urlMatch ? urlMatch[1] : '';

      if (!subscriptions.has(senderEmail)) {
        subscriptions.set(senderEmail, {
          senderEmail,
          senderDomain,
          senderName,
          emailCount: 0,
          unsubscribeUrl,
          sampleSubjects: [],
        });
      }

      const subscription = subscriptions.get(senderEmail)!;
      subscription.emailCount++;
      if (subscription.sampleSubjects.length < 3) {
        subscription.sampleSubjects.push(subjectHeader);
      }
    }

    console.log(`Found ${subscriptions.size} subscriptions`);

    // Generate AI summaries for each subscription
    const analysisRecords = [];
    for (const [_, subscription] of subscriptions) {
      try {
        // Generate AI summary
        const prompt = `Analyze this email subscription and write a brief 1-2 sentence summary of what this subscription is about:
        
Sender: ${subscription.senderName || subscription.senderEmail}
Domain: ${subscription.senderDomain}
Sample email subjects:
${subscription.sampleSubjects.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Provide a concise summary that helps the user understand what type of content they receive from this subscription.`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'user', content: prompt }
            ],
            max_tokens: 150,
          }),
        });

        let aiSummary = 'Subscription emails';
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiSummary = aiData.choices?.[0]?.message?.content || 'Subscription emails';
        } else {
          console.error('AI summary generation failed for', subscription.senderEmail);
        }

        analysisRecords.push({
          user_id: user.id,
          sender_email: subscription.senderEmail,
          sender_domain: subscription.senderDomain,
          sender_name: subscription.senderName,
          email_count: subscription.emailCount,
          has_unsubscribe_header: true,
          unsubscribe_url: subscription.unsubscribeUrl,
          ai_summary: aiSummary,
          recommended_action: 'unsubscribe',
        });
      } catch (error) {
        console.error('Error generating summary for', subscription.senderEmail, error);
      }
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

    console.log(`Analysis complete: ${analysisRecords.length} subscriptions found`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscriptions: analysisRecords.length,
        message: `Found ${analysisRecords.length} subscriptions from ${messages.length} emails`
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
