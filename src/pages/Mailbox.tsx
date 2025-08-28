import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Mail, Plus, Send, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Paperclip, Trash2, X, Upload, FolderOpen, Menu } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import EmailContent from '@/components/EmailContent';
import DocumentPicker from '@/components/DocumentPicker';

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
  attachments?: File[];
  documentAttachments?: UserDocument[];
}

interface UserDocument {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  source_type: 'upload' | 'email_attachment';
  source_email_id: string | null;
  source_email_subject: string | null;
  category: string | null;
  tags: string[] | null;
  description: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

const Mailbox: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isDrawerView = useIsDrawerView();

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
    content: '',
    attachments: [],
    documentAttachments: []
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

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  
  // Add files menu state for mobile compose
  const [showAddFilesMenu, setShowAddFilesMenu] = useState(false);
  const addFilesMenuRef = useRef<HTMLDivElement>(null);
  
  // Click outside handler for add files menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Don't close if clicking inside the menu
      if (addFilesMenuRef.current && addFilesMenuRef.current.contains(target)) {
        return;
      }
      
      // Don't close if clicking on DocumentPicker dialog elements
      const dialogElement = document.querySelector('[role="dialog"]');
      if (dialogElement && dialogElement.contains(target)) {
        return;
      }
      
      // Close the menu for other clicks
      setShowAddFilesMenu(false);
    };

    if (showAddFilesMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddFilesMenu]);

  // Draft editing state - REMOVED (no longer supporting drafts)

  useEffect(() => {
    if (user) {
      // Preload both inbox and sent views for instant switching
      loadEmailsForView('inbox');
      loadEmailsForView('sent');
    }
  }, [user]);

  // Handle view switching with instant cache access
  useEffect(() => {
    if (user && viewCache[currentView]) {
      // Immediately show cached data
      setCurrentConversations(viewCache[currentView]!);
      setEmailLoading(false);
    }
  }, [currentView, viewCache]);

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

  // Function to gently clean email content for resending (less aggressive than reply cleaning)
  const cleanEmailContentForResend = (htmlContent: string): string => {
    if (!htmlContent) return '';
    
    let cleaned = htmlContent;
    
    // Only remove HTML tags and decode basic entities, preserve the actual content
    cleaned = cleaned.replace(/<[^>]*>/g, ''); // Remove HTML tags
    
    // Decode common HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
    
    // Basic whitespace cleanup
    cleaned = cleaned
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    
    return cleaned || htmlContent; // Return original if cleaning results in empty string
  };

  const loadEmailsForView = async (view = currentView, pageToken?: string | null) => {
    if (!user) return;

    // If we already have cached data and this is not a pagination request, return early
    if (!pageToken && viewCache[view] && viewCache[view]!.length > 0) {
      if (view === currentView) {
        setCurrentConversations(viewCache[view]!);
        setEmailLoading(false);
      }
      return;
    }

    if (viewLoading[view]) return;

    try {
      setViewLoading(prev => ({ ...prev, [view]: true }));
      
      // Only show loading state for the current view
      if (view === currentView) {
        setEmailLoading(true);
      }
      
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
        if (view === currentView) {
          toast({
            title: "Error",
            description: "Failed to load emails. Please try again.",
            variant: "destructive"
          });
        }
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
      
      if (view === currentView) {
        setCurrentPageToken(nextPageToken);
        setCurrentAllEmailsLoaded(allEmailsLoaded);
      }
      
    } catch (error) {
      console.error('Error loading emails:', error);
      if (view === currentView) {
        toast({
          title: "Error",
          description: "Failed to load emails. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setViewLoading(prev => ({ ...prev, [view]: false }));
      if (view === currentView) {
        setEmailLoading(false);
      }
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

    // Open drawer on smaller screens
    if (isDrawerView) {
      setMobileDrawerOpen(true);
    }
  };

  const handleEmailClick = (email: Email, conversation: Conversation) => {
    setSelectedConversation(conversation);
    setSelectedEmail(email);
    
    // Mark email as read if unread
    if (email.unread) {
      markEmailAsRead(email.id, conversation.id);
    }

    // Open drawer on smaller screens
    if (isDrawerView) {
      setMobileDrawerOpen(true);
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
      
      console.log('Starting email send process...');
      console.log('Compose form state:', {
        to: composeForm.to,
        subject: composeForm.subject,
        hasContent: !!composeForm.content,
        fileAttachments: composeForm.attachments?.length || 0,
        documentAttachments: composeForm.documentAttachments?.length || 0,
        documentNames: composeForm.documentAttachments?.map(d => d.name) || []
      });
      
      // Convert file attachments to base64 for sending
      const fileAttachmentsData = await Promise.all(
        (composeForm.attachments || []).map(async (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve({
                filename: file.name,
                content: base64,
                contentType: file.type,
                size: file.size
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );

      // Convert document attachments to base64 for sending
      let documentAttachmentsData = [];
      
      if (composeForm.documentAttachments && composeForm.documentAttachments.length > 0) {
        console.log('Processing document attachments:', composeForm.documentAttachments.length);
        
        try {
          documentAttachmentsData = await Promise.all(
            composeForm.documentAttachments.map(async (doc) => {
              try {
                console.log('Downloading document:', doc.name, 'from path:', doc.file_path);
                
                const { data, error } = await supabase.storage
                  .from('documents')
                  .download(doc.file_path);

                if (error) {
                  console.error('Storage download error:', error);
                  throw error;
                }

                if (!data) {
                  throw new Error('No data received from storage');
                }

                return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    console.log('Successfully converted document to base64:', doc.name);
                    resolve({
                      filename: doc.name,
                      content: base64,
                      contentType: doc.mime_type || 'application/octet-stream',
                      size: doc.file_size || 0
                    });
                  };
                  reader.onerror = () => {
                    console.error('FileReader error for document:', doc.name);
                    reject(new Error(`Failed to read file: ${doc.name}`));
                  };
                  reader.readAsDataURL(data);
                });
              } catch (error) {
                console.error(`Failed to download document ${doc.name}:`, error);
                throw new Error(`Failed to attach document: ${doc.name}. Error: ${error.message}`);
              }
            })
          );
          console.log('Successfully processed all document attachments:', documentAttachmentsData.length);
        } catch (error) {
          console.error('Document attachment processing failed:', error);
          toast({
            title: "Document Attachment Error",
            description: `Failed to attach documents: ${error.message}`,
            variant: "destructive"
          });
          return; // Exit early if document processing fails
        }
      } else {
        console.log('No document attachments to process');
      }

      const allAttachments = [...fileAttachmentsData, ...documentAttachmentsData];
      
      console.log('Total attachments processed:', allAttachments.length);
      console.log('Attachment data:', allAttachments.map(att => ({ 
        filename: (att as any).filename, 
        size: (att as any).size,
        hasContent: !!(att as any).content 
      })));
      
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: { 
          action: 'sendEmail',
          to: composeForm.to,
          subject: composeForm.subject,
          content: composeForm.content,
          replyTo: composeForm.replyTo,
          threadId: composeForm.threadId,
          attachments: allAttachments.length > 0 ? allAttachments : undefined
        }
      });
      
      console.log('Gmail API response:', { data, error });

      if (error) {
        console.error('Error sending email:', error);
        toast({
          title: "Error",
          description: "Failed to send email. Please try again.",
          variant: "destructive"
        });
        return;
      }


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
      setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
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
    if (currentView === 'sent') {
      // Handle "Send Again" for sent emails - use gentler cleaning
      setComposeForm({
        to: email.to,
        subject: email.subject,
        content: cleanEmailContentForResend(email.content || ''),
        attachments: [],
        documentAttachments: []
      });
    } else {
      // Handle normal reply for inbox emails
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
        threadId: conversation.id,
        attachments: [],
        documentAttachments: []
      });
    }
    
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
    <div className="h-screen bg-background overflow-hidden">
      <div className="container mx-auto p-2 lg:px-8 h-full flex flex-col">
        {/* Desktop Header - Logo and Menu */}
        <div className="hidden lg:flex items-center justify-start py-4 mb-6">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <h1 className="text-3xl font-bold">/Ayra</h1>
            
            {/* Menu Icon */}
            <Menu className="w-5 h-5 cursor-pointer hover:text-primary transition-colors" />
          </div>
        </div>

        {/* Header with controls */}
        <div className="flex flex-col gap-4 mb-2">
          {/* Top row - Mobile/tablet logo + menu on left, compose/refresh on right; Desktop view toggle on left, actions on right */}
          <div className="flex justify-between items-center lg:justify-between">
            {/* Mobile/Tablet Logo and Menu - Left side */}
            <div className="flex lg:hidden items-center gap-4 pl-4">
              <h1 className="text-2xl font-bold">/Ayra</h1>
              <Menu className="w-5 h-5 cursor-pointer hover:text-primary transition-colors" />
            </div>

            {/* View Toggle - Desktop */}
            <div className="hidden lg:flex items-center">
              <div className="inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-fit">
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

            {/* Action Controls - Right side on all screens */}
            <div className="flex gap-2">
              {/* Desktop Search next to refresh button */}
              <div className="hidden lg:flex relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search emails..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-64 pl-10"
                  autoComplete="off"
                  name="email-search"
                />
              </div>
              
              <Button onClick={() => refreshCurrentView()} variant="outline" size="sm" disabled={emailLoading}>
                <RefreshCw className={`w-4 h-4 ${emailLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Drawer open={showComposeDialog} onOpenChange={setShowComposeDialog}>
                <DrawerTrigger asChild>
                  <Button className="gap-2" onClick={() => {
                    // Reset form to empty state for new email
                    setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
                  }} size="sm">
                    <Plus className="w-4 h-4" />
                    Compose
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-w-none h-[90vh]">
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
                        autoComplete="email"
                        name="compose-to"
                        className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Email subject"
                        className="text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="content">Message</Label>
                      <Textarea
                        id="content"
                        value={composeForm.content}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, content: e.target.value }))}
                        onFocus={(e) => {
                          e.preventDefault();
                          e.target.focus({ preventScroll: true });
                        }}
                        placeholder="Write your message here..."
                        rows={15}
                        className="min-h-[300px] resize-none text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    
                     {/* Attachments Display Section - Only show attached files, no action buttons */}
                     {((composeForm.attachments && composeForm.attachments.length > 0) || 
                       (composeForm.documentAttachments && composeForm.documentAttachments.length > 0)) && (
                       <div>
                         <Label>Attachments</Label>
                         <div className="space-y-3">
                           {/* File Attachments */}
                           {composeForm.attachments && composeForm.attachments.length > 0 && (
                             <div className="space-y-2">
                               <h4 className="text-sm font-medium">New Files</h4>
                               {composeForm.attachments.map((file, index) => (
                                 <div key={index} className="flex items-center gap-3 p-2 bg-secondary rounded-lg">
                                   <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                   <div className="flex-1 min-w-0">
                                     <p className="text-sm font-medium truncate">{file.name}</p>
                                     <p className="text-xs text-muted-foreground">
                                       {(file.size / (1024 * 1024)).toFixed(2)} MB
                                     </p>
                                   </div>
                                   <Button
                                     type="button"
                                     variant="ghost"
                                     size="sm"
                                     onClick={() => {
                                       setComposeForm(prev => ({
                                         ...prev,
                                         attachments: prev.attachments?.filter((_, i) => i !== index) || []
                                       }));
                                     }}
                                     className="flex-shrink-0 p-1 h-6 w-6"
                                   >
                                     <X className="w-4 h-4" />
                                   </Button>
                                 </div>
                               ))}
                             </div>
                           )}

                           {/* Document Attachments */}
                           {composeForm.documentAttachments && composeForm.documentAttachments.length > 0 && (
                             <div className="space-y-2">
                               <h4 className="text-sm font-medium">From Documents</h4>
                               {composeForm.documentAttachments.map((doc, index) => (
                                 <div key={doc.id} className="flex items-center gap-3 p-2 bg-accent rounded-lg">
                                   <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                   <div className="flex-1 min-w-0">
                                     <p className="text-sm font-medium truncate">{doc.name}</p>
                                     <div className="flex items-center gap-2">
                                       <p className="text-xs text-muted-foreground">
                                         {doc.file_size ? (doc.file_size / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown size'}
                                       </p>
                                       {doc.source_type === 'email_attachment' && (
                                         <span className="text-xs text-muted-foreground">• From email</span>
                                       )}
                                     </div>
                                   </div>
                                   <Button
                                     type="button"
                                     variant="ghost"
                                     size="sm"
                                     onClick={() => {
                                       setComposeForm(prev => ({
                                         ...prev,
                                         documentAttachments: prev.documentAttachments?.filter(d => d.id !== doc.id) || []
                                       }));
                                     }}
                                     className="flex-shrink-0 p-1 h-6 w-6"
                                   >
                                     <X className="w-4 h-4" />
                                   </Button>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                     
                     {/* Hidden file input */}
                     <input
                       type="file"
                       multiple
                       id="attachments"
                       className="hidden"
                       onChange={(e) => {
                         const files = Array.from(e.target.files || []);
                         setComposeForm(prev => ({
                           ...prev,
                           attachments: [...(prev.attachments || []), ...files]
                         }));
                       }}
                     />
                  </div>
                  <DrawerFooter>
                    {/* Mobile-first bottom action bar */}
                    <div className="flex gap-2">
                      {/* Add Files Button with Dropdown */}
                      <div className="relative" ref={addFilesMenuRef}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddFilesMenu(!showAddFilesMenu)}
                          className="gap-2"
                        >
                          <Paperclip className="w-4 h-4" />
                          Add Files
                        </Button>
                        
                        {/* Dropdown Menu */}
                        {showAddFilesMenu && (
                          <div className="absolute bottom-full left-0 mb-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50">
                            <div className="p-1">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  document.getElementById('attachments')?.click();
                                  setShowAddFilesMenu(false);
                                }}
                                className="w-full justify-start gap-2"
                              >
                                <Upload className="w-4 h-4" />
                                From Device
                              </Button>
                              <DocumentPicker
                                onDocumentsSelected={(documents) => {
                                  console.log('Documents selected in Mailbox:', documents.map(d => d.name));
                                  setComposeForm(prev => ({
                                    ...prev,
                                    documentAttachments: documents
                                  }));
                                  // Only close the dropdown after documents are confirmed
                                  setShowAddFilesMenu(false);
                                }}
                                selectedDocuments={composeForm.documentAttachments || []}
                                trigger={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full justify-start gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Don't close the dropdown when opening DocumentPicker
                                    }}
                                  >
                                    <FolderOpen className="w-4 h-4" />
                                    From Documents
                                  </Button>
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Cancel Button */}
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setShowComposeDialog(false);
                          setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
                          setShowAddFilesMenu(false);
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      
                      {/* Send Button */}
                      <Button 
                        onClick={sendEmail}
                        disabled={sendingEmail || !composeForm.to || !composeForm.subject}
                        className="gap-2 flex-1"
                      >
                        <Send className="w-4 h-4" />
                        {sendingEmail ? 'Sending...' : 
                         `Send${(composeForm.attachments?.length || 0) + (composeForm.documentAttachments?.length || 0) > 0 
                           ? ` (${(composeForm.attachments?.length || 0) + (composeForm.documentAttachments?.length || 0)})`
                           : ''}`}
                      </Button>
                    </div>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </div>
          </div>

          {/* View Toggle and Search - Tablet */}
          <div className="hidden md:flex lg:hidden items-center gap-4">
            <div className="inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-fit">
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

            {/* Tablet Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search emails..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10"
                autoComplete="off"
                name="email-search-tablet"
              />
            </div>
          </div>

          {/* View Toggle - Mobile only */}
          <div className="md:hidden">
            <div className="inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-fit">
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

        {/* Search Section - Mobile only */}
        <div className="mb-4 md:hidden">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search emails..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10"
              autoComplete="off"
              name="email-search-mobile"
            />
          </div>
        </div>

        <div className={`grid gap-6 ${isDrawerView ? 'grid-cols-1' : 'lg:grid-cols-3'} flex-1 overflow-hidden`}>
          {/* Email List */}
          <Card className="lg:col-span-1 min-w-0 h-full overflow-hidden">
            <CardContent className="p-0 overflow-hidden rounded-lg h-full">
              <ScrollArea className="h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] lg:h-[calc(100vh-8rem)] w-full rounded-lg overflow-hidden">
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
                                  isSelected ? 'bg-accent/50' : 'hover:bg-accent/50'
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
                      
                        {/* Load More Button - Inside the scrollable area */}
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
                      </div>
                    </>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Email/Thread Content - Desktop Only */}
            {!isDrawerView && (
              <Card className="lg:col-span-2 min-w-0 overflow-hidden">
                <CardContent className="p-0 h-full">
                  {selectedConversation ? (
                    <div className="h-full flex flex-col">
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
                              {currentView === 'sent' ? 'Send Again' : 'Reply'}
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
                      
                      <ScrollArea className="h-[calc(100vh-8rem)]">
                        <div className="px-6 py-4">
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
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
                      <div className="text-center">
                        <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No email selected</h3>
                        <p className="text-muted-foreground">Select an email from the list to view its content</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Mobile Drawer for Email Content */}
            <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
              <DrawerContent className="h-[90vh] max-w-full">
                <DrawerHeader className="border-b px-4 pb-3">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between w-full min-w-0">
                      <div className="flex-1 min-w-0 max-w-[calc(100%-1rem)]">
                        <DrawerTitle className="text-left text-base leading-tight line-clamp-2 break-words">
                          {selectedConversation?.subject || 'Email'}
                        </DrawerTitle>
                        {selectedConversation && selectedConversation.messageCount > 1 && !selectedEmail && (
                          <DrawerDescription className="text-left text-sm mt-1">
                            {selectedConversation.messageCount} messages
                          </DrawerDescription>
                        )}
                      </div>
                    </div>
                    
                    {/* Action buttons - Full width on mobile */}
                    {selectedConversation && (
                      <div className="flex gap-2 w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleReplyClick(
                              selectedEmail || selectedConversation.emails[selectedConversation.emails.length - 1],
                              selectedConversation
                            );
                            setMobileDrawerOpen(false);
                          }}
                          className="flex-1 gap-2"
                        >
                          <Reply className="w-4 h-4" />
                          {currentView === 'sent' ? 'Send Again' : 'Reply'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            deleteConversation(selectedConversation);
                            setMobileDrawerOpen(false);
                          }}
                          className="gap-2 hover:bg-destructive/10 px-3"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </DrawerHeader>
                
                <ScrollArea className="flex-1">
                  <div className="p-4 w-full min-w-0 overflow-hidden">
                    {selectedConversation ? (
                      selectedEmail ? (
                        // Show only the selected email
                        <div className="w-full min-w-0 overflow-hidden">
                          <EmailContent 
                            key={selectedEmail.id}
                            conversation={{
                              ...selectedConversation,
                              emails: [selectedEmail]  // Only show the selected email
                            }}
                            onSaveAttachment={handleSaveAttachmentToDocuments}
                          />
                        </div>
                      ) : (
                        // Show all emails in the conversation thread
                        <div className="w-full min-w-0 overflow-hidden">
                          <EmailContent 
                            key={selectedConversation.id}
                            conversation={selectedConversation}
                            onSaveAttachment={handleSaveAttachmentToDocuments}
                          />
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium mb-2">No email selected</h3>
                          <p className="text-muted-foreground">Select an email from the list to view its content</p>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </div>
    );
};

export default Mailbox;