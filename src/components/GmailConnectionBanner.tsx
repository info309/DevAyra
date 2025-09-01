import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface GmailConnectionStatus {
  connected: boolean;
}

const GmailConnectionBanner: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus>({
    connected: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkGmailConnection();
    }
  }, [user]);

  const checkGmailConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('gmail_connections')
        .select('id, is_active')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error checking Gmail connection:', error);
      }
      
      setGmailStatus({
        connected: !!data
      });
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || gmailStatus.connected) {
    return null;
  }

  return (
    <Alert className="mb-6 border-blue-200 bg-blue-50">
      <AlertCircle className="h-4 w-4 text-blue-600" />
      <AlertDescription className="flex items-center justify-between">
        <div className="text-blue-800">
          <span>
            <strong>Gmail connection required:</strong> Connect your Gmail account to send invoices directly from your email.
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate('/mailbox')}
          className="ml-4 gap-2 text-blue-700 border-blue-300 hover:bg-blue-100"
        >
          <ExternalLink className="w-4 h-4" />
          Connect Gmail
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default GmailConnectionBanner;