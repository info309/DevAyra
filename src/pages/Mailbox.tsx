import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Reply, Plus, Search, Paperclip, Upload, FileText, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import EmailContent from '@/components/EmailContent';
import DocumentPicker from '@/components/DocumentPicker';
import { useEmailPreloader } from '@/hooks/useEmailPreloader';

interface EmailConversation {
  id: string;
  subject: string;
  emails: any[];
  messageCount: number;
  lastDate: string;
  unreadCount: number;
  participants: string[];
}

interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  size: number;
}

const Mailbox = () => {
  const [selectedTab, setSelectedTab] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState<EmailConversation | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeData, setComposeData] = useState({
    to: '',
    subject: '',
    content: '',
    attachments: [] as EmailAttachment[]
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the email preloader hook
  const { 
    preloadedEmails, 
    isPreloading, 
    preloadComplete, 
    getEmailsForFolder, 
    refreshFolder 
  } = useEmailPreloader();

  // Get emails for current tab from preloaded data
  const getCurrentEmails = () => {
    if (!preloadComplete) return [];
    
    switch (selectedTab) {
      case 'inbox':
        return getEmailsForFolder('inbox');
      case 'sent':
        return getEmailsForFolder('sent');
      case 'drafts':
        return getEmailsForFolder('drafts');
      default:
        return [];
    }
  };

  const currentEmails = getCurrentEmails();

  // Search functionality - only search within preloaded emails for instant results
  const filteredEmails = currentEmails.filter(conversation => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      conversation.subject?.toLowerCase().includes(query) ||
      conversation.participants?.some(p => p.toLowerCase().includes(query)) ||
      conversation.emails?.some(email => 
        email.content?.toLowerCase().includes(query) ||
        email.from?.toLowerCase().includes(query) ||
        email.to?.toLowerCase().includes(query)
      )
    );
  });

  const handleSendEmail = async () => {
    if (!composeData.to || !composeData.subject || !composeData.content) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'sendEmail',
          to: composeData.to,
          subject: composeData.subject,
          content: composeData.content,
          attachments: composeData.attachments
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      toast({
        title: "Email Sent",
        description: "Your email has been sent successfully."
      });

      setShowCompose(false);
      setComposeData({ to: '', subject: '', content: '', attachments: [] });
      
      // Refresh sent folder to show the new email
      await refreshFolder('sent');
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({
        title: "Failed to Send Email",
        description: error.message || "An error occurred while sending the email.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleReply = async (email: any) => {
    const replySubject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
    setComposeData({
      to: email.from,
      subject: replySubject,
      content: `\n\n--- Original Message ---\nFrom: ${email.from}\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.content}`,
      attachments: []
    });
    setShowCompose(true);
  };

  const handleDeleteEmail = async (conversation: EmailConversation) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'deleteThread',
          threadId: conversation.id
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete email');
      }

      toast({
        title: "Email Deleted",
        description: "The email has been moved to trash."
      });

      // Refresh current folder
      await refreshFolder(selectedTab as 'inbox' | 'sent' | 'drafts');
      
      if (selectedEmail?.id === conversation.id) {
        setSelectedEmail(null);
      }
    } catch (error: any) {
      console.error('Error deleting email:', error);
      toast({
        title: "Failed to Delete Email",
        description: error.message || "An error occurred while deleting the email.",
        variant: "destructive"
      });
    }
  };

  const handleMarkAsRead = async (conversation: EmailConversation) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

      const response = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'markAsRead',
          threadId: conversation.id
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark as read');
      }

      // Refresh current folder to update read status
      await refreshFolder(selectedTab as 'inbox' | 'sent' | 'drafts');
    } catch (error: any) {
      console.error('Error marking as read:', error);
      toast({
        title: "Failed to Mark as Read",
        description: error.message || "An error occurred while marking the email as read.",
        variant: "destructive"
      });
    }
  };

  const handleTabChange = async (tab: string) => {
    setSelectedTab(tab);
    setSelectedEmail(null);
    
    // If preload is complete, switching is instant
    // Otherwise, refresh the specific folder
    if (!preloadComplete) {
      await refreshFolder(tab as 'inbox' | 'sent' | 'drafts');
    }
  };

  const handleRefresh = async () => {
    await refreshFolder(selectedTab as 'inbox' | 'sent' | 'drafts');
    toast({
      title: "Refreshed",
      description: `${selectedTab} updated successfully.`
    });
  };

  const handleDocumentSelect = (documents: any[]) => {
    const newAttachments = documents.map(doc => ({
      filename: doc.name,
      content: doc.content,
      contentType: doc.content_type || 'application/octet-stream',
      size: doc.size || 0
    }));
    
    setComposeData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...newAttachments]
    }));
    
    setShowDocumentPicker(false);
  };

  const removeAttachment = (index: number) => {
    setComposeData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Mailbox</h1>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <Search className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showCompose} onOpenChange={setShowCompose}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Compose
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Compose Email</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="to">To</Label>
                  <Input
                    id="to"
                    type="email"
                    value={composeData.to}
                    onChange={(e) => setComposeData(prev => ({ ...prev, to: e.target.value }))}
                    placeholder="recipient@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={composeData.subject}
                    onChange={(e) => setComposeData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Email subject"
                  />
                </div>
                <div>
                  <Label htmlFor="content">Message</Label>
                  <Textarea
                    id="content"
                    value={composeData.content}
                    onChange={(e) => setComposeData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write your message here..."
                    rows={10}
                  />
                </div>
                
                {/* Attachments Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Attachments</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDocumentPicker(true)}
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Add from Documents
                    </Button>
                  </div>
                  
                  {composeData.attachments.length > 0 && (
                    <div className="space-y-2">
                      {composeData.attachments.map((attachment, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex items-center">
                            <FileText className="h-4 w-4 mr-2" />
                            <span className="text-sm">{attachment.filename}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({(attachment.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAttachment(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCompose(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSendEmail} disabled={isSending}>
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Email'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Show preloading indicator */}
      {isPreloading && !preloadComplete && (
        <Alert className="mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            Loading emails for faster switching between folders...
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="p-4">
            <div className="mb-4">
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Tabs value={selectedTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="inbox">
                  Inbox
                  {preloadComplete && getEmailsForFolder('inbox').length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {getEmailsForFolder('inbox').length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="sent">
                  Sent
                  {preloadComplete && getEmailsForFolder('sent').length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {getEmailsForFolder('sent').length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="drafts">
                  Drafts
                  {preloadComplete && getEmailsForFolder('drafts').length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {getEmailsForFolder('drafts').length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTab} className="mt-4">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {!preloadComplete ? (
                    // Show skeletons while preloading
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="p-3 border rounded-lg">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/2 mb-1" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    ))
                  ) : filteredEmails.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No emails match your search.' : `No ${selectedTab} emails found.`}
                    </div>
                  ) : (
                    filteredEmails.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                          selectedEmail?.id === conversation.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => setSelectedEmail(conversation)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-medium text-sm truncate flex-1">
                            {conversation.subject || 'No Subject'}
                          </h3>
                          {conversation.unreadCount > 0 && (
                            <Badge variant="destructive" className="text-xs ml-2">
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mb-1">
                          {conversation.participants?.slice(0, 2).join(', ')}
                          {conversation.participants?.length > 2 && ` +${conversation.participants.length - 2} more`}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {conversation.lastDate && formatDistanceToNow(new Date(conversation.lastDate), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedEmail ? (
            <Card className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">{selectedEmail.subject}</h2>
                  <div className="text-sm text-muted-foreground">
                    <p>Participants: {selectedEmail.participants?.join(', ')}</p>
                    <p>{selectedEmail.messageCount} message{selectedEmail.messageCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedEmail.unreadCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkAsRead(selectedEmail)}
                    >
                      Mark as Read
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReply(selectedEmail.emails[selectedEmail.emails.length - 1])}
                  >
                    <Reply className="h-4 w-4 mr-2" />
                    Reply
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteEmail(selectedEmail)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {selectedEmail.emails?.map((email, index) => (
                  <div key={email.id} className="border-l-2 border-muted pl-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-sm">{email.from}</p>
                        <p className="text-xs text-muted-foreground">
                          To: {email.to} • {email.date && formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                        </p>
                      </div>
                      {email.unread && (
                        <Badge variant="destructive" className="text-xs">
                          Unread
                        </Badge>
                      )}
                    </div>
                    
                    <EmailContent conversation={selectedEmail} />
                    
                    {email.attachments && email.attachments.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm font-medium mb-2">Attachments:</p>
                        <div className="space-y-1">
                          {email.attachments.map((attachment: any, attachIndex: number) => (
                            <div key={attachIndex} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                              <div className="flex items-center">
                                <FileText className="h-4 w-4 mr-2" />
                                <span>{attachment.filename}</span>
                                <span className="text-muted-foreground ml-2">
                                  ({(attachment.size / 1024).toFixed(1)} KB)
                                </span>
                              </div>
                              {attachment.downloadUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(attachment.downloadUrl, '_blank')}
                                >
                                  Download
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="text-center text-muted-foreground">
                <p>Select an email to view its content</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showDocumentPicker} onOpenChange={setShowDocumentPicker}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Documents to Attach</DialogTitle>
          </DialogHeader>
          <DocumentPicker
            onDocumentsSelected={handleDocumentSelect}
            multiple={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Mailbox;
