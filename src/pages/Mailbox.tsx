import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Mail, Plus, Send, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Trash2, Menu, LogOut, Link, Unlink, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import EmailContent from '@/components/EmailContent';
import ComposeDialog from '@/components/ComposeDialog';
import { gmailApi, GmailApiError } from '@/utils/gmailApi';
import { calculateTotalSize, estimateEncodedSize } from '@/utils/attachmentProcessor';

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
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId?: string;
  }>;
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
  attachments?: any[];
  documentAttachments?: any[];
  sendAsLinks?: boolean;
}

const Mailbox: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { toast } = useToast();
  const isDrawerView = useIsDrawerView();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
  const [hasGmailConnection, setHasGmailConnection] = useState<boolean | null>(null);

  // Compose dialog state
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeFormData>({
    to: '',
    subject: '',
    content: ''
  });

  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingProgress, setSendingProgress] = useState('');
  const [emailAbortController, setEmailAbortController] = useState<AbortController | null>(null);

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
  
  // Track locally trashed items to prevent them from reappearing during background refresh
  const [locallyTrashedIds, setLocallyTrashedIds] = useState<Set<string>>(new Set());
  
  
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

  // Handle draft from assistant
  useEffect(() => {
    if (location.state?.composeDraft) {
      const draft = location.state.composeDraft;
      setComposeForm({
        to: draft.to || '',
        subject: draft.subject || '',
        content: draft.content || '',
        // Only set threadId if it exists and is a valid string
        threadId: (draft.threadId && typeof draft.threadId === 'string') ? draft.threadId : undefined,
      });
      
      console.log('AI Draft loaded:', {
        to: draft.to,
        subject: draft.subject,
        content: draft.content,
        threadId: draft.threadId,
        isValidThreadId: !!(draft.threadId && typeof draft.threadId === 'string')
      });
      setShowComposeDialog(true);
      
      // Clear the state to prevent reopening
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    const checkGmailConnection = async () => {
      if (!user) return;
      
      try {
        const { data: connections, error } = await supabase
          .from('gmail_connections')
          .select('id, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1);
        
        if (error) {
          console.error('Error checking Gmail connection:', error);
          setHasGmailConnection(false);
          return;
        }
        
        setHasGmailConnection(connections && connections.length > 0);
      } catch (error) {
        console.error('Error checking Gmail connection:', error);
        setHasGmailConnection(false);
      }
    };

    checkGmailConnection();
  }, [user]);

  useEffect(() => {
    if (user && hasGmailConnection === true) {
      // Preload both inbox and sent views for instant switching with larger cache (100 emails)
      loadEmailsForView('inbox', null, true); // Force refresh on initial load  
      loadEmailsForView('sent', null, true);
      
      // Auto-refresh emails from last 24h when opening app
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      refreshRecentEmails(yesterday);
    }
  }, [user, hasGmailConnection]);

  // Debug: Log conversation data when it changes
  useEffect(() => {
    console.log('Current conversations updated:', currentConversations.length);
  }, [currentConversations]);

  // Add periodic refresh for the current view to catch new emails
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      // Silently check for new emails without disrupting the UI
      if (!viewLoading[currentView] && viewCache[currentView]) {
        try {
          console.log('Background refresh checking for new emails in:', currentView);
          const query = currentView === 'inbox' ? 'in:inbox' : 'in:sent';
          const data = await gmailApi.getEmails(query, undefined, new AbortController().signal);

          if (data?.conversations) {
            const existingEmails = viewCache[currentView] || [];
            const newConversations = data.conversations;
            
            // Filter out locally trashed conversations from new data
            const filteredNewConversations = newConversations.filter(conv => !locallyTrashedIds.has(conv.id));
            
            // Only update if we have new conversations (different count or different IDs)
            const existingIds = new Set(existingEmails.map(c => c.id));
            const hasNewEmails = filteredNewConversations.some(c => !existingIds.has(c.id)) || 
                              filteredNewConversations.length !== existingEmails.length;
            
            console.log('Background refresh result:', {
              existingCount: existingEmails.length,
              newCount: filteredNewConversations.length,
              hasNewEmails
            });
            
            if (hasNewEmails) {
              console.log('Updating conversations with new emails');
              // Merge new emails with existing ones, preserving order, but exclude locally trashed
              const mergedConversations = [...filteredNewConversations];
              
              setViewCache(prev => ({ ...prev, [currentView]: mergedConversations }));
              setCurrentConversations(mergedConversations);
            }
          }
        } catch (error) {
          // Silently fail for aborted requests and other background errors
          if (error.name !== 'AbortError') {
            console.debug('Background refresh failed:', error);
          }
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [user, currentView, viewLoading, viewCache]);

  // Handle view switching with instant cache access
  useEffect(() => {
    if (user && viewCache[currentView]) {
      // Immediately show cached data
      setCurrentConversations(viewCache[currentView]!);
      setEmailLoading(false);
    }
  }, [currentView, viewCache]);

  const refreshRecentEmails = async (since: Date) => {
    if (!user) return;
    
    try {
      const sinceFormatted = since.toISOString().split('T')[0]; // YYYY-MM-DD format
      const query = `in:inbox after:${sinceFormatted}`;
      
      console.log('Refreshing recent emails since:', sinceFormatted);
      
      const data = await gmailApi.getEmails(query, undefined, new AbortController().signal);
      
      if (data?.conversations) {
        // Cache the recent emails
        try {
          await supabase.functions.invoke('cache-emails', {
            body: { conversations: data.conversations }
          });
          console.log(`Cached ${data.conversations.length} recent emails`);
        } catch (cacheError) {
          console.warn('Failed to cache recent emails:', cacheError);
        }
      }
    } catch (error) {
      console.debug('Recent email refresh failed:', error);
    }
  };

  const loadMoreEmails = async () => {
    if (!currentPageToken || currentAllEmailsLoaded || viewLoading[currentView]) {
      return;
    }
    
    await loadEmailsForView(currentView, currentPageToken);
  };

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

  const loadEmailsForView = async (view = currentView, pageToken?: string | null, forceRefresh = false) => {
    if (!user) return;

    // If we already have cached data and this is not a pagination request or force refresh, return early
    if (!pageToken && !forceRefresh && viewCache[view] && viewCache[view]!.length > 0) {
      if (view === currentView) {
        setCurrentConversations(viewCache[view]!);
        setEmailLoading(false);
      }
      return;
    }

    if (viewLoading[view]) return;

    // Create AbortController for this request
    const abortController = new AbortController();

    try {
      setViewLoading(prev => ({ ...prev, [view]: true }));
      
      // Only show loading state for the current view
      if (view === currentView) {
        setEmailLoading(true);
      }

      // OPTIMIZATION: Load from cached_emails first for instant display
      if (!pageToken && !forceRefresh) {
        try {
          console.log('Loading cached emails from database for instant display...');
          const { data: cachedEmails, error: cacheError } = await supabase
            .from('cached_emails')
            .select('*')
            .eq('user_id', user.id)
            .eq('email_type', view)
            .order('date_sent', { ascending: false })
            .limit(50);

          if (!cacheError && cachedEmails?.length) {
            console.log(`Loaded ${cachedEmails.length} cached emails from database`);
            
            // Convert cached emails to conversation format
            const conversationMap = new Map<string, Conversation>();
            
            cachedEmails.forEach(email => {
              const threadId = email.gmail_thread_id;
              
              if (!conversationMap.has(threadId)) {
                conversationMap.set(threadId, {
                  id: threadId,
                  subject: email.subject,
                  emails: [],
                  messageCount: 0,
                  lastDate: email.date_sent,
                  unreadCount: 0,
                  participants: []
                });
              }
              
              const conv = conversationMap.get(threadId)!;
              const emailData = {
                id: email.gmail_message_id,
                threadId: threadId,
                snippet: email.snippet || '',
                subject: email.subject,
                from: email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email,
                to: email.recipient_name ? `${email.recipient_name} <${email.recipient_email}>` : (email.recipient_email || ''),
                date: email.date_sent,
                content: email.content || '',
                unread: email.is_unread || false,
                attachments: email.attachment_info ? JSON.parse(email.attachment_info as string) : []
              };
              
              conv.emails.push(emailData);
              conv.messageCount++;
              if (emailData.unread) conv.unreadCount++;
              
              // Update last date if this email is newer
              if (new Date(email.date_sent) > new Date(conv.lastDate)) {
                conv.lastDate = email.date_sent;
              }
              
              // Add to participants
              const participant = emailData.from;
              if (!conv.participants.includes(participant)) {
                conv.participants.push(participant);
              }
            });
            
            const cachedConversations = Array.from(conversationMap.values())
              .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
            
            // Set cached data immediately for instant display
            setViewCache(prev => ({ ...prev, [view]: cachedConversations }));
            if (view === currentView) {
              setCurrentConversations(cachedConversations);
              setEmailLoading(false); // Remove loading state since we have cached data
            }
            setConversations(cachedConversations);
            
            console.log(`Instantly loaded ${cachedConversations.length} conversations from cache`);
          }
        } catch (error) {
          console.warn('Failed to load cached emails, falling back to API:', error);
        }
      }
      
      const query = view === 'inbox' ? 'in:inbox' : 'in:sent';
      
      console.log('Loading emails for view:', view, 'query:', query, 'user:', user?.id);
      console.log('DEBUG - Current time:', new Date().toISOString());
      
      // Fetch from Gmail API in background (this may update the UI if there are new emails)
      const data = await gmailApi.getEmails(query, pageToken || undefined, abortController.signal);

      console.log('Gmail API response for', view, ':', { 
        conversationCount: data.conversations?.length || 0,
        nextPageToken: data.nextPageToken,
        allEmailsLoaded: data.allEmailsLoaded
      });
      
      // Debug log for Herminda & Dina emails specifically
      if (data.conversations) {
        const hermindaDinaEmails = data.conversations.filter(conv => 
          conv.emails?.some(email => 
            email.from?.toLowerCase().includes('herminda') || 
            email.from?.toLowerCase().includes('dina')
          )
        );
        
        if (hermindaDinaEmails.length > 0) {
          console.log('DEBUG - Found Herminda/Dina emails in response:', hermindaDinaEmails.map(conv => ({
            threadId: conv.id,
            subject: conv.subject,
            messageCount: conv.messageCount,
            lastDate: conv.lastDate,
            emailDates: conv.emails?.map(e => e.date) || []
          })));
        }

        // Check for missing recent cached emails that should be in inbox
        if (view === 'inbox' && !pageToken) {
          try {
            console.log('Checking for missing recent cached emails...');
            const { data: recentCachedEmails } = await supabase
              .from('cached_emails')
              .select('gmail_thread_id, date_sent, sender_email, subject')
              .eq('email_type', 'inbox')
              .gte('date_sent', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
              .order('date_sent', { ascending: false });

            if (recentCachedEmails?.length) {
              const apiThreadIds = new Set(data.conversations?.map(c => c.id) || []);
              const missingThreads = recentCachedEmails
                .filter(email => !apiThreadIds.has(email.gmail_thread_id))
                .reduce((acc, email) => {
                  if (!acc[email.gmail_thread_id]) {
                    acc[email.gmail_thread_id] = {
                      threadId: email.gmail_thread_id,
                      latestDate: email.date_sent,
                      sender: email.sender_email,
                      subject: email.subject
                    };
                  } else if (new Date(email.date_sent) > new Date(acc[email.gmail_thread_id].latestDate)) {
                    acc[email.gmail_thread_id].latestDate = email.date_sent;
                    acc[email.gmail_thread_id].sender = email.sender_email;
                  }
                  return acc;
                }, {} as Record<string, any>);

              const missingCount = Object.keys(missingThreads).length;
              if (missingCount > 0) {
                console.log(`FOUND ${missingCount} missing recent threads in Gmail API response:`, Object.values(missingThreads));
                
                // Fetch missing threads directly by ID
                const additionalConversations = [];
                for (const threadInfo of Object.values(missingThreads)) {
                  try {
                    console.log(`Fetching missing thread: ${threadInfo.threadId} from ${threadInfo.sender}`);
                    const threadData = await gmailApi.getEmails(`in:inbox thread:${threadInfo.threadId}`, undefined, abortController.signal);
                    if (threadData.conversations?.length) {
                      additionalConversations.push(...threadData.conversations);
                      console.log(`Successfully fetched missing thread: ${threadInfo.threadId}`);
                    }
                  } catch (error) {
                    console.warn(`Failed to fetch missing thread ${threadInfo.threadId}:`, error);
                  }
                }

                if (additionalConversations.length > 0) {
                  console.log(`Adding ${additionalConversations.length} missing conversations to results`);
                  data.conversations = [...(data.conversations || []), ...additionalConversations];
                  
                  // Re-sort by lastDate
                  data.conversations.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
                }
              }
            }
          } catch (error) {
            console.warn('Error checking for missing cached emails:', error);
          }
        }
      }

      // Show partial success warnings if any
      if (data.partialSuccess && data.errors?.length && view === currentView) {
        console.warn('Some emails had processing errors:', data.errors);
        toast({
          title: "Partial Load",
          description: `Loaded emails with ${data.errors.length} item(s) skipped due to processing errors.`,
          variant: "default"
        });
      }

      // Update cache and UI with fresh Gmail API data
      const { conversations: newConversations, nextPageToken, allEmailsLoaded } = data;
      
      if (pageToken) {
        // Append to existing conversations for pagination
        const updatedConversations = [...(viewCache[view] || []), ...newConversations];
        setViewCache(prev => ({ ...prev, [view]: updatedConversations }));
        if (view === currentView) {
          setCurrentConversations(updatedConversations);
        }
      } else {
        // Replace conversations for initial load or refresh, but only if we have new data
        if (newConversations?.length) {
          setViewCache(prev => ({ ...prev, [view]: newConversations }));
          if (view === currentView) {
            setCurrentConversations(newConversations);
          }
          setConversations(newConversations);
          
          console.log(`Updated UI with ${newConversations.length} fresh conversations from Gmail API`);
          
          // Cache emails for assistant search
          try {
            await supabase.functions.invoke('cache-emails', {
              body: { conversations: newConversations }
            });
          } catch (cacheError) {
            console.warn('Failed to cache emails for assistant:', cacheError);
          }
        }
      }
      
      if (view === currentView) {
        setCurrentPageToken(nextPageToken);
        setCurrentAllEmailsLoaded(allEmailsLoaded);
      }
      
    } catch (error) {
      // Ignore aborted requests
      if (error.name === 'AbortError') {
        console.debug('Request aborted for view:', view);
        return;
      }

      console.error('Error loading emails:', error);
      if (view === currentView) {
        if (error instanceof GmailApiError) {
          // Handle authentication errors
          if (error.status === 401 || error.message.includes('Authentication failed') || error.message.includes('Invalid authentication token')) {
            toast({
              variant: "destructive",
              title: "Authentication Error",
              description: "Your session has expired. Please refresh the page or log in again.",
            });
            return;
          }
          
          // Check if this is a token expiration error that requires reconnection
          if (error.message && error.message.includes('expired and needs to be reconnected')) {
            toast({
              title: "Gmail Connection Expired",
              description: error.message,
              variant: "destructive",
              action: (
                <div className="flex gap-2">
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-3 py-1 bg-white text-black rounded text-sm"
                  >
                    Refresh Page
                  </button>
                </div>
              )
            });
          } else {
            toast({
              title: "Error",
              description: `Failed to load emails: ${error.message || 'Please try again. If this is your first connection, it may take a moment to sync your emails.'}`,
              variant: "destructive"
            });
          }
        } else {
          toast({
            title: "Error",
            description: "Failed to load emails. Please try again.",
            variant: "destructive"
          });
        }
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
    // Load fresh data with force refresh
    loadEmailsForView(currentView, null, true);
  };


  const handleSearch = async () => {
    if (!user || !searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      
      const data = await gmailApi.searchEmails(searchQuery);

      // Show partial success warnings if any
      if (data.partialSuccess && data.errors?.length) {
        console.warn('Some search results had processing errors:', data.errors);
        toast({
          title: "Partial Search Results",
          description: `Search completed with ${data.errors.length} item(s) skipped due to processing errors.`,
          variant: "default"
        });
      }

      setCurrentConversations(data.conversations || []);
      
    } catch (error) {
      console.error('Error searching emails:', error);
      if (error instanceof GmailApiError) {
        toast({
          title: "Error",
          description: `Failed to search emails: ${error.message || 'Please try again.'}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error", 
          description: "Failed to search emails. Please try again.",
          variant: "destructive"
        });
      }
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

      // Update local state in both current conversations and cache
      const updateConversation = (conv: Conversation) => 
        conv.id === conversation.id 
          ? { ...conv, unreadCount: 0, emails: conv.emails.map(email => ({ ...email, unread: false })) }
          : conv;

      setCurrentConversations(prev => prev.map(updateConversation));
      
      // Also update the cache to prevent the change from being lost on refresh
      setViewCache(prev => ({
        ...prev,
        [currentView]: prev[currentView]?.map(updateConversation) || []
      }));
      
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

      // Update local state in both current conversations and cache
      const updateEmail = (conv: Conversation) => 
        conv.id === conversationId 
          ? { 
              ...conv, 
              unreadCount: Math.max(0, conv.unreadCount - 1),
              emails: conv.emails.map(email => 
                email.id === emailId ? { ...email, unread: false } : email
              )
            }
          : conv;

      setCurrentConversations(prev => prev.map(updateEmail));
      
      // Also update the cache to prevent the change from being lost on refresh
      setViewCache(prev => ({
        ...prev,
        [currentView]: prev[currentView]?.map(updateEmail) || []
      }));
      
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  };

  const deleteConversation = async (conversation: Conversation) => {
    if (!user) return;

    // Add to locally trashed set to prevent reappearing during background refresh
    setLocallyTrashedIds(prev => new Set([...prev, conversation.id]));

    // Optimistic update - remove from UI immediately
    setCurrentConversations(prev => prev.filter(conv => conv.id !== conversation.id));
    setViewCache(prev => ({ 
      ...prev, 
      [currentView]: prev[currentView]?.filter(conv => conv.id !== conversation.id) || []
    }));
    
    // Clear selection if deleted conversation was selected
    if (selectedConversation?.id === conversation.id) {
      setSelectedConversation(null);
      setSelectedEmail(null);
    }

    // Success - no toast message needed

    // Make Gmail API call in the background - move to trash instead of delete
    gmailApi.trashThread(conversation.id).then((response) => {
      console.log('Trash thread response:', response);
      // Don't restore on error - email stays removed from UI for better UX
      if (response.error || !response.results?.[0]?.success) {
        console.warn('Background trash operation failed (email remains hidden):', response.error || 'Trash operation failed');
      }
    }).catch(error => {
      console.warn('Background trash error (email remains hidden):', error);
    });
  };

  const deleteEmail = async (emailId: string, conversationId: string) => {
    if (!user) return;

    // Store the original email and conversation for potential restoration
    const originalConversation = currentConversations.find(conv => conv.id === conversationId);
    const originalEmail = originalConversation?.emails.find(email => email.id === emailId);
    
    if (!originalConversation || !originalEmail) return;

    // Add to locally trashed set if this results in removing the entire conversation
    if (originalConversation.emails.length === 1) {
      setLocallyTrashedIds(prev => new Set([...prev, conversationId]));
    }

    // Optimistic update - remove email from UI immediately
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
    setViewCache(prev => ({ 
      ...prev, 
      [currentView]: prev[currentView]?.map(conv => 
        conv.id === conversationId 
          ? { 
              ...conv,
              emails: conv.emails.filter(email => email.id !== emailId),
              messageCount: conv.messageCount - 1
            }
          : conv
      ).filter(conv => conv.emails.length > 0) || []
    }));

    // Clear selection if deleted email was selected
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(null);
    }

    // Success - no toast message needed

    // Make Gmail API call in the background - move to trash instead of delete
    gmailApi.trashMessage(emailId).then((response) => {
      console.log('Trash message response:', response);
      // Don't restore on error - email stays removed from UI for better UX
      if (response.error || !response.results?.[0]?.success) {
        console.warn('Background trash operation failed (email remains hidden):', response.error || 'Trash operation failed');
      }
    }).catch(error => {
      console.warn('Background trash error (email remains hidden):', error);
    });
  };

  const sendEmail = async () => {
    if (!user) return;

    try {
      console.log('=== SEND EMAIL DEBUG START ===');
      setSendingEmail(true);
      console.log('Sending email with compose form:', {
        to: composeForm.to,
        subject: composeForm.subject,
        threadId: composeForm.threadId,
        content: composeForm.content?.substring(0, 100)
      });

      setSendingProgress('Sending email...');
      
      // Create AbortController for this send operation
      const abortController = new AbortController();
      setEmailAbortController(abortController);

      console.log('Sending email with compose form:', {
        to: composeForm.to,
        subject: composeForm.subject,
        threadId: composeForm.threadId,
        content: composeForm.content?.substring(0, 100)
      });

      setSendingProgress('Validating attachments...');
      
      // Frontend validation for attachment sizes
      const totalSize = calculateTotalSize(
        composeForm.attachments || [], 
        composeForm.documentAttachments || []
      );
      const estimatedEncodedSize = estimateEncodedSize(totalSize);
      
      if (estimatedEncodedSize > 25 * 1024 * 1024 && !composeForm.sendAsLinks) {
        throw new Error(`Message size (${Math.round(estimatedEncodedSize / (1024 * 1024))}MB) exceeds Gmail's 25MB limit. Enable "Send as links" option for large files.`);
      }

      setSendingProgress('Preparing email...');
      
      let result;
      try {
        setSendingProgress('Connecting to Gmail...');
        result = await gmailApi.sendEmail(
          composeForm.to,
          composeForm.subject,
          composeForm.content,
          composeForm.threadId,
          composeForm.attachments, // Regular file attachments
          composeForm.documentAttachments, // Document storage attachments
          composeForm.sendAsLinks // Send as links flag
        );
      } catch (error) {
        console.error('Email send error:', error);
        
        // Check if this was a user cancellation
        if (abortController.signal.aborted) {
          toast({
            title: "Cancelled",
            description: "Email sending was cancelled.",
            variant: "default"
          });
        } else {
          toast({
            title: "Error", 
            description: `Failed to send email: ${error.message}`,
            variant: "destructive"
          });
        }
        
        setSendingEmail(false);
        setSendingProgress('');
        setEmailAbortController(null);
        return;
      }

      console.log('Gmail API response:', result);

      if (result.error) {
        console.error('Error calling gmail-api:', result.error);
        toast({
          title: "Error",
          description: `Failed to send email: ${result.error.message}`,
          variant: "destructive"
        });
        setSendingEmail(false);
        setSendingProgress('');
        setEmailAbortController(null);
        return;
      }

      if (!result.success) {
        console.error('Email sending failed:', result);
        toast({
          title: "Error", 
          description: result.error || "Failed to send email. Please try again.",
          variant: "destructive"
        });
        setSendingEmail(false);
        setSendingProgress('');
        setEmailAbortController(null);
        return;
      }

      console.log('Email sent successfully:', result);
      
      toast({
        title: "Email Sent",
        description: "Email sent successfully!",
        variant: "default"
      });

      // Reset form and close dialog
      console.log('Resetting form and closing dialog...');
      setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
      setShowComposeDialog(false);

      // Refresh if it wasn't a reply
      if (!composeForm.threadId) {
        console.log('Refreshing current view...');
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
      setSendingProgress('');
    }
  };

  const cancelEmailSend = () => {
    if (emailAbortController) {
      console.log('User requested to cancel email send');
      emailAbortController.abort();
      setEmailAbortController(null);
      setSendingEmail(false);
      setSendingProgress('');
      toast({
        title: "Cancelled",
        description: "Email sending was cancelled.",
        variant: "default"
      });
    }
  };

  // REMOVED: All draft-related functions and state have been removed

  const handleReplyClick = (email: Email, conversation: Conversation) => {
    if (currentView === 'sent') {
      // Handle "Send Again" for sent emails - use gentler cleaning
      setComposeForm({
        to: email.to,
        subject: email.subject,
        content: cleanEmailContentForResend(email.content || '')
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
        threadId: conversation.id
      });
    }
    
    setShowComposeDialog(true);
  };

  // REMOVED: editDraft function - no longer supporting drafts

  // REMOVED: Attachment saving functionality

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

  // Sort conversations by most recent email date (like Gmail)
  const sortedConversations = useMemo(() => {
    return [...currentConversations].sort((a, b) => {
      const dateA = new Date(a.lastDate).getTime();
      const dateB = new Date(b.lastDate).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [currentConversations]);

  const filteredConversations = sortedConversations.filter(conversation => {
    if (showOnlyUnread && conversation.unreadCount === 0) return false;
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (
      conversation.subject.toLowerCase().includes(searchLower) ||
      conversation.emails.some(email => 
        email.from.toLowerCase().includes(searchLower) ||
        email.snippet.toLowerCase().includes(searchLower)
      )
    );
    
    // Debug logging for Herminda & Dina emails
    if (conversation.emails.some(email => 
      email.from.toLowerCase().includes('herminda') || 
      email.from.toLowerCase().includes('dina')
    )) {
      console.log('DEBUG: Found Herminda/Dina conversation:', {
        threadId: conversation.id,
        subject: conversation.subject,
        messageCount: conversation.messageCount,
        lastDate: conversation.lastDate,
        emails: conversation.emails.map(e => ({
          id: e.id,
          from: e.from,
          date: e.date,
          snippet: e.snippet.substring(0, 100)
        }))
      });
    }
    
    return matchesSearch;
  });



  return (
    <div className="h-screen bg-background overflow-hidden">
      <div className="container mx-auto px-4 p-2 lg:px-8 h-full flex flex-col">
        {/* Show welcome message if no Gmail connection */}
        {hasGmailConnection === false ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">Welcome to Mail</h2>
              <p className="text-muted-foreground leading-relaxed">
                To get your mailbox connected, visit the account page and connect your Gmail account.
              </p>
            </div>
            <Button 
              onClick={() => navigate('/account')}
              className="w-full max-w-xs"
            >
              Go to Account Page
            </Button>
          </div>
        ) : hasGmailConnection === null ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 mx-auto animate-spin">
                <RefreshCw className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground">Checking connection...</p>
            </div>
          </div>
        ) : (
          <>
        {/* Desktop Header - Logo and Back Arrow */}
        <div className="hidden lg:flex items-center justify-start py-4 mb-6">
          <div className="flex items-center gap-4">
            {/* Back Arrow */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Dashboard
            </Button>
            
            {/* Logo */}
            <h1 className="text-3xl font-bold">Mail</h1>
          </div>
        </div>

        {/* Header with controls */}
        <div className="flex flex-col gap-4 mb-2">
          {/* Top row - Mobile/tablet logo + menu on left, compose/refresh on right; Desktop view toggle on left, actions on right */}
          <div className="flex justify-between items-center lg:justify-between">
            {/* Mobile/Tablet Back Arrow and Logo - Left side */}
            <div className="flex lg:hidden items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="ml-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl font-bold">Mail</h1>
            </div>

            {/* View Toggle - Desktop */}
            <div className="hidden lg:flex items-center gap-4">
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
            <div className="flex gap-2 justify-end ml-auto">
              
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
                  <Button variant="compose" className="gap-2" onClick={() => {
                     // Reset form to empty state for new email
                     setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
                  }} size="sm">
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Compose</span>
                  </Button>
                </DrawerTrigger>
                  <ComposeDialog
                    open={showComposeDialog}
                    onOpenChange={setShowComposeDialog}
                    composeForm={composeForm}
                    onComposeFormChange={setComposeForm}
                    onSend={async () => {
                      await sendEmail();
                    }}
                     onCancel={() => {
                       setShowComposeDialog(false);
                       setComposeForm({ to: '', subject: '', content: '', attachments: [], documentAttachments: [] });
                     }}
                    onCancelSend={cancelEmailSend}
                    sendingEmail={sendingEmail}
                    sendingProgress={sendingProgress}
                  />
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

          {/* View Toggle and AI Button - Mobile only */}
          <div className="md:hidden flex items-center justify-between gap-4">
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

        <div className={`grid gap-6 ${isDrawerView ? 'grid-cols-1' : 'grid-cols-5'} flex-1 overflow-hidden`}>
          {/* Email List - 40% width (2 of 5 columns) */}
          <Card className="col-span-2 min-w-0 h-full overflow-hidden">
            <CardContent className="p-0 overflow-hidden rounded-lg h-full">
              <ScrollArea className="h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)] lg:h-[calc(100vh-10rem)] w-full rounded-lg overflow-hidden">
                {emailLoading && filteredConversations.length === 0 ? (
                  <div className="p-6 text-center">
                    <img 
                      src="/lovable-uploads/41e96c75-18f1-45a5-93fe-bda1bd4b1fca.png"
                      alt="Loading"
                      className="w-8 h-8 mx-auto animate-spin text-muted-foreground mb-2"
                    />
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
                          // Get most recent email for display (like Gmail)
                          const sortedEmails = [...conversation.emails].sort((a, b) => 
                            new Date(b.date).getTime() - new Date(a.date).getTime()
                          );
                          const mostRecentEmail = sortedEmails[0];
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
                                         {currentView === 'sent' 
                                           ? (mostRecentEmail.to.split('<')[0].trim() || mostRecentEmail.to)
                                           : (mostRecentEmail.from.split('<')[0].trim() || mostRecentEmail.from)
                                         }
                                       </p>
                                     </div>
                                     <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                       <p className="font-medium text-sm truncate flex-1 min-w-0 max-w-[220px] overflow-hidden">
                                         {conversation.subject}
                                       </p>
                                     </div>
                                     <p className="text-xs text-muted-foreground truncate max-w-[260px] overflow-hidden">
                                       {mostRecentEmail.snippet}
                                     </p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px] overflow-hidden">
                                      {formatDate(conversation.lastDate)}
                                    </p>
                                  </div>
                                   
                                   <div className="flex flex-col justify-between h-full min-h-[80px] flex-shrink-0 items-end w-8">
                                     {/* Top right - Bin icon */}
                                     <div className="flex justify-end">
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
                                     
                                     {/* Middle right - Attachments and Unread */}
                                     <div className="flex justify-center items-center gap-2">
                                       {/* Show paperclip if any email in conversation has attachments */}
                                       {conversation.emails.some(email => email.attachments && email.attachments.length > 0) && (
                                         <div title="Has attachments">
                                           <Paperclip className="w-3 h-3 text-muted-foreground" />
                                         </div>
                                       )}
                                       {conversation.unreadCount > 0 && (
                                         <div className="w-2 h-2 bg-primary rounded-full"></div>
                                       )}
                                     </div>
                                    
                                     {/* Bottom right - Action buttons */}
                                     <div className="flex gap-1 items-center">{conversation.messageCount > 1 && (
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
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded conversation view */}
                              {expandedConversations.has(conversation.id) && conversation.messageCount > 1 && (
                                <div className="bg-accent/30 border-l-2 border-primary/20 ml-4 w-full max-w-full overflow-hidden">
                                  <div className="p-2 space-y-1 w-full max-w-full overflow-hidden">
                                     {conversation.emails
                                       .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Chronological order like Gmail
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
                                                {/* Show paperclip if email has attachments */}
                                                {email.attachments && email.attachments.length > 0 && (
                                                  <div title="Has attachments">
                                                    <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                                  </div>
                                                )}
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
                        
                        {/* Bottom padding to ensure content is fully scrollable */}
                        <div className="h-4"></div>
                      </div>
                    </>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Email/Thread Content - Desktop Only - 60% width (3 of 5 columns) */}
            {!isDrawerView && (
              <Card className="col-span-3 min-w-0 overflow-hidden">
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
                      
                      <div className="h-[calc(100vh-10rem)] overflow-hidden">
                        <div className="px-6 py-4 h-full overflow-y-auto">
                          {selectedEmail ? (
                            // Show only the selected email
                            <EmailContent 
                              key={selectedEmail.id}
                              conversation={{
                                ...selectedConversation,
                                emails: [selectedEmail]  // Only show the selected email
                              }}
                            />
                          ) : (
                            // Show all emails in the conversation thread
                            <EmailContent 
                              key={selectedConversation.id}
                              conversation={selectedConversation}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
                      <div className="text-center">
                        <img 
                          src="/lovable-uploads/2e215e4f-39df-4c8b-a34f-3259ad6b901e.png" 
                          alt="Welcome to mail" 
                          className="w-48 h-48 mx-auto mb-3 object-contain"
                        />
                        <h3 className="text-xl font-medium mb-2">Welcome to mail</h3>
                        <p className="text-muted-foreground">Choose an email from the list to show it here!</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Mobile Drawer for Email Content */}
            <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
              <DrawerContent className="h-[95vh] max-w-full">
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
                          />
                        </div>
                      ) : (
                        // Show all emails in the conversation thread
                        <div className="w-full min-w-0 overflow-hidden">
                          <EmailContent 
                            key={selectedConversation.id}
                            conversation={selectedConversation}
                          />
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <img 
                            src="/lovable-uploads/2e215e4f-39df-4c8b-a34f-3259ad6b901e.png" 
                            alt="Welcome to mail" 
                            className="w-48 h-48 mx-auto mb-3 object-contain"
                          />
                          <h3 className="text-xl font-medium mb-2">Welcome to mail</h3>
                          <p className="text-muted-foreground">Choose an email from the list to show it here!</p>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </DrawerContent>
            </Drawer>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Mailbox;