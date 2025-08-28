import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const GmailCallback = () => {
  const { user } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state'); // This is the user ID
      const error = urlParams.get('error');

      if (error) {
        // Send error to parent window
        window.opener?.postMessage({
          type: 'GMAIL_AUTH_ERROR',
          error: error
        }, '*');
        window.close();
        return;
      }

      if (code && state && user) {
        try {
          // Exchange code for tokens
          const { data, error: authError } = await supabase.functions.invoke('gmail-auth', {
            body: {
              code: code,
              userId: state
            },
            method: 'POST'
          });

          if (authError) throw authError;

          // Send success message to parent window
          window.opener?.postMessage({
            type: 'GMAIL_AUTH_SUCCESS',
            data: data
          }, '*');
          
        } catch (err: any) {
          // Send error to parent window
          window.opener?.postMessage({
            type: 'GMAIL_AUTH_ERROR',
            error: err.message
          }, '*');
        }
      }

      window.close();
    };

    handleCallback();
  }, [user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing Gmail connection...</p>
      </div>
    </div>
  );
};

export default GmailCallback;