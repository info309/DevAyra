import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Mail, Plus, Send, Save, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Paperclip, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import EmailContent from '@/components/EmailContent';

interface Email {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  unread: boolean;
  content?: string;
  isDraft?: boolean;
  draftId?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId?: string;
    downloadUrl?: string;
  }>;
}

interface Conversation {
  id: string; // threadId or generated conversation ID
  subject: string;
  participants: string[];
  lastDate: string;
  unreadCount: number;
  messageCount: number;
  emails: Email[];
}

interface GmailConnection {
  id: string;
  email_address: string;
  is_active: boolean;
}

const Mailbox = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  
  // Current view and sent email states
  const [currentView, setCurrentView] = useState<'inbox' | 'sent' | 'drafts'>('inbox');
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [sentConversations, setSentConversations] = useState<Conversation[]>([]);
  const [sentPageToken, setSentPageToken] = useState<string | null>(null);
  const [allSentEmailsLoaded, setAllSentEmailsLoaded] = useState(false);
  
  // Draft states
  const [draftEmails, setDraftEmails] = useState<Email[]>([]);
  const [draftConversations, setDraftConversations] = useState<Conversation[]>([]);
  const [draftPageToken, setDraftPageToken] = useState<string | null>(null);
  const [allDraftsLoaded, setAllDraftsLoaded] = useState(false);
  
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [allEmailsLoaded, setAllEmailsLoaded] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
  
  // Compose form state
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  
  // Reply state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Email | null>(null);
  const [replyConversation, setReplyConversation] = useState<Conversation | null>(null);
  
  // Draft editing state
  const [editingDraft, setEditingDraft] = useState<Email | null>(null);
  const [draftEditOpen, setDraftEditOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchGmailConnections();
    }
  }, [user]);

  // Load initial emails when component mounts or connections change
  useEffect(() => {
    if (connections.length > 0) {
      fetchEmails(undefined, false, currentView);
    }
  }, [connections, currentView]);

  // Switch view handler
  const handleViewChange = (view: 'inbox' | 'sent' | 'drafts') => {
    setCurrentView(view);
    setSelectedConversation(null);
    setSelectedEmail(null);
    setSearchQuery('');
  };

  // Get current data based on view
  const currentEmails = currentView === 'sent' ? sentEmails : currentView === 'drafts' ? draftEmails : emails;
  const currentConversations = currentView === 'sent' ? sentConversations : currentView === 'drafts' ? draftConversations : conversations;
  const currentPageToken = currentView === 'sent' ? sentPageToken : currentView === 'drafts' ? draftPageToken : nextPageToken;
  const currentAllEmailsLoaded = currentView === 'sent' ? allSentEmailsLoaded : currentView === 'drafts' ? allDraftsLoaded : allEmailsLoaded;

  const fetchGmailConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true);

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch Gmail connections"
      });
    }
  };

  const connectGmail = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Call edge function with userId as query parameter for GET request
      const response = await fetch(
        `https://lmkpmnndrygjatnipfgd.supabase.co/functions/v1/gmail-auth?userId=${user.id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA',
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get auth URL');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Open OAuth popup
      const popup = window.open(data.authUrl, 'gmail-auth', 'width=500,height=600,scrollbars=yes,resizable=yes');
      
      // Listen for popup completion
      const handleMessage = (event: MessageEvent) => {
        console.log('Received message:', event.data);
        
        if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
          console.log('Gmail auth success received');
          popup?.close();
          fetchGmailConnections();
          toast({
            title: "Success!",
            description: `Gmail account (${event.data.data?.email || 'Unknown'}) connected successfully`
          });
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
          console.log('Gmail auth error received:', event.data.error);
          popup?.close();
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: event.data.error
          });
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);
      
      // Also check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
        }
      }, 1000);
    } catch (error: any) {
      console.error('Gmail connection error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
    setLoading(false);
  };

  const disconnectGmail = async () => {
    if (!user || connections.length === 0) return;
    
    try {
      setLoading(true);
      
      // Deactivate the connection in the database
      const { error } = await supabase
        .from('gmail_connections')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      // Clear local state
      setConnections([]);
      setEmails([]);
      setConversations([]);
      setSentEmails([]);
      setSentConversations([]);
      setDraftEmails([]);
      setDraftConversations([]);
      setSelectedConversation(null);
      setSelectedEmail(null);

      toast({
        title: "Gmail Disconnected",
        description: "Your Gmail account has been disconnected. You can reconnect with updated permissions.",
      });

    } catch (error: any) {
      console.error('Disconnect error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message
      });
    }
    setLoading(false);
  };

  const fetchEmails = async (searchQuery?: string, loadMore = false, viewType: 'inbox' | 'sent' | 'drafts' = 'inbox') => {
    if (!user || connections.length === 0) return;
    
    setEmailLoading(true);
    try {
      const action = searchQuery ? 'search' : (viewType === 'sent' ? 'sent' : viewType === 'drafts' ? 'drafts' : 'list');
      const requestBody = {
        action,
        userId: user.id,
        maxResults: 100, // Load more emails at once
        pageToken: loadMore ? (viewType === 'sent' ? sentPageToken : viewType === 'drafts' ? draftPageToken : nextPageToken) : undefined,
        query: searchQuery,
        mailbox: viewType
      };

      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: requestBody
      });

      if (error) throw error;

      const newEmails = data.messages || [];
      
      if (viewType === 'sent') {
        if (loadMore) {
          setSentEmails(prev => [...prev, ...newEmails]);
        } else {
          setSentEmails(newEmails);
        }
        setSentPageToken(data.nextPageToken || null);
        setAllSentEmailsLoaded(!data.nextPageToken);
        
        // Group sent emails into conversations
        const allSentEmails = loadMore ? [...sentEmails, ...newEmails] : newEmails;
        const conversations = groupEmailsIntoConversations(allSentEmails);
        setSentConversations(conversations);
      } else if (viewType === 'drafts') {
        if (loadMore) {
          setDraftEmails(prev => [...prev, ...newEmails]);
        } else {
          setDraftEmails(newEmails);
        }
        setDraftPageToken(data.nextPageToken || null);
        setAllDraftsLoaded(!data.nextPageToken);
        
        // Group draft emails into conversations
        const allDraftEmails = loadMore ? [...draftEmails, ...newEmails] : newEmails;
        const conversations = groupEmailsIntoConversations(allDraftEmails);
        setDraftConversations(conversations);
      } else {
        if (loadMore) {
          setEmails(prev => [...prev, ...newEmails]);
        } else {
          setEmails(newEmails);
        }
        setNextPageToken(data.nextPageToken || null);
        setAllEmailsLoaded(!data.nextPageToken);
        
        // Group emails into conversations
        const allEmails = loadMore ? [...emails, ...newEmails] : newEmails;
        const conversations = groupEmailsIntoConversations(allEmails);
        setConversations(conversations);
      }
      
    } catch (error: any) {
      console.error('Failed to fetch emails:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to fetch emails: ${error.message}`
      });
    }
    setEmailLoading(false);
  };

  const searchEmails = async (query: string) => {
    if (!query.trim()) {
      // If empty query, load regular inbox
      await fetchEmails();
      return;
    }
    
    setSearchLoading(true);
    setSearchQuery(query);
    
    // Build Gmail search query
    let gmailQuery = '';
    
    // Check if it looks like an email address
    if (query.includes('@')) {
      gmailQuery = `from:${query} OR to:${query}`;
    } else {
      // Search in subject, body, and attachment names
      gmailQuery = `subject:${query} OR ${query} OR filename:${query}`;
    }
    
    try {
      await fetchEmails(gmailQuery);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        variant: "destructive",
        title: "Search Error",
        description: "Failed to search emails"
      });
    }
    
    setSearchLoading(false);
  };

  const groupEmailsIntoConversations = (emailList: Email[]): Conversation[] => {
    const conversationMap = new Map<string, Conversation>();
    
    emailList.forEach(email => {
      // Create conversation key based on thread ID or subject + participants
      let conversationKey = email.threadId;
      
      // If no threadId, create conversation based on subject and participants  
      if (!conversationKey) {
        const cleanSubject = email.subject.replace(/^(Re:|Fwd?:)\s*/i, '').trim();
        const participants = [email.from, email.to].filter(Boolean).sort();
        conversationKey = `${cleanSubject}-${participants.join('-')}`;
      }
      
      if (conversationMap.has(conversationKey)) {
        const conversation = conversationMap.get(conversationKey)!;
        conversation.emails.push(email);
        conversation.messageCount++;
        if (email.unread) conversation.unreadCount++;
        
        // Update last date if this email is newer
        if (new Date(email.date) > new Date(conversation.lastDate)) {
          conversation.lastDate = email.date;
        }
      } else {
        // Create new conversation
        const participants = [email.from, email.to].filter(Boolean);
        conversationMap.set(conversationKey, {
          id: conversationKey,
          subject: email.subject,
          participants: [...new Set(participants)],
          lastDate: email.date,
          unreadCount: email.unread ? 1 : 0,
          messageCount: 1,
          emails: [email]
        });
      }
    });
    
    // Sort conversations by last date (newest first)
    return Array.from(conversationMap.values()).sort((a, b) => 
      new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
    );
  };

  const loadMoreEmails = async () => {
    const isLoadingMore = currentView === 'sent' ? 
      (!sentPageToken || allSentEmailsLoaded) : 
      currentView === 'drafts' ?
      (!draftPageToken || allDraftsLoaded) :
      (!nextPageToken || allEmailsLoaded);
    
    if (isLoadingMore) return;
    await fetchEmails(searchQuery || undefined, true, currentView);
  };

  const fetchEmailContent = async (emailId: string) => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'get',
          userId: user.id,
          messageId: emailId
        }
      });

      if (error) throw error;

      const emailWithContent = data as Email;
      
      // Update the email in the current view's list with content
      if (currentView === 'sent') {
        setSentEmails(prev => prev.map(email => 
          email.id === emailId ? { ...email, ...emailWithContent } : email
        ));
        
        // Update sent conversations as well
        setSentConversations(prev => prev.map(conv => ({
          ...conv,
          emails: conv.emails.map(email =>
            email.id === emailId ? { ...email, ...emailWithContent } : email
          )
        })));
      } else if (currentView === 'drafts') {
        setDraftEmails(prev => prev.map(email => 
          email.id === emailId ? { ...email, ...emailWithContent } : email
        ));
        
        // Update draft conversations as well
        setDraftConversations(prev => prev.map(conv => ({
          ...conv,
          emails: conv.emails.map(email =>
            email.id === emailId ? { ...email, ...emailWithContent } : email
          )
        })));
      } else {
        // Update the email in the list with content
        setEmails(prev => prev.map(email => 
          email.id === emailId ? { ...email, ...emailWithContent } : email
        ));
        
        // Update conversations as well
        setConversations(prev => prev.map(conv => ({
          ...conv,
          emails: conv.emails.map(email =>
            email.id === emailId ? { ...email, ...emailWithContent } : email
          )
        })));
      }
      
    } catch (error: any) {
      console.error('Failed to fetch email content:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to fetch email content: ${error.message}`
      });
    }
  };

  const handleConversationClick = async (conversation: Conversation) => {
    console.log('Selecting conversation:', conversation.id, conversation.subject);
    setSelectedConversation(conversation);
    setSelectedEmail(null); // Reset individual email selection
    
    // Mark all emails in conversation as read
    markConversationAsRead(conversation);
    
    // Fetch full content for all emails in the conversation that don't have content yet
    for (const email of conversation.emails) {
      if (!email.content && !email.attachments) {
        await fetchEmailContent(email.id);
      }
    }
  };

  const handleEmailClick = async (email: Email, conversation: Conversation) => {
    console.log('Selecting individual email:', email.id);
    setSelectedConversation(conversation);
    setSelectedEmail(email);
    
    // Mark this specific email as read
    markEmailAsRead(email.id, conversation.id);
    
    // Fetch full content for the email if it doesn't have content yet
    if (!email.content && !email.attachments) {
      await fetchEmailContent(email.id);
    }
  };

  const markEmailAsRead = async (emailId: string, conversationId: string) => {
    // Mark as read on Gmail's side
    try {
      await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'markRead',
          userId: user?.id,
          messageId: emailId
        }
      });
    } catch (error) {
      console.error('Failed to mark email as read on Gmail:', error);
    }

    // Update local state for current view
    const updateConversations = currentView === 'sent' ? setSentConversations : currentView === 'drafts' ? setDraftConversations : setConversations;
    
    updateConversations(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        const updatedEmails = conv.emails.map(email => 
          email.id === emailId ? { ...email, unread: false } : email
        );
        const unreadCount = updatedEmails.filter(email => email.unread).length;
        
        return {
          ...conv,
          emails: updatedEmails,
          unreadCount
        };
      }
      return conv;
    }));
  };

  const markConversationAsRead = async (conversation: Conversation) => {
    // Mark all unread emails as read on Gmail's side
    const unreadEmails = conversation.emails.filter(email => email.unread);
    
    for (const email of unreadEmails) {
      try {
        await supabase.functions.invoke('gmail-api', {
          body: {
            action: 'markRead',
            userId: user?.id,
            messageId: email.id
          }
        });
      } catch (error) {
        console.error(`Failed to mark email ${email.id} as read on Gmail:`, error);
      }
    }

    // Update local state for current view
    const updateConversations = currentView === 'sent' ? setSentConversations : currentView === 'drafts' ? setDraftConversations : setConversations;
    
    updateConversations(prev => prev.map(conv => {
      if (conv.id === conversation.id) {
        return {
          ...conv,
          emails: conv.emails.map(email => ({ ...email, unread: false })),
          unreadCount: 0
        };
      }
      return conv;
    }));
  };

  const toggleConversationExpansion = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  const sendEmail = async (isDraft = false) => {
    if (!user || !to || !subject || !body) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: isDraft ? 'draft' : 'send',
          userId: user.id,
          to,
          subject,
          body
        }
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: isDraft ? "Draft saved successfully" : "Email sent successfully"
      });

      // Reset form
      setTo('');
      setSubject('');
      setBody('');
      setComposeOpen(false);

      // Refresh emails for current view
      fetchEmails(undefined, false, currentView);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to ${isDraft ? 'save draft' : 'send email'}`
      });
    }
    setLoading(false);
  };

  const replyToEmail = async () => {
    if (!user || !replyingTo || !replyConversation || !to || !subject || !body) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'reply',
          userId: user.id,
          to,
          subject,
          body,
          threadId: replyingTo.threadId,
          replyToMessageId: replyingTo.id
        }
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Reply sent successfully"
      });

      // Reset reply form
      setTo('');
      setSubject('');
      setBody('');
      setReplyOpen(false);
      setReplyingTo(null);
      setReplyConversation(null);

      // Refresh emails for current view
      fetchEmails(undefined, false, currentView);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to send reply: ${error.message}`
      });
    }
    setLoading(false);
  };

  const saveDraft = async () => {
    if (!user || !to || !subject || !body) {
      toast({
        variant: "destructive",
        title: "Error", 
        description: "Please fill in all fields"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'saveDraft',
          userId: user.id,
          to,
          subject,
          body,
          draftId: editingDraft?.draftId // Include draft ID if editing existing draft
        }
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Draft saved successfully"
      });

      // Reset form
      setTo('');
      setSubject('');
      setBody('');
      setComposeOpen(false);
      setDraftEditOpen(false);
      setEditingDraft(null);

      // Refresh drafts
      fetchEmails(undefined, false, 'drafts');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to save draft: ${error.message}`
      });
    }
    setLoading(false);
  };

  const editDraft = (email: Email) => {
    setEditingDraft(email);
    setTo(email.to || '');
    setSubject(email.subject || '');
    setBody(email.content || '');
    setDraftEditOpen(true);
  };

  const sendDraftAsEmail = async () => {
    if (!user || !editingDraft || !to || !subject || !body) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields"
      });
      return;
    }

    setLoading(true);
    try {
      // First delete the draft
      await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'deleteDraft',
          userId: user.id,
          draftId: editingDraft.draftId
        }
      });

      // Then send as regular email
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'send',
          userId: user.id,
          to,
          subject,
          body
        }
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Email sent successfully"
      });

      // Reset form
      setTo('');
      setSubject('');
      setBody('');
      setDraftEditOpen(false);
      setEditingDraft(null);

      // Refresh current view
      fetchEmails(undefined, false, currentView);
    } catch (error: any) {
      toast({
        variant: "destructive", 
        title: "Error",
        description: `Failed to send email: ${error.message}`
      });
    }
    setLoading(false);
  };

  const deleteEmail = async (emailId: string, conversationId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'delete',
          userId: user.id,
          messageId: emailId
        }
      });

      if (error) throw error;

      toast({
        title: "Email Deleted",
        description: "Email has been permanently deleted from Gmail"
      });

      // Remove email from local state for current view
      if (currentView === 'sent') {
        setSentEmails(prev => prev.filter(email => email.id !== emailId));
        setSentConversations(prev => prev.map(conv => {
          if (conv.id === conversationId) {
            const updatedEmails = conv.emails.filter(email => email.id !== emailId);
            if (updatedEmails.length === 0) {
              return null; // Remove conversation if no emails left
            }
            return {
              ...conv,
              emails: updatedEmails,
              messageCount: updatedEmails.length,
              unreadCount: updatedEmails.filter(email => email.unread).length,
              lastDate: updatedEmails[updatedEmails.length - 1]?.date || conv.lastDate
            };
          }
          return conv;
        }).filter(Boolean) as Conversation[]);
      } else if (currentView === 'drafts') {
        setDraftEmails(prev => prev.filter(email => email.id !== emailId));
        setDraftConversations(prev => prev.map(conv => {
          if (conv.id === conversationId) {
            const updatedEmails = conv.emails.filter(email => email.id !== emailId);
            if (updatedEmails.length === 0) {
              return null; // Remove conversation if no emails left
            }
            return {
              ...conv,
              emails: updatedEmails,
              messageCount: updatedEmails.length,
              unreadCount: updatedEmails.filter(email => email.unread).length,
              lastDate: updatedEmails[updatedEmails.length - 1]?.date || conv.lastDate
            };
          }
          return conv;
        }).filter(Boolean) as Conversation[]);
      } else {
        setEmails(prev => prev.filter(email => email.id !== emailId));
        setConversations(prev => prev.map(conv => {
          if (conv.id === conversationId) {
            const updatedEmails = conv.emails.filter(email => email.id !== emailId);
            if (updatedEmails.length === 0) {
              return null; // Remove conversation if no emails left
            }
            return {
              ...conv,
              emails: updatedEmails,
              messageCount: updatedEmails.length,
              unreadCount: updatedEmails.filter(email => email.unread).length,
              lastDate: updatedEmails[updatedEmails.length - 1]?.date || conv.lastDate
            };
          }
          return conv;
        }).filter(Boolean) as Conversation[]);
      }

      // Clear selection if deleted email was selected
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }
      
      // Clear conversation selection if it was the last email
      const currentConversation = currentConversations.find(conv => conv.id === conversationId);
      if (currentConversation && currentConversation.emails.length === 1) {
        setSelectedConversation(null);
      }

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to delete email: ${error.message}`
      });
    }
  };

  const deleteConversation = async (conversation: Conversation) => {
    if (!user) return;

    try {
      // Delete all emails in the conversation
      for (const email of conversation.emails) {
        await supabase.functions.invoke('gmail-api', {
          body: {
            action: 'delete',
            userId: user.id,
            messageId: email.id
          }
        });
      }

      toast({
        title: "Conversation Deleted",
        description: `All ${conversation.emails.length} emails in this conversation have been permanently deleted from Gmail`
      });

      // Remove conversation from local state for current view
      if (currentView === 'sent') {
        setSentConversations(prev => prev.filter(conv => conv.id !== conversation.id));
        setSentEmails(prev => prev.filter(email => !conversation.emails.some(convEmail => convEmail.id === email.id)));
      } else if (currentView === 'drafts') {
        setDraftConversations(prev => prev.filter(conv => conv.id !== conversation.id));
        setDraftEmails(prev => prev.filter(email => !conversation.emails.some(convEmail => convEmail.id === email.id)));
      } else {
        setConversations(prev => prev.filter(conv => conv.id !== conversation.id));
        setEmails(prev => prev.filter(email => !conversation.emails.some(convEmail => convEmail.id === email.id)));
      }

      // Clear selection if deleted conversation was selected
      if (selectedConversation?.id === conversation.id) {
        setSelectedConversation(null);
        setSelectedEmail(null);
      }

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to delete conversation: ${error.message}`
      });
    }
  };

  const handleReplyClick = (email: Email, conversation: Conversation) => {
    // Extract sender's email address from the "from" field
    const fromMatch = email.from.match(/<(.+?)>/);
    const replyToAddress = fromMatch ? fromMatch[1] : email.from;
    
    // Create quoted content with proper formatting
    const originalDate = formatDate(email.date);
    const originalFrom = email.from;
    const quotedContent = `
      <br><br>
      <div style="border-left: 4px solid #ccc; padding-left: 16px; margin: 16px 0; color: #666;">
        <p><strong>From:</strong> ${originalFrom}<br>
        <strong>Date:</strong> ${originalDate}<br>
        <strong>Subject:</strong> ${email.subject}</p>
        <div style="margin-top: 8px;">
          ${email.content || email.snippet || ''}
        </div>
      </div>
    `;
    
    // Set reply form data
    setTo(replyToAddress);
    setSubject(email.subject.startsWith('Re: ') ? email.subject : `Re: ${email.subject}`);
    setBody(quotedContent);
    setReplyingTo(email);
    setReplyConversation(conversation);
    setReplyOpen(true);
  };

  // Filter conversations based on unread status
  const showUnreadOnly = showOnlyUnread;
  const filteredConversations = showUnreadOnly 
    ? currentConversations.filter(conv => conv.unreadCount > 0)
    : currentConversations;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (connections.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-heading font-bold">Mailbox</h1>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center">
            <CardHeader>
              <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <CardTitle className="text-2xl">Connect Your Gmail</CardTitle>
              <CardDescription>
                Connect your Gmail account to manage emails directly within Ayra. Click to reconnect with updated permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={connectGmail} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Connect Gmail Account
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-heading font-bold">Mailbox</h1>
            <Badge variant="secondary">
              {connections[0].email_address}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchEmails()} disabled={emailLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${emailLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={disconnectGmail} disabled={loading}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Reconnect Gmail
            </Button>
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <Plus className="w-4 h-4 mr-2" />
                  Compose
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Compose Email</DialogTitle>
                  <DialogDescription>
                    Send a new email from your connected Gmail account
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="to">To</Label>
                    <Input
                      id="to"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="recipient@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <Label htmlFor="body">Message</Label>
                    <Textarea
                      id="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Type your message here..."
                      rows={12}
                      className="resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setComposeOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={saveDraft} disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button onClick={() => sendEmail(false)} disabled={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Email
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Reply Dialog */}
            <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Reply to Email</DialogTitle>
                  <DialogDescription>
                    Reply to {replyingTo?.from}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="reply-to">To</Label>
                    <Input
                      id="reply-to"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="recipient@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reply-subject">Subject</Label>
                    <Input
                      id="reply-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reply-body">Message</Label>
                    <Textarea
                      id="reply-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Type your reply message here..."
                      rows={12}
                      className="resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReplyOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={replyToEmail} disabled={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Reply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Draft Edit Dialog */}
            <Dialog open={draftEditOpen} onOpenChange={setDraftEditOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Draft</DialogTitle>
                  <DialogDescription>
                    Edit your draft email
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="draft-to">To</Label>
                    <Input
                      id="draft-to"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="recipient@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="draft-subject">Subject</Label>
                    <Input
                      id="draft-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <Label htmlFor="draft-body">Message</Label>
                    <Textarea
                      id="draft-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Type your message here..."
                      rows={12}
                      className="resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDraftEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={saveDraft} disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button onClick={sendDraftAsEmail} disabled={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Email
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">
              {currentView === 'sent' ? 'Sent Mail' : currentView === 'drafts' ? 'Drafts' : 'Mailbox'}
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex bg-muted rounded-lg p-1">
                <button
                  onClick={() => handleViewChange('inbox')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'inbox' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Inbox
                </button>
                <button
                  onClick={() => handleViewChange('sent')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'sent' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sent
                </button>
                <button
                  onClick={() => handleViewChange('drafts')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'drafts' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Drafts
                </button>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search emails..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchEmails(searchQuery)}
              />
            </div>
            <Button 
              variant="outline" 
              onClick={() => searchEmails(searchQuery)}
              disabled={searchLoading}
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </Button>
            <Button 
              variant={showOnlyUnread ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyUnread(!showOnlyUnread)}
            >
              {showOnlyUnread ? 'Show All' : 'Unread Only'}
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Email List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Conversations
                {filteredConversations.length > 0 && (
                  <Badge variant="secondary">{filteredConversations.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-16rem)]">
                {emailLoading && filteredConversations.length === 0 ? (
                  <div className="p-6 text-center">
                    <RefreshCw className="w-8 h-8 mx-auto animate-spin text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">Loading emails...</p>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-6 text-center">
                    <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {searchQuery ? 'No emails found for your search.' : `No ${currentView} emails found.`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border">
                      {filteredConversations.map((conversation, index) => {
                          const firstEmail = conversation.emails[0];
                          const isSelected = selectedConversation?.id === conversation.id;
                          
                          return (
                            <div key={conversation.id}>
                              <div
                                className={`p-4 cursor-pointer transition-colors group ${
                                  isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                                }`}
                                onClick={() => handleConversationClick(conversation)}
                              >
                                <div className="flex items-start justify-between gap-3 w-full max-w-full overflow-hidden">
                                  <div className="min-w-0 flex-1 overflow-hidden">
                                    <div className="flex items-center gap-2 mb-1 min-w-0">
                                      <p className="font-medium truncate flex-1 min-w-0">
                                        {firstEmail.from.split('<')[0].trim() || firstEmail.from}
                                      </p>
                                      {conversation.unreadCount > 0 && (
                                        <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                                      )}
                                      {conversation.messageCount > 1 && (
                                        <Badge variant="outline" className="text-xs flex-shrink-0">
                                          {conversation.messageCount}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="font-medium text-sm truncate mb-1">
                                      {conversation.subject}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {firstEmail.snippet}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {formatDate(conversation.lastDate)}
                                    </p>
                                  </div>
                                  
                                  <div className="flex items-start gap-1 flex-shrink-0">
                                    {conversation.messageCount > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => toggleConversationExpansion(conversation.id, e)}
                                        title={expandedConversations.has(conversation.id) ? "Collapse" : "Expand"}
                                      >
                                        {expandedConversations.has(conversation.id) ? 
                                          <ChevronDown className="w-3 h-3" /> : 
                                          <ChevronRight className="w-3 h-3" />
                                        }
                                      </Button>
                                    )}
                                    
                                    {currentView === 'drafts' && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          editDraft(conversation.emails[0]);
                                        }}
                                        title="Edit draft"
                                      >
                                        <Reply className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:bg-destructive/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteConversation(conversation);
                                      }}
                                      title={`Delete ${currentView === 'drafts' ? 'drafts' : 'conversation'}`}
                                    >
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded conversation view */}
                              {expandedConversations.has(conversation.id) && conversation.messageCount > 1 && (
                                <div className="bg-accent/30 border-l-2 border-primary/20 ml-4 w-full max-w-full overflow-hidden">
                                  <div className="p-2 space-y-1 w-full max-w-full overflow-hidden">
                                    {conversation.emails
                                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                      .map((email, emailIndex) => (
                                      <div
                                        key={email.id}
                                        className="p-3 hover:bg-accent/50 rounded-md cursor-pointer transition-colors group border border-border/30 w-full max-w-full overflow-hidden"
                                         onClick={(e) => handleEmailClick(email, conversation)}
                                       >
                                        <div className="grid grid-cols-[1fr,auto] gap-3 w-full max-w-full overflow-hidden items-start">
                                          <div className="min-w-0 overflow-hidden">
                                            <div className="flex items-center gap-2 mb-1 min-w-0">
                                              <p className="text-xs font-medium truncate flex-1 min-w-0">
                                                {email.from.split('<')[0].trim() || email.from}
                                              </p>
                                               {email.unread && (
                                                 <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                                               )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                              {email.snippet}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {formatDate(email.date)}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:bg-destructive/10"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteEmail(email.id, conversation.id);
                                              }}
                                              title="Delete email"
                                            >
                                              <Trash2 className="w-3 h-3 text-destructive" />
                                            </Button>
                                            {currentView === 'drafts' ? (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  editDraft(email);
                                                }}
                                                title="Edit draft"
                                              >
                                                <Reply className="w-3 h-3" />
                                              </Button>
                                            ) : (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   handleReplyClick(email, conversation);
                                                 }}
                                                 title="Reply to email"
                                               >
                                                <Reply className="w-3 h-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {index < filteredConversations.length - 1 && <Separator />}
                              </div>
                            );
                          })}
                      </div>
                      
                      {currentPageToken && !currentAllEmailsLoaded && (
                        <div className="p-4 border-t">
                          <Button 
                            variant="outline" 
                            onClick={loadMoreEmails}
                            disabled={emailLoading}
                            className="w-full"
                          >
                            {emailLoading ? 'Loading...' : 'Load More Emails'}
                          </Button>
                        </div>
                      )}
                      
                      {currentAllEmailsLoaded && currentConversations.length > 5 && (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground">
                            All {currentView === 'sent' ? 'sent emails' : currentView === 'drafts' ? 'drafts' : 'emails'} loaded
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Email/Thread Content */}
            <Card className="lg:col-span-2 min-w-0 overflow-hidden">
              <CardContent className="p-0">
                {selectedConversation ? (
                  <div className="h-[calc(100vh-10rem)]">
                    <div className="p-6 border-b">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-semibold">{selectedConversation.subject}</h2>
                          {selectedConversation.messageCount > 1 && !selectedEmail && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {selectedConversation.messageCount} messages
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedEmail ? (
                            <>
                              {currentView !== 'drafts' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReplyClick(selectedEmail, selectedConversation)}
                                  className="text-xs"
                                >
                                  <Reply className="w-3 h-3 mr-1" />
                                  Reply
                                </Button>
                              )}
                              {currentView === 'drafts' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => editDraft(selectedEmail)}
                                  className="text-xs"
                                >
                                  <Reply className="w-3 h-3 mr-1" />
                                  Edit Draft
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteEmail(selectedEmail.id, selectedConversation.id)}
                                className="text-xs"
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedEmail(null)}
                                className="text-xs"
                              >
                                View Full Thread
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteConversation(selectedConversation)}
                              className="text-xs"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete {currentView === 'drafts' ? 'Drafts' : 'Conversation'}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{selectedConversation.participants.map(p => p.split('<')[0].trim()).join(', ')}</span>
                        </div>
                        {selectedConversation.unreadCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedConversation.unreadCount} unread
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      {selectedEmail ? (
                        <EmailContent 
                          key={selectedEmail.id}
                          conversation={selectedConversation}
                        />
                      ) : (
                        selectedConversation.emails
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map(email => (
                            <EmailContent 
                              key={email.id}
                              conversation={selectedConversation}
                            />
                          ))
                      )}
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
                    <div className="text-center">
                      <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Select a conversation to view its content</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  };

  export default Mailbox;
