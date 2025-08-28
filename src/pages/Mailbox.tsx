import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Mail, Plus, Send, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Paperclip, Trash2 } from 'lucide-react';
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
  content: string;
  unread: boolean;
  attachments?: Attachment[];
}

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
  attachmentId?: string;
}

interface Conversation {
  id: string;
  subject: string;
  emails: Email[];
  messageCount: number;
  lastDate: string;
  unreadCount: number;
  participants: string[];
}

interface ComposeFormData {
  to: string;
  subject: string;
  content: string;
  replyTo?: string;
  threadId?: string;
}

const Mailbox: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

  // Compose dialog state
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeFormData>({
    to: '',
    subject: '',
    content: ''
  });
  const [sendingEmail, setSendingEmail] = useState(false);

  // Pagination state
  const [currentPageToken, setCurrentPageToken] = useState<string | null>(null);
  const [currentAllEmailsLoaded, setCurrentAllEmailsLoaded] = useState(false);

  // View state
  const [currentView, setCurrentView] = useState<'inbox' | 'sent'>('inbox');
  const [currentConversations, setCurrentConversations] = useState<Conversation[]>([]);
  
  // Cache for each view to improve performance
  const [viewCache, setViewCache] = useState<{
    inbox?: Conversation[];
    sent?: Conversation[];
  }>({});
  const [viewLoading, setViewLoading] = useState<{
    inbox: boolean;
    sent: boolean;
  }>({ inbox: false, sent: false });

  // Draft editing state - REMOVED (no longer supporting drafts)

  useEffect(() => {
    if (user) {
      loadEmailsForView();
    }
  }, [user]);

  // Handle view switching with caching
  useEffect(() => {
    if (user && viewCache[currentView]) {
      setCurrentConversations(viewCache[currentView]!);
    } else if (user) {
      loadEmailsForView();
    }
  }, [currentView]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  // Function to aggressively clean email content by removing ALL HTML, CSS, and styling
  const cleanEmailContentForReply = (htmlContent: string): string => {
    if (!htmlContent) return '';
    
    let cleaned = htmlContent;
    
    // First, remove all style blocks and their contents
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove all script blocks and their contents
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Remove HTML comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove DOCTYPE declarations
    cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
    
    // Remove XML declarations
    cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, '');
    
    // Remove all HTML tags completely
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
    
    // Clean up HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&hellip;/g, '...')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, '"')
      .replace(/&ldquo;/g, '"')
      .replace(/&#\d+;/g, ' '); // Remove any remaining numeric entities
    
    // Remove CSS properties and selectors that might have leaked through
    cleaned = cleaned.replace(/[a-zA-Z-]+\s*:\s*[^;]+;/g, ' ');
    cleaned = cleaned.replace(/@[a-zA-Z-]+[^{]*\{[^}]*\}/g, ' ');
    cleaned = cleaned.replace(/\.[a-zA-Z-_][a-zA-Z0-9-_]*\s*\{[^}]*\}/g, ' ');
    cleaned = cleaned.replace(/#[a-zA-Z-_][a-zA-Z0-9-_]*\s*\{[^}]*\}/g, ' ');
    
    // Remove URLs that are not part of meaningful text
    cleaned = cleaned.replace(/https?:\/\/[^\s<>"']{20,}/g, ' ');
    
    // Clean up whitespace and line breaks
    cleaned = cleaned
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/\r/g, '\n')            // Convert remaining \r to \n
      .replace(/\n{4,}/g, '\n\n\n')    // Limit to maximum 3 consecutive line breaks
      .replace(/[ \t]{2,}/g, ' ')      // Collapse multiple spaces/tabs to single space
      .replace(/[ \t]*\n[ \t]*/g, '\n') // Clean up spaces around line breaks
      .replace(/^\s+|\s+$/g, '')       // Trim start and end
      .split('\n')                     // Split into lines
      .map(line => line.trim())        // Trim each line
      .filter(line => line.length > 0 && !line.match(/^[^a-zA-Z0-9]*$/)) // Remove empty or symbol-only lines
      .join('\n')                      // Rejoin
      .replace(/\n{3,}/g, '\n\n');     // Final cleanup of excessive line breaks
    
    // If the result is still very long or seems to contain CSS/HTML artifacts, try a more aggressive approach
    if (cleaned.length > 2000 || cleaned.match(/[{}@#\.]/)) {
      // Try to extract only sentences and readable text
      const sentences = cleaned.match(/[A-Z][^.!?]*[.!?]/g) || [];
      if (sentences.length > 0) {
        cleaned = sentences.join(' ').trim();
      }
    }
    
    // Final safety check - if it still looks like code/CSS, return a simple message
    if (cleaned.match(/[{}@#]{3,}/) || cleaned.length < 10) {
      return '[Original message content cannot be cleanly displayed as text]';
    }
    
    return cleaned.trim();
  };

  const loadEmailsForView = async (view = currentView, pageToken?: string | null) => {
    if (!user || viewLoading[view]) return;

    try {
      setViewLoading(prev => ({ ...prev, [view]: true }));
      setEmailLoading(true);
      
      const query = view === 'inbox' ? 'in:inbox' : 'in:sent';
      
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'getEmails',
          query,
          pageToken: pageToken || undefined
        }
      });

      if (error) {
        console.error('Error loading emails:', error);
        toast({
          title: "Error",
          description: "Failed to load emails. Please try again.",
          variant: "destructive"
        });
        return;
      }

      const { conversations: newConversations, nextPageToken, allEmailsLoaded } = data;
      
      if (pageToken) {
        // Append to existing conversations for pagination
        const updatedConversations = [...(viewCache[view] || []), ...newConversations];
        setViewCache(prev => ({ ...prev, [view]: updatedConversations }));
        if (view === currentView) {
          setCurrentConversations(updatedConversations);
        }
      } else {
        // Replace conversations for initial load or refresh
        setViewCache(prev => ({ ...prev, [view]: newConversations }));
        if (view === currentView) {
          setCurrentConversations(newConversations);
        }
        setConversations(newConversations);
      }
      
      setCurrentPageToken(nextPageToken);
      setCurrentAllEmailsLoaded(allEmailsLoaded);
      
    } catch (error) {
      console.error('Error loading emails:', error);
      toast({
        title: "Error",
        description: "Failed to load emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setViewLoading(prev => ({ ...prev, [view]: false }));
      setEmailLoading(false);
    }
  };

  const refreshCurrentView = () => {
    console.log('Refresh button clicked for view:', currentView);
    // Clear cache for current view
    setViewCache(prev => ({ ...prev, [currentView]: undefined }));
    // Clear current conversations immediately to show loading state
    setCurrentConversations([]);
    // Reset page token
    setCurrentPageToken(null);
    setCurrentAllEmailsLoaded(false);
    // Load fresh data
    loadEmailsForView();
  };

  const loadMoreEmails = () => {
    if (currentPageToken && !emailLoading && !viewLoading[currentView]) {
      loadEmailsForView(currentView, currentPageToken);
    }
  };

  const handleSearch = async () => {
    if (!user || !searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'searchEmails',
          query: searchQuery
        }
      });

      if (error) {
        console.error('Error searching emails:', error);
        toast({
          title: "Error",
          description: "Failed to search emails. Please try again.",
          variant: "destructive"
        });
        return;
      }

      setCurrentConversations(data.conversations);
      
    } catch (error) {
      console.error('Error searching emails:', error);
      toast({
        title: "Error", 
        description: "Failed to search emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleConversationClick = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setSelectedEmail(null);
  
    // Mark conversation as read if it has unread messages
    if (conversation.unreadCount > 0) {
      markConversationAsRead(conversation);
    }
  };

  const handleEmailClick = (email: Email, conversation: Conversation) => {
    setSelectedConversation(conversation);
    setSelectedEmail(email);
    
    // Mark email as read if unread
    if (email.unread) {
      markEmailAsRead(email.id, conversation.id);
    }
  };

  const markConversationAsRead = async (conversation: Conversation) => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'markAsRead',
          threadId: conversation.id
        }
      });

      if (error) {
        console.error('Error marking conversation as read:', error);
        return;
      }

      // Update local state
      setCurrentConversations(prev => 
        prev.map(conv => 
          conv.id === conversation.id 
            ? { ...conv, unreadCount: 0, emails: conv.emails.map(email => ({ ...email, unread: false })) }
            : conv
        )
      );
      
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  };

  const markEmailAsRead = async (emailId: string, conversationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'markAsRead',
          messageId: emailId
        }
      });

      if (error) {
        console.error('Error marking email as read:', error);
        return;
      }

      // Update local state
      setCurrentConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { 
                ...conv, 
                unreadCount: Math.max(0, conv.unreadCount - 1),
                emails: conv.emails.map(email => 
                  email.id === emailId ? { ...email, unread: false } : email
                )
              }
            : conv
        )
      );
      
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  };

  const deleteConversation = async (conversation: Conversation) => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'deleteThread',
          threadId: conversation.id
        }
      });

      if (error) {
        console.error('Error deleting conversation:', error);
        toast({
          title: "Error",
          description: "Failed to delete conversation. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Remove from local state
      setCurrentConversations(prev => prev.filter(conv => conv.id !== conversation.id));
      
      // Clear selection if deleted conversation was selected
      if (selectedConversation?.id === conversation.id) {
        setSelectedConversation(null);
        setSelectedEmail(null);
      }

      toast({
        title: "Success",
        description: "Conversation deleted successfully."
      });
      
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to delete conversation. Please try again.",
        variant: "destructive"
      });
    }
  };

  const deleteEmail = async (emailId: string, conversationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'deleteMessage',
          messageId: emailId
        }
      });

      if (error) {
        console.error('Error deleting email:', error);
        toast({
          title: "Error",
          description: "Failed to delete email. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Update local state
      setCurrentConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { 
                ...conv,
                emails: conv.emails.filter(email => email.id !== emailId),
                messageCount: conv.messageCount - 1
              }
            : conv
        ).filter(conv => conv.emails.length > 0) // Remove conversations with no emails
      );

      // Clear selection if deleted email was selected
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }

      toast({
        title: "Success",
        description: "Email deleted successfully."
      });
      
    } catch (error) {
      console.error('Error deleting email:', error);
      toast({
        title: "Error",
        description: "Failed to delete email. Please try again.",
        variant: "destructive"
      });
    }
  };

  const sendEmail = async () => {
    if (!user) return;

    try {
      setSendingEmail(true);
      
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'sendEmail',
          to: composeForm.to,
          subject: composeForm.subject,
          content: composeForm.content,
          replyTo: composeForm.replyTo,
          threadId: composeForm.threadId
        }
      });

      if (error) {
        console.error('Error sending email:', error);
        toast({
          title: "Error",
          description: "Failed to send email. Please try again.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Success",
        description: "Email sent successfully!"
      });

      // If this was a reply to an existing conversation, add the sent email to the local state
      if (composeForm.threadId && selectedConversation && data?.sentMessage) {
        const sentEmail: Email = {
          id: data.sentMessage.id || `temp-${Date.now()}`,
          threadId: composeForm.threadId,
          snippet: composeForm.content.substring(0, 100) + (composeForm.content.length > 100 ? '...' : ''),
          subject: composeForm.subject,
          from: user.email || 'me',
          to: composeForm.to,
          date: new Date().toISOString(),
          content: composeForm.content,
          unread: false,
          attachments: []
        };

        // Update the selected conversation with the new email
        const updatedConversation = {
          ...selectedConversation,
          emails: [...selectedConversation.emails, sentEmail],
          messageCount: selectedConversation.messageCount + 1,
          lastDate: sentEmail.date
        };

        setSelectedConversation(updatedConversation);

        // Update the conversations list
        setCurrentConversations(prev => 
          prev.map(conv => 
            conv.id === composeForm.threadId 
              ? updatedConversation
              : conv
          )
        );

        // Update the view cache
        setViewCache(prev => ({
          ...prev,
          [currentView]: prev[currentView]?.map(conv => 
            conv.id === composeForm.threadId 
              ? updatedConversation
              : conv
          )
        }));
      }

      // Reset form and close dialog
      setComposeForm({ to: '', subject: '', content: '' });
      setShowComposeDialog(false);

      // Only refresh if it wasn't a reply (for new emails or if we couldn't update locally)
      if (!composeForm.threadId) {
        refreshCurrentView();
      }
      
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // REMOVED: All draft-related functions and state have been removed

  const handleReplyClick = (email: Email, conversation: Conversation) => {
    const replyToEmail = email.from.includes('<') ? 
      email.from.split('<')[1].replace('>', '') : 
      email.from;
    
    const replySubject = email.subject.startsWith('Re: ') ? 
      email.subject : 
      `Re: ${email.subject}`;

    // Clean the original email content by removing HTML wrapper and converting to plain text
    const cleanContent = cleanEmailContentForReply(email.content || '');

    // Format the original email content for quoting with plain text line breaks for textarea
    const quotedContent = `\n\n\n\n\n\n--- Original Message ---\nFrom: ${email.from}\nDate: ${email.date}\nSubject: ${email.subject}\n\n${cleanContent}`;

    setComposeForm({
      to: replyToEmail,
      subject: replySubject,
      content: quotedContent,
      replyTo: email.id,
      threadId: conversation.id
    });
    
    setShowComposeDialog(true);
  };

  // REMOVED: editDraft function - no longer supporting drafts

  const handleSaveAttachmentToDocuments = async (attachment: Attachment, email: Email) => {
    try {
      // Download the attachment data using Gmail API
      const { data, error } = await supabase.functions.invoke("gmail-api", {
        body: {
          action: "downloadAttachment",
          messageId: email.id,
          attachmentId: attachment.attachmentId,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || 'Failed to download attachment');
      }

      // Convert base64 data to Uint8Array
      const base64Data = data.data;
      const binaryString = atob(base64Data);
      const uint8Array = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }

      // Generate a unique file path for storage
      const timestamp = Date.now();
      const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user?.id}/documents/${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, uint8Array, {
          contentType: attachment.mimeType,
          upsert: false
        });

      if (storageError) throw storageError;

      // Save document record to database
      const { error: dbError } = await supabase
        .from('user_documents')
        .insert({
          user_id: user?.id,
          name: attachment.filename,
          file_path: filePath,
          file_size: attachment.size,
          mime_type: attachment.mimeType,
          source_type: 'email_attachment',
          source_email_id: email.id,
          source_email_subject: email.subject,
          description: `Saved from email: ${email.subject}`
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: `Attachment "${attachment.filename}" saved to Documents`,
      });
    } catch (error) {
      console.error('Error saving attachment to documents:', error);
      toast({
        title: "Error",
        description: "Failed to save attachment to documents",
        variant: "destructive",
      });
    }
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

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive"
      });
    }
  };

  const filteredConversations = currentConversations.filter(conversation => {
    if (showOnlyUnread && conversation.unreadCount === 0) return false;
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      conversation.subject.toLowerCase().includes(searchLower) ||
      conversation.emails.some(email => 
        email.from.toLowerCase().includes(searchLower) ||
        email.snippet.toLowerCase().includes(searchLower)
      )
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        {/* Header with controls */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Top row - Compose and Refresh buttons (mobile/tablet top right, desktop right) */}
          <div className="flex justify-end lg:justify-between lg:items-center">
            {/* View Toggle - Desktop left side */}
            <div className="hidden lg:inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-fit">
              <button
                onClick={() => setCurrentView('inbox')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-w-[80px] gap-2 ${
                  currentView === 'inbox' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'hover:bg-background/50'
                }`}
              >
                <Mail className="w-4 h-4" />
                Inbox
              </button>
              <button
                onClick={() => setCurrentView('sent')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-w-[80px] gap-2 ${
                  currentView === 'sent' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'hover:bg-background/50'
                }`}
              >
                <Send className="w-4 h-4" />
                Sent
              </button>
            </div>

            {/* Action Controls - Right side on all screens */}
            <div className="flex gap-2">
              {/* Desktop search */}
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search emails..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-64 pl-10"
                />
              </div>
              
              <Button onClick={() => refreshCurrentView()} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Drawer open={showComposeDialog} onOpenChange={setShowComposeDialog}>
                <DrawerTrigger asChild>
                  <Button className="gap-2" onClick={() => {
                    // Reset form to empty state for new email
                    setComposeForm({ to: '', subject: '', content: '' });
                  }} size="sm">
                    <Plus className="w-4 h-4" />
                    Compose
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-w-none h-[80vh]">
                  <DrawerHeader>
                    <DrawerTitle>Compose Email</DrawerTitle>
                    <DrawerDescription>
                      Send a new email
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="px-4 pb-4 space-y-4 flex-1 overflow-y-auto">
                    <div>
                      <Label htmlFor="to">To</Label>
                      <Input
                        id="to"
                        value={composeForm.to}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, to: e.target.value }))}
                        placeholder="recipient@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Email subject"
                      />
                    </div>
                    <div>
                      <Label htmlFor="content">Message</Label>
                      <Textarea
                        id="content"
                        value={composeForm.content}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Write your message here..."
                        rows={15}
                        className="min-h-[300px] resize-none"
                      />
                    </div>
                  </div>
                  <DrawerFooter>
                    <div className="flex gap-2 w-full">
                      <Button 
                        onClick={sendEmail}
                        disabled={sendingEmail || !composeForm.to || !composeForm.subject}
                        className="gap-2 flex-1"
                      >
                        <Send className="w-4 h-4" />
                        {sendingEmail ? 'Sending...' : 'Send'}
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setShowComposeDialog(false);
                        setComposeForm({ to: '', subject: '', content: '' });
                      }} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </div>
          </div>

          {/* Second row - Mobile/Tablet search and toggle */}
          <div className="flex flex-col sm:flex-row gap-4 lg:hidden items-start">
            {/* Mobile/Tablet search */}
            <div className="relative w-full sm:flex-1 sm:min-w-0 order-1 sm:order-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search emails..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10"
              />
            </div>

            {/* View Toggle - Mobile/Tablet */}
            <div className="inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-fit order-2 sm:order-2">
              <button
                onClick={() => setCurrentView('inbox')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-w-[80px] gap-2 ${
                  currentView === 'inbox' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'hover:bg-background/50'
                }`}
              >
                <Mail className="w-4 h-4" />
                Inbox
              </button>
              <button
                onClick={() => setCurrentView('sent')}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-w-[80px] gap-2 ${
                  currentView === 'sent' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'hover:bg-background/50'
                }`}
              >
                <Send className="w-4 h-4" />
                Sent
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Email List */}
          <Card className="lg:col-span-1 min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {currentView === 'inbox' ? 'Inbox' : 'Sent'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-16rem)] w-full">
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
                    <div className="divide-y divide-border min-w-0">
                      {filteredConversations.map((conversation, index) => {
                          const firstEmail = conversation.emails[0];
                          const isSelected = selectedConversation?.id === conversation.id;
                          
                          return (
                            <div key={conversation.id}>
                              <div
                                className={`p-4 cursor-pointer transition-colors group max-w-full overflow-hidden ${
                                  isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                                }`}
                                onClick={() => handleConversationClick(conversation)}
                              >
                                <div className="flex items-start justify-between gap-3 w-full min-w-0 overflow-hidden">
                                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                      <p className="font-medium truncate flex-1 min-w-0 max-w-[200px] overflow-hidden">
                                        {firstEmail.from.split('<')[0].trim() || firstEmail.from}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                      <p className="font-medium text-sm truncate flex-1 min-w-0 max-w-[220px] overflow-hidden">
                                        {conversation.subject}
                                      </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate max-w-[260px] overflow-hidden">
                                      {firstEmail.snippet}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px] overflow-hidden">
                                      {formatDate(conversation.lastDate)}
                                    </p>
                                  </div>
                                  
                                  <div className="flex flex-col justify-between h-full min-h-[80px] flex-shrink-0 items-end w-8">
                                    {/* Top right - Paperclip icon */}
                                    <div className="flex justify-end">
                                      {conversation.emails.some(email => email.attachments && email.attachments.length > 0) && (
                                        <Paperclip className="w-3 h-3 text-muted-foreground" />
                                      )}
                                    </div>
                                    
                                    {/* Middle right - Unread dot */}
                                    <div className="flex justify-center">
                                      {conversation.unreadCount > 0 && (
                                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                                      )}
                                    </div>
                                    
                                    {/* Bottom right - Action buttons */}
                                    <div className="flex gap-1 items-center">
                                      {conversation.messageCount > 1 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="p-1 h-5 w-5 opacity-100 transition-opacity"
                                          onClick={(e) => toggleConversationExpansion(conversation.id, e)}
                                          title={expandedConversations.has(conversation.id) ? "Collapse" : "Expand"}
                                        >
                                          {expandedConversations.has(conversation.id) ? 
                                            <ChevronDown className="w-3 h-3" /> : 
                                            <ChevronRight className="w-3 h-3" />
                                          }
                                        </Button>
                                      )}
                                      
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="p-1 h-5 w-5 opacity-100 transition-opacity flex-shrink-0 hover:bg-destructive/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteConversation(conversation);
                                        }}
                                        title={`Delete conversation`}
                                      >
                                        <Trash2 className="w-3 h-3 text-destructive" />
                                      </Button>
                                    </div>
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
                            All {currentView === 'sent' ? 'sent emails' : 'emails'} loaded
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReplyClick(
                              selectedEmail || selectedConversation.emails[selectedConversation.emails.length - 1],
                              selectedConversation
                            )}
                            className="gap-2"
                          >
                            <Reply className="w-4 h-4" />
                            Reply
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteConversation(selectedConversation)}
                            className="gap-2 hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <ScrollArea className="h-[calc(100vh-18rem)]">
                      {selectedEmail ? (
                        // Show only the selected email
                        <EmailContent 
                          key={selectedEmail.id}
                          conversation={{
                            ...selectedConversation,
                            emails: [selectedEmail]  // Only show the selected email
                          }}
                          onSaveAttachment={handleSaveAttachmentToDocuments}
                        />
                      ) : (
                        // Show all emails in the conversation thread
                        <EmailContent 
                          key={selectedConversation.id}
                          conversation={selectedConversation}
                          onSaveAttachment={handleSaveAttachmentToDocuments}
                        />
                      )}
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
                    <div className="text-center">
                      <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No email selected</h3>
                      <p className="text-muted-foreground">Select an email from the list to view its content</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
};

export default Mailbox;