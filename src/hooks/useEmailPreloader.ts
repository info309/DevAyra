
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmailConversation {
  id: string;
  subject: string;
  emails: any[];
  messageCount: number;
  lastDate: string;
  unreadCount: number;
  participants: string[];
}

interface PreloadedEmails {
  inbox: EmailConversation[];
  sent: EmailConversation[];
  drafts: EmailConversation[];
}

export const useEmailPreloader = () => {
  const [preloadedEmails, setPreloadedEmails] = useState<PreloadedEmails>({
    inbox: [],
    sent: [],
    drafts: []
  });
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadComplete, setPreloadComplete] = useState(false);
  const { toast } = useToast();

  const fetchEmailsForFolder = async (query: string): Promise<EmailConversation[]> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'getEmails',
          maxResults: 50,
          query: query
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const data = await response.json();
      return data.conversations || [];
    } catch (error) {
      console.error(`Error fetching emails for query "${query}":`, error);
      return [];
    }
  };

  const preloadAllEmails = async () => {
    if (preloadComplete || isPreloading) return;
    
    setIsPreloading(true);
    console.log('Starting email preload...');

    try {
      // Fetch all email folders in parallel
      const [inboxEmails, sentEmails, draftEmails] = await Promise.all([
        fetchEmailsForFolder('in:inbox -in:sent'),
        fetchEmailsForFolder('in:sent'),
        fetchEmailsForFolder('in:drafts')
      ]);

      setPreloadedEmails({
        inbox: inboxEmails,
        sent: sentEmails,
        drafts: draftEmails
      });

      setPreloadComplete(true);
      console.log('Email preload complete:', {
        inbox: inboxEmails.length,
        sent: sentEmails.length,
        drafts: draftEmails.length
      });
    } catch (error) {
      console.error('Error preloading emails:', error);
      toast({
        title: "Email Preload Failed",
        description: "Some emails may load slower than expected.",
        variant: "destructive"
      });
    } finally {
      setIsPreloading(false);
    }
  };

  // Auto-start preloading when hook is first used
  useEffect(() => {
    preloadAllEmails();
  }, []);

  const getEmailsForFolder = (folder: 'inbox' | 'sent' | 'drafts'): EmailConversation[] => {
    return preloadedEmails[folder];
  };

  const refreshFolder = async (folder: 'inbox' | 'sent' | 'drafts') => {
    const queries = {
      inbox: 'in:inbox -in:sent',
      sent: 'in:sent',
      drafts: 'in:drafts'
    };

    try {
      const emails = await fetchEmailsForFolder(queries[folder]);
      setPreloadedEmails(prev => ({
        ...prev,
        [folder]: emails
      }));
    } catch (error) {
      console.error(`Error refreshing ${folder}:`, error);
    }
  };

  return {
    preloadedEmails,
    isPreloading,
    preloadComplete,
    getEmailsForFolder,
    refreshFolder,
    preloadAllEmails
  };
};
