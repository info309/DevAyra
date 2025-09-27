import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuthRequest {
  code: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Gmail auth request received');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    // Determine the correct site URL based on the request
    let baseSiteUrl = Deno.env.get('SITE_URL') || Deno.env.get('FRONTEND_URL') || 'http://localhost:3001';
    let siteUrl = baseSiteUrl;
    
    // Check if this is coming from a Lovable environment
    const referer = req.headers.get('referer');
    const origin = req.headers.get('origin');
    
    console.log('Headers for URL detection:', { referer, origin });
    
    if (referer && referer.includes('lovable.app')) {
      // Extract the Lovable URL from the referer
      const lovableUrl = new URL(referer);
      siteUrl = `${lovableUrl.protocol}//${lovableUrl.host}`;
      console.log('Detected Lovable environment from referer, using site URL:', siteUrl);
    } else if (origin && origin.includes('lovable.app')) {
      siteUrl = origin;
      console.log('Detected Lovable environment from origin, using site URL:', siteUrl);
    } else if (referer && referer.includes('ayra-unified-suite')) {
      siteUrl = 'https://ayra-unified-suite.lovable.app';
      console.log('Using production Lovable URL:', siteUrl);
    } else {
      // Ensure we only use the base URL without any path
      siteUrl = new URL(baseSiteUrl).origin;
    }
    
    // Also check for specific Lovable preview URL pattern
    if ((siteUrl === 'http://localhost:3001' || siteUrl === 'http://localhost:3000' || siteUrl === 'http://localhost:8080') && (referer || origin)) {
      const sourceUrl = referer || origin;
      if (sourceUrl && sourceUrl.includes('5eb95c88-7b91-431d-abcd-024a8536e78a.lovable.app')) {
        siteUrl = 'https://id-preview--5eb95c88-7b91-431d-abcd-024a8536e78a.lovable.app';
        console.log('Using specific Lovable preview URL:', siteUrl);
      }
    }
    const pathname = url.pathname;

    if (req.method === 'GET') {
      // Check if this is a callback request
      if (pathname.includes('/callback')) {
        // Handle OAuth callback
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state'); // This is the user ID
        const error = url.searchParams.get('error');
        
        if (error) {
          // Check if this looks like a mobile request
          const userAgent = req.headers.get('user-agent') || '';
          const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
          
          const redirect = `${siteUrl.replace(/\/$/, '')}/account?gmail_auth=error&error=${encodeURIComponent(error)}`;
          return new Response(null, {
            status: 302,
            headers: { 'Location': redirect, ...corsHeaders },
          });
        }

        if (!code || !state) {
          // Check if this looks like a mobile request
          const userAgent = req.headers.get('user-agent') || '';
          const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
          
          const redirect = `${siteUrl.replace(/\/$/, '')}/account?gmail_auth=error&error=${encodeURIComponent('Missing authorization code')}`;
          return new Response(null, {
            status: 302,
            headers: { 'Location': redirect, ...corsHeaders },
          });
        }

        // Exchange code for tokens
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
        const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-auth/callback`;

        try {
          // Exchange authorization code for tokens
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: clientId!,
              client_secret: clientSecret!,
              code: code,
              grant_type: 'authorization_code',
              redirect_uri: redirectUri,
            }),
          });

          if (!tokenResponse.ok) {
            throw new Error('Failed to exchange code for tokens');
          }

          const tokens = await tokenResponse.json();
          
          // Get user's email address
          const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          });

          if (!userInfoResponse.ok) {
            throw new Error('Failed to get user info');
          }

          const userInfo = await userInfoResponse.json();

          // Store the connection in the database
          const { error: dbError } = await supabaseClient
            .from('gmail_connections')
            .upsert({
              user_id: state,
              email_address: userInfo.email,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token || '',
              is_active: true,
            }, {
              onConflict: 'user_id,email_address'
            });

          if (dbError) {
            console.error('Database error:', dbError);
            throw dbError;
          }

          console.log('Gmail connection saved successfully');

          // Check if this looks like a mobile request
          const userAgent = req.headers.get('user-agent') || '';
          const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
          
          const redirect = `${siteUrl.replace(/\/$/, '')}/?gmail_auth=success`;
          console.log('Redirecting to:', redirect);
          console.log('Site URL:', siteUrl);
          
          // Use proper HTTP redirect
          return new Response(null, {
            status: 302,
            headers: { 
              'Location': redirect,
              ...corsHeaders 
            },
          });

        } catch (err: any) {
          console.error('Error processing OAuth callback:', err);
          const redirect = `${siteUrl.replace(/\/$/, '')}/account?gmail_auth=error&error=${encodeURIComponent(err.message)}`;
          return new Response(null, {
            status: 302,
            headers: { 'Location': redirect, ...corsHeaders },
          });
        }
      }

      // Generate OAuth URL for initial request
      const userId = url.searchParams.get('userId');
      
      if (!userId) {
        throw new Error('User ID is required');
      }

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-auth/callback`;
      
      const scope = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${userId}`;

      return new Response(JSON.stringify({ authUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (req.method === 'POST') {
      // Exchange code for tokens
      const { code, userId }: AuthRequest = await req.json();
      
      if (!code || !userId) {
        throw new Error('Code and userId are required');
      }

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-auth/callback`;

      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await tokenResponse.json();
      
      // Get user's email address
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const userInfo = await userInfoResponse.json();

      // Store the connection in the database
      const { error } = await supabaseClient
        .from('gmail_connections')
        .upsert({
          user_id: userId,
          email_address: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || '',
          is_active: true,
        }, {
          onConflict: 'user_id,email_address'
        });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Gmail connection saved successfully');

      return new Response(JSON.stringify({ 
        success: true, 
        email: userInfo.email 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error: any) {
    console.error('Error in gmail-auth function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);