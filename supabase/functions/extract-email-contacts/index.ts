import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting contacts for user: ${user.id}`);

    // Get user's own email addresses
    const { data: gmailConnection } = await supabase
      .from('gmail_connections')
      .select('email_address')
      .eq('user_id', user.id)
      .maybeSingle();

    const userEmails = new Set([
      user.email,
      gmailConnection?.email_address
    ].filter(Boolean).map(e => e!.toLowerCase()));

    console.log(`User emails to exclude: ${Array.from(userEmails).join(', ')}`);

    // Get all cached emails
    const { data: emails, error: emailsError } = await supabase
      .from('cached_emails')
      .select('sender_email, sender_name, recipient_email, recipient_name, date_sent')
      .eq('user_id', user.id);

    if (emailsError) {
      throw emailsError;
    }

    console.log(`Found ${emails?.length || 0} cached emails`);

    // Build contact map
    const contactMap = new Map<string, {
      email: string;
      name: string;
      email_count: number;
      last_email_date: string;
    }>();

    for (const email of emails || []) {
      // Process sender
      if (email.sender_email && !userEmails.has(email.sender_email.toLowerCase())) {
        const emailKey = email.sender_email.toLowerCase();
        if (contactMap.has(emailKey)) {
          const existing = contactMap.get(emailKey)!;
          existing.email_count++;
          if (new Date(email.date_sent) > new Date(existing.last_email_date)) {
            existing.last_email_date = email.date_sent;
            if (email.sender_name) {
              existing.name = email.sender_name;
            }
          }
        } else {
          contactMap.set(emailKey, {
            email: email.sender_email,
            name: email.sender_name || email.sender_email.split('@')[0],
            email_count: 1,
            last_email_date: email.date_sent
          });
        }
      }

      // Process recipient
      if (email.recipient_email && !userEmails.has(email.recipient_email.toLowerCase())) {
        const emailKey = email.recipient_email.toLowerCase();
        if (contactMap.has(emailKey)) {
          const existing = contactMap.get(emailKey)!;
          existing.email_count++;
          if (new Date(email.date_sent) > new Date(existing.last_email_date)) {
            existing.last_email_date = email.date_sent;
            if (email.recipient_name) {
              existing.name = email.recipient_name;
            }
          }
        } else {
          contactMap.set(emailKey, {
            email: email.recipient_email,
            name: email.recipient_name || email.recipient_email.split('@')[0],
            email_count: 1,
            last_email_date: email.date_sent
          });
        }
      }
    }

    console.log(`Discovered ${contactMap.size} unique contacts`);

    // Check which contacts already exist
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('email')
      .eq('user_id', user.id);

    const existingEmails = new Set(
      (existingContacts || []).map(c => c.email?.toLowerCase()).filter(Boolean)
    );

    // Convert to array and mark existing
    const discoveredContacts = Array.from(contactMap.values())
      .map(contact => ({
        ...contact,
        already_exists: existingEmails.has(contact.email.toLowerCase())
      }))
      .sort((a, b) => b.email_count - a.email_count);

    console.log(`${existingEmails.size} contacts already exist in contacts table`);

    return new Response(
      JSON.stringify({
        discovered_contacts: discoveredContacts,
        total_found: discoveredContacts.length,
        already_in_contacts: existingEmails.size
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error extracting contacts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
