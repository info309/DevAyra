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
import { ArrowLeft, Mail, Plus, Send, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Trash2, Menu, LogOut, Link, Unlink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import EmailContent from '@/components/EmailContent';
import ComposeDialog from '@/components/ComposeDialog';
import { gmailApi, GmailApiError } from '@/utils/gmailApi';

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
  const [hasGmailConnection, setHasGmailConnection] = useState<boolean | null>(null);

  // Compose dialog state
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeFormData>({
    to: '',
    subject: '',
    content: ''
  });

  const [sendingEmail, setSendingEmail] = useState(false);
  const [currentView, setCurrentView] = useState<'inbox' | 'sent'>('inbox');
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

  // Handle draft from assistant
  useEffect(() => {
    if (location.state?.composeDraft) {
      const draft = location.state.composeDraft;
      setComposeForm({
        to: draft.to || '',
        subject: draft.subject || '',
        content: draft.content || '',
        threadId: (draft.threadId && typeof draft.threadId === 'string') ? draft.threadId : undefined,
      });
      
      setShowComposeDialog(true);
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
      loadEmailsForView('inbox');
      loadEmailsForView('sent');
    }
  }, [user, hasGmailConnection]);

  // Handle view switching with instant cache access
  useEffect(() => {
    if (user && viewCache[currentView]) {
      setConversations(viewCache[currentView]!);
      setEmailLoading(false);
    }
  }, [currentView, viewCache]);

  const loadEmailsForView = async (view = currentView, forceRefresh = false) => {
    if (!user) return;

    // If we already have cached data and this is not a force refresh, return early
    if (!forceRefresh && viewCache[view] && viewCache[view]!.length > 0) {
      if (view === currentView) {
        setConversations(viewCache[view]!);
        setEmailLoading(false);
      }
      return;
    }

    if (viewLoading[view]) return;

    try {
      setViewLoading(prev => ({ ...prev, [view]: true }));
      
      if (view === currentView) {
        setEmailLoading(true);
      }
      
      const query = view === 'inbox' ? 'in:inbox' : 'in:sent';
      
      console.log('Loading emails for view:', view, 'query:', query);
      
      const data = await gmailApi.getEmails(query, undefined, new AbortController().signal);

      console.log('Gmail API response for', view, ':', { 
        conversationCount: data.conversations?.length || 0
      });

      const newConversations = data.conversations || [];
      
      // Cache the conversations
      setViewCache(prev => ({ ...prev, [view]: newConversations }));
      
      if (view === currentView) {
        setConversations(newConversations);
      }

    } catch (error) {
      console.error(`Error loading ${view} emails:`, error);
      toast({
        title: "Error",
        description: `Failed to load ${view} emails. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setViewLoading(prev => ({ ...prev, [view]: false }));
      if (view === currentView) {
        setEmailLoading(false);
      }
    }
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

  const searchEmails = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Error",
        description: "Please enter a search query.",
        variant: "destructive",
      });
      return;
    }

    setSearchLoading(true);
    try {
      const data = await gmailApi.searchEmails(searchQuery);
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to search emails. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setConversations(viewCache[currentView] || []);
  };

  const handleComposeSubmit = async (formData: any) => {
    setSendingEmail(true);
    try {
      await gmailApi.sendEmail(
        formData.to,
        formData.subject,
        formData.content,
        formData.threadId,
        formData.attachments,
        formData.documentAttachments
      );

      toast({
        title: "Email Sent",
        description: "Your email has been sent successfully.",
      });

      setShowComposeDialog(false);
      setComposeForm({ to: '', subject: '', content: '' });
      
      // Refresh the current view to show the sent email
      loadEmailsForView(currentView, true);
    } catch (error) {
      console.error('Send email error:', error);
      toast({
        title: "Send Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleEmailClick = (conversation: Conversation) => {
    // Since each "conversation" now has only one email, just select it directly
    const email = conversation.emails[0];
    setSelectedEmail(email);
    setSelectedConversation(conversation);
    
    // Mark as read if unread
    if (email.unread) {
      gmailApi.markAsRead(email.id, email.threadId).catch(console.error);
    }
    
    if (isDrawerView) {
      setMobileDrawerOpen(true);
    }
  };

  const handleReply = (email: Email) => {
    const replySubject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
    setComposeForm({
      to: email.from,
      subject: replySubject,
      content: `\n\n--- Original Message ---\nFrom: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.content}`,
      threadId: email.threadId
    });
    setShowComposeDialog(true);
  };

  // Filter conversations based on search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations;
    }
    return conversations.filter(conv => 
      conv.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.participants.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conv.emails.some(e => e.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [conversations, searchQuery]);

  if (hasGmailConnection === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Checking Gmail connection...</p>
        </div>
      </div>
    );
  }

  if (hasGmailConnection === false) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Gmail Connection Required
            </CardTitle>
            <CardDescription>
              Connect your Gmail account to manage your emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              To use the email features, you need to connect your Gmail account first.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/account')}>
                <Link className="w-4 h-4 mr-2" />
                Connect Gmail
              </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-semibold">Mailbox</h1>
            </div>
            
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex rounded-md border">
                <Button
                  variant={currentView === 'inbox' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCurrentView('inbox')}
                  className="rounded-r-none"
                >
                  Inbox
                </Button>
                <Button
                  variant={currentView === 'sent' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCurrentView('sent')}
                  className="rounded-l-none"
                >
                  Sent
                </Button>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadEmailsForView(currentView, true)}
                disabled={viewLoading[currentView]}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${viewLoading[currentView] ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              
              <Button onClick={() => setShowComposeDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Compose
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-2 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                onKeyDown={(e) => e.key === 'Enter' && searchEmails()}
              />
            </div>
            <Button
              variant="outline"
              onClick={searchEmails}
              disabled={searchLoading}
            >
              {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            {searchQuery && (
              <Button variant="outline" onClick={clearSearch}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Email List and Content */}
        <div className="flex-1 flex">
          {/* Email List */}
          <div className="w-1/3 border-r bg-card">
            <ScrollArea className="h-full">
              {emailLoading ? (
                <div className="p-4 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading emails...</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-4 text-center">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'No emails match your search' : 'No emails found'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredConversations.map((conversation) => {
                    const email = conversation.emails[0]; // Get the single email
                    return (
                      <div
                        key={conversation.id}
                        className={`p-4 cursor-pointer hover:bg-muted/50 ${
                          selectedEmail?.id === email.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleEmailClick(conversation)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`text-sm truncate ${email.unread ? 'font-semibold' : 'font-medium'}`}>
                                {email.from}
                              </p>
                              {email.unread && (
                                <div className="w-2 h-2 bg-primary rounded-full" />
                              )}
                            </div>
                            <p className={`text-sm truncate mb-1 ${email.unread ? 'font-semibold' : ''}`}>
                              {email.subject}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {email.snippet}
                            </p>
                          </div>
                          <div className="ml-2 text-xs text-muted-foreground">
                            {formatDate(email.date)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Email Content */}
          <div className="flex-1 bg-background">
            {selectedEmail ? (
              <div className="h-full flex flex-col">
                <div className="border-b p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="text-lg font-semibold">{selectedEmail.subject}</h2>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReply(selectedEmail)}
                      >
                        <Reply className="w-4 h-4 mr-2" />
                        Reply
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p><strong>From:</strong> {selectedEmail.from}</p>
                    <p><strong>To:</strong> {selectedEmail.to}</p>
                    <p><strong>Date:</strong> {new Date(selectedEmail.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}</p>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <EmailContent 
                    email={selectedEmail}
                    onReply={() => handleReply(selectedEmail)}
                  />
                </ScrollArea>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Mail className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Select an email to read</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Dialog */}
      <ComposeDialog
        open={showComposeDialog}
        onOpenChange={setShowComposeDialog}
        initialData={composeForm}
        onSubmit={handleComposeSubmit}
        sending={sendingEmail}
      />
    </div>
  );
};

export default Mailbox;