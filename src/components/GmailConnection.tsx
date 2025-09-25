import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, CheckCircle, XCircle, ExternalLink, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import { supabase } from '@/integrations/supabase/client';

interface GmailConnectionData {
  id: string;
  email_address: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_email_sync_at: string | null;
  last_error: string | null;
}

const GmailConnection: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isDrawerView = useIsDrawerView();
  const [connection, setConnection] = useState<GmailConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  React.useEffect(() => {
    if (user) {
      checkGmailConnection();
    }
    
    // Check for successful auth return on page load (mobile redirect flow)
    const urlParams = new URLSearchParams(window.location.search);
    // Handle success/error from any page (home or account)
    if (urlParams.get('gmail_auth') === 'success') {
      toast({
        title: "Gmail Connected Successfully!",
        description: "Your Gmail and Calendar have been successfully linked to Ayra.",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      checkGmailConnection();
    } else if (urlParams.get('gmail_auth') === 'error') {
      const errorMessage = urlParams.get('error') || 'Failed to connect your Gmail account. Please try again.';
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive"
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  const checkGmailConnection = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Check for active connection first
      const { data: activeConnection, error } = await supabase
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Gmail connection:', error);
        toast({
          title: "Error",
          description: "Failed to check Gmail connection status.",
          variant: "destructive"
        });
        return;
      }

      // If no active connection, check for inactive connections with errors
      if (!activeConnection) {
        const { data: inactiveConnection } = await supabase
          .from('gmail_connections')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', false)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (inactiveConnection && inactiveConnection.last_error) {
          setConnection(inactiveConnection);
        } else {
          setConnection(null);
        }
      } else {
        setConnection(activeConnection);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  };

  const connectGmail = async () => {
    if (!user) return;
    
    try {
      setConnecting(true);
      
      // Get auth URL from the edge function
      const SUPABASE_URL = "https://lmkpmnndrygjatnipfgd.supabase.co";
      const response = await fetch(`${SUPABASE_URL}/functions/v1/gmail-auth?userId=${user.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get Gmail auth URL');
      }

      const { authUrl } = await response.json();

      if (isMobile()) {
        // On mobile, use direct redirect instead of popup
        toast({
          title: "Redirecting to Google",
          description: "You'll be redirected to Google to authorize access.",
        });
        
        // Add a small delay to show the toast
        setTimeout(() => {
          window.location.href = authUrl;
        }, 1000);
      } else {
        // Desktop: Use popup window
        const popup = window.open(
          authUrl,
          'gmail-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          toast({
            title: "Popup Blocked",
            description: "Please allow popups for this site and try again.",
            variant: "destructive"
          });
          setConnecting(false);
          return;
        }

        // Listen for messages from the popup
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            popup?.close();
            
            toast({
              title: "Gmail Connected",
              description: "Your Gmail account has been successfully connected.",
            });
            
            checkGmailConnection(); // Refresh connection status
          } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
            window.removeEventListener('message', handleMessage);
            popup?.close();
            
            toast({
              title: "Connection Failed",
              description: event.data.error || "Failed to connect Gmail account.",
              variant: "destructive"
            });
          }
        };

        window.addEventListener('message', handleMessage);

        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            setConnecting(false);
          }
        }, 1000);
      }

    } catch (error) {
      console.error('Error connecting Gmail:', error);
      toast({
        title: "Error",
        description: "Failed to initiate Gmail connection.",
        variant: "destructive"
      });
      setConnecting(false);
    }
  };

  const disconnectGmail = async () => {
    if (!user || !connection) return;
    
    try {
      setDisconnecting(true);
      
      const { error } = await supabase
        .from('gmail_connections')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('id', connection.id);

      if (error) {
        throw error;
      }

      setConnection(null);
      
      // Success - no toast message needed
      
    } catch (error) {
      console.error('Error disconnecting Gmail:', error);
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail account.",
        variant: "destructive"
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Gmail Integration
          </CardTitle>
          <CardDescription>Loading connection status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Gmail Integration
        </CardTitle>
        <CardDescription>
          Connect your Gmail account to manage emails directly from this app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">

          {connection && connection.is_active ? (
            <div className="space-y-4">
              <div className={`flex ${isDrawerView ? 'flex-col gap-3' : 'items-center justify-between'} p-4 border rounded-lg`}>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{connection.email_address}</p>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Connected on {new Date(connection.created_at).toLocaleDateString()}
                      </p>
                      {connection.last_email_sync_at && (
                        <p className="text-sm text-muted-foreground">
                          Last synced: {new Date(connection.last_email_sync_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 flex-shrink-0">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={disconnectGmail}
                  disabled={disconnecting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  size={isDrawerView ? "default" : "default"}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          ) : connection && !connection.is_active && connection.last_error ? (
            <div className="space-y-4">
              <div className={`flex ${isDrawerView ? 'flex-col gap-3' : 'items-center justify-between'} p-4 border rounded-lg border-destructive/20 bg-destructive/5`}>
                <div className="flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-destructive">Connection Issue</p>
                    <p className="text-sm text-muted-foreground truncate">{connection.email_address}</p>
                    <p className="text-sm text-destructive mt-1">
                      {connection.last_error}
                    </p>
                  </div>
                </div>
                <Badge variant="destructive" className="flex-shrink-0">
                  <XCircle className="w-3 h-3 mr-1" />
                  Disconnected
                </Badge>
              </div>
              
              <Button
                onClick={connectGmail}
                disabled={connecting}
                className="w-full"
                size={isDrawerView ? "default" : "default"}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {connecting ? 'Reconnecting...' : 'Reconnect Google Account'}
              </Button>
              
              <div className="text-xs text-muted-foreground">
                <p>Your Google account access has been revoked or expired. Please reconnect to continue using email and calendar features.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`flex ${isDrawerView ? 'flex-col gap-3' : 'items-center'} gap-3 p-4 border rounded-lg border-dashed`}>
                <XCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-muted-foreground">No Gmail account connected</p>
                  <p className="text-sm text-muted-foreground">
                    Connect your Gmail to access email features
                  </p>
                </div>
              </div>
              
              <Button
                onClick={connectGmail}
                disabled={connecting}
                className="w-full"
                size={isDrawerView ? "default" : "default"}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {connecting ? 'Connecting...' : 'Connect Gmail Account'}
              </Button>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• {isMobile() ? 'You will be redirected to Google for authentication' : 'This will open a Google authentication window'}</p>
                <p>• Permissions requested: read/send Gmail, view/edit Calendar (for app features)</p>
                <p>• Your credentials are stored securely and can be disconnected anytime</p>
                {isMobile() && <p>• After authentication, you'll be redirected back to this page</p>}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default GmailConnection;