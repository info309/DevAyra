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
import { ArrowLeft, Mail, Plus, Send, Save, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import EmailContent from '@/components/EmailContent';

interface Email {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  content?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
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
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  
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

  const fetchEmails = async () => {
    if (!user || connections.length === 0) return;
    
    setEmailLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'list',
          userId: user.id,
          maxResults: 20
        }
      });

      if (error) throw error;
      setEmails(data.messages || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch emails"
      });
    }
    setEmailLoading(false);
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
      setSelectedEmail(data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch email content"
      });
    }
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
            <Button variant="outline" size="sm" onClick={fetchEmails} disabled={emailLoading}>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          {/* Email List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Inbox</CardTitle>
              <CardDescription>
                {emails.length} messages
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-16rem)]">
                {emailLoading ? (
                  <div className="p-4 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading emails...</p>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-4 text-center">
                    <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No emails found</p>
                  </div>
                ) : (
                  emails.map((email, index) => (
                    <div key={email.id}>
                      <div
                        className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                          selectedEmail?.id === email.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => fetchEmailContent(email.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {email.from.split('<')[0].trim() || email.from}
                            </p>
                            <p className={`text-sm truncate ${email.unread ? 'font-medium' : 'text-muted-foreground'}`}>
                              {email.subject}
                            </p>
                          </div>
                          {email.unread && (
                            <Badge variant="default" className="ml-2 text-xs">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {email.snippet}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(email.date)}
                        </p>
                      </div>
                      {index < emails.length - 1 && <Separator />}
                    </div>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Email Content */}
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              {selectedEmail ? (
                <div className="h-[calc(100vh-12rem)]">
                  <div className="p-6 border-b">
                    <h2 className="text-xl font-heading font-semibold mb-2">
                      {selectedEmail.subject}
                    </h2>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div>
                        <p><strong>From:</strong> {selectedEmail.from}</p>
                        <p><strong>Date:</strong> {formatDate(selectedEmail.date)}</p>
                      </div>
                      {selectedEmail.unread && (
                        <Badge variant="default">New</Badge>
                      )}
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(100vh-20rem)] p-6">
                    <EmailContent 
                      content={selectedEmail.content || ''}
                      attachments={selectedEmail.attachments || []}
                      messageId={selectedEmail.id}
                    />
                  </ScrollArea>
                </div>
              ) : (
                <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
                  <div className="text-center">
                    <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Select an email to view its content</p>
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