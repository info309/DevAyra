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
    const pathname = url.pathname;

    if (req.method === 'GET') {
      // Check if this is a callback request
      if (pathname.includes('/callback')) {
        // Handle OAuth callback
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state'); // This is the user ID
        const error = url.searchParams.get('error');
        
        if (error) {
          return new Response(`
            <html>
              <body>
                <script>
                  window.opener?.postMessage({
                    type: 'GMAIL_AUTH_ERROR',
                    error: '${error}'
                  }, '*');
                  window.close();
                </script>
              </body>
            </html>
          `, {
            status: 200,
            headers: { 'Content-Type': 'text/html', ...corsHeaders },
          });
        }

        if (!code || !state) {
          return new Response(`
            <html>
              <body>
                <script>
                  window.opener?.postMessage({
                    type: 'GMAIL_AUTH_ERROR',
                    error: 'Missing authorization code or user ID'
                  }, '*');
                  window.close();
                </script>
              </body>
            </html>
          `, {
            status: 200,
            headers: { 'Content-Type': 'text/html', ...corsHeaders },
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

          // Return success page that closes popup and notifies parent
          return new Response(`<!DOCTYPE html>
<html>
<head>
  <title>Gmail Connected Successfully</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      max-width: 400px;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 20px 0;
      font-size: 24px;
      font-weight: 600;
    }
    p {
      margin: 0 0 20px 0;
      opacity: 0.9;
      line-height: 1.5;
      font-size: 16px;
    }
    .closing-text {
      font-size: 14px;
      opacity: 0.7;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>Congratulations!</h1>
    <p>You're now connected to Gmail.</p>
    <div class="closing-text">This window will close automatically...</div>
  </div>
  <script>
    window.opener?.postMessage({
      type: 'GMAIL_AUTH_SUCCESS',
      data: { email: '${userInfo.email}' }
    }, '*');
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`, {
            status: 200,
            headers: { 
              'Content-Type': 'text/html; charset=utf-8',
              ...corsHeaders 
            },
          });

        } catch (err: any) {
          console.error('Error processing OAuth callback:', err);
          return new Response(`
            <html>
              <body>
                <script>
                  window.opener?.postMessage({
                    type: 'GMAIL_AUTH_ERROR',
                    error: '${err.message}'
                  }, '*');
                  window.close();
                </script>
              </body>
            </html>
          `, {
            status: 200,
            headers: { 'Content-Type': 'text/html', ...corsHeaders },
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