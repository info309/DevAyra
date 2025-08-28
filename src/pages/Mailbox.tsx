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
import { ArrowLeft, Mail, Plus, Send, Save, RefreshCw, ExternalLink, Search, MessageSquare, Users, ChevronDown, ChevronRight, Reply, Paperclip } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
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

  useEffect(() => {
    if (user) {
      fetchGmailConnections();
    }
  }, [user]);

  useEffect(() => {
    if (connections.length > 0) {
      fetchEmails();
    }
  }, [connections]);

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

  const fetchEmails = async (searchQuery?: string, loadMore = false) => {
    if (!user || connections.length === 0) return;
    
    setEmailLoading(true);
    try {
      const action = searchQuery ? 'search' : 'list';
      const requestBody = {
        action,
        userId: user.id,
        maxResults: 100, // Load more emails at once
        pageToken: loadMore ? nextPageToken : undefined,
        query: searchQuery
      };

      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: requestBody
      });

      if (error) throw error;

      const newEmails = data.messages || [];
      
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
    if (!nextPageToken || allEmailsLoaded) return;
    await fetchEmails(searchQuery || undefined, true);
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
      
    } catch (error: any) {
      console.error('Failed to fetch email content:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to fetch email content: ${error.message}`
      });
    }
  };

  const selectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    
    // Load content for all emails in conversation that don't have content yet
    const emailsWithoutContent = conversation.emails.filter(email => !email.content);
    
    for (const email of emailsWithoutContent) {
      await fetchEmailContent(email.id);
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

  const selectEmailFromThread = async (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchEmailContent(email.id);
    setSelectedConversation(prev => prev ? { ...prev, emails: prev.emails } : null);
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

      // Refresh emails
      fetchEmails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to ${isDraft ? 'save draft' : 'send email'}`
      });
    }
    setLoading(false);
  };

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
                Connect your Gmail account to manage emails directly within Ayra
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
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
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
                      type="email"
                      placeholder="recipient@example.com"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Email subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="body">Message</Label>
                    <Textarea
                      id="body"
                      placeholder="Write your message here..."
                      className="min-h-[200px]"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => sendEmail(true)} disabled={loading}>
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Search Controls */}
        <div className="mb-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search emails by address, content, or attachment..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchEmails(searchQuery)}
              />
            </div>
            <Button 
              onClick={() => searchEmails(searchQuery)} 
              disabled={searchLoading}
              variant="outline"
            >
              {searchLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
            {searchQuery && (
              <Button 
                onClick={() => {
                  setSearchQuery('');
                  fetchEmails();
                }}
                variant="ghost"
                size="sm"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-18rem)] min-w-0">
          {/* Inbox List */}
          <Card className="lg:col-span-1 w-full max-w-full overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Inbox</CardTitle>
              <CardDescription>
                {conversations.length} conversations, {emails.length} total emails
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 w-full max-w-full overflow-hidden">
              <ScrollArea className="h-[calc(100vh-22rem)] w-full max-w-full overflow-hidden">
                {emailLoading ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading emails...</p>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center">
                    <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No emails found</p>
                  </div>
                ) : (
                  <>
                    {conversations.map((conversation, index) => {
                      // Check if conversation has attachments
                      const hasAttachments = conversation.emails.some(email => 
                        email.attachments && email.attachments.length > 0
                      );
                      
                      return (
                        <div key={conversation.id} className="border-b border-border last:border-b-0 w-full max-w-full overflow-hidden">
                          <div
                            className={`p-3 cursor-pointer hover:bg-accent transition-colors w-full max-w-full overflow-hidden ${
                              selectedConversation?.id === conversation.id ? 'bg-accent' : ''
                            }`}
                            onClick={() => selectConversation(conversation)}
                          >
                            <div className="flex justify-between gap-3 w-full max-w-full overflow-hidden items-start">
                              {/* Left side content */}
                              <div className="min-w-0 space-y-1 overflow-hidden flex-1">
                                {/* Email address and unread badge */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="font-medium text-sm truncate flex-1 min-w-0">
                                    {conversation.participants.map(p => p.split('<')[0].trim()).join(', ')}
                                  </p>
                                  {conversation.unreadCount > 0 && (
                                    <Badge variant="default" className="text-xs px-2 py-0 flex-shrink-0">
                                      {conversation.unreadCount}
                                    </Badge>
                                  )}
                                </div>
                                
                                {/* Subject */}
                                <div className="w-full overflow-hidden">
                                  <p className="text-xs text-muted-foreground font-medium truncate">
                                    {conversation.subject}
                                  </p>
                                </div>
                                
                                {/* Snippet with proper ellipsis */}
                                <div className="w-full overflow-hidden">
                                  <p className="text-xs text-muted-foreground/80 truncate">
                                    {conversation.emails[0]?.snippet}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Right side content */}
                              <div className="flex flex-col items-end justify-between min-h-16 flex-shrink-0 w-24">
                                {/* Top right: Date */}
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(conversation.lastDate).toLocaleDateString()}
                                </p>
                                
                                {/* Middle right: Attachment icon */}
                                <div className="flex items-center gap-1">
                                  {hasAttachments && (
                                    <Paperclip className="w-3 h-3 text-muted-foreground" />
                                  )}
                                  {conversation.messageCount > 1 && (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        {conversation.messageCount}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Bottom right: Dropdown arrow */}
                                <div className="flex justify-end">
                                  {conversation.messageCount > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-0 h-4 w-4 hover:bg-accent-foreground/10"
                                      onClick={(e) => toggleConversationExpansion(conversation.id, e)}
                                    >
                                      {expandedConversations.has(conversation.id) ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                        {/* Expanded Thread Emails */}
                        {expandedConversations.has(conversation.id) && conversation.messageCount > 1 && (
                          <div className="bg-accent/30 border-l-2 border-primary/20 ml-4 w-full max-w-full overflow-hidden">
                            <div className="p-2 space-y-1 w-full max-w-full overflow-hidden">
                              {conversation.emails
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map((email, emailIndex) => (
                                <div
                                  key={email.id}
                                  className="p-3 hover:bg-accent/50 rounded-md cursor-pointer transition-colors group border border-border/30 w-full max-w-full overflow-hidden"
                                  onClick={(e) => selectEmailFromThread(email, e)}
                                >
                                   <div className="flex justify-between gap-3 w-full max-w-full overflow-hidden items-start">
                                     <div className="min-w-0 overflow-hidden flex-1">
                                       <div className="flex items-center gap-2 mb-1 min-w-0">
                                         <p className="text-xs font-medium truncate flex-1 min-w-0">
                                           {email.from.split('<')[0].trim() || email.from}
                                         </p>
                                         {email.unread && (
                                           <Badge variant="default" className="text-xs py-0 px-1 flex-shrink-0">
                                             New
                                           </Badge>
                                         )}
                                       </div>
                                       <p className="text-xs text-muted-foreground truncate">
                                         {email.snippet}
                                       </p>
                                       <p className="text-xs text-muted-foreground">
                                         {formatDate(email.date)}
                                       </p>
                                     </div>
                                     <Button
                                       variant="ghost"
                                       size="sm"
                                       className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         selectEmailFromThread(email, e);
                                       }}
                                     >
                                       <Reply className="w-3 h-3" />
                                     </Button>
                                   </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {index < conversations.length - 1 && <Separator />}
                        </div>
                      );
                    })}
                    
                    {/* Load More Button */}
                    {!allEmailsLoaded && nextPageToken && (
                      <div className="p-4 border-t">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={loadMoreEmails}
                          disabled={emailLoading}
                        >
                          {emailLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Plus className="w-4 h-4 mr-2" />
                          )}
                          Load More Emails
                        </Button>
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
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xl font-heading font-semibold">
                        {selectedConversation.subject}
                      </h2>
                      {selectedConversation.messageCount > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {selectedConversation.messageCount} messages
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{selectedConversation.participants.map(p => p.split('<')[0].trim()).join(', ')}</span>
                      </div>
                      {selectedConversation.unreadCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {selectedConversation.unreadCount} unread
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(100vh-18rem)]">
                    <EmailContent 
                      conversation={selectedConversation}
                    />
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