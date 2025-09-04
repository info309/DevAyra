import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { Bot, User, Send, Plus, MessageSquare, Mail, FileText, AlertCircle, PanelLeft, ArrowLeft, Pencil, Trash2, ImagePlus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
  tool_name?: string;
  tool_result?: any;
  attachments?: ImageAttachment[];
}

interface ImageAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// Local trigger detection for frontend (faster UX)
function detectTriggers(message: string) {
  const lower = message.toLowerCase();
  const triggers: string[] = [];
  
  // Email triggers - broader detection including compose/send requests
  if (["email","inbox","mail","message","reply","search emails","find email","michelle","carlo","send","send it","draft","compose","go ahead","yes","yeah","sure","do it"].some(k=>lower.includes(k))) {
    triggers.push("email");
  }
  
  // Document triggers  
  if (["document","doc","report","file","proposal","search docs","find document"].some(k=>lower.includes(k))) {
    triggers.push("document");
  }
  
  // Calendar triggers
  if (["meeting","schedule","appointment","calendar","event"].some(k=>lower.includes(k))) {
    triggers.push("calendar");
  }
  
  return triggers;
}

const Assistant = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (currentSession) {
      fetchMessages(currentSession.id);
    }
  }, [currentSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('assistant_sessions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
      
      // Auto-select first session or create new one
      if (data && data.length > 0) {
        setCurrentSession(data[0]);
      } else {
        createNewSession();
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load chat sessions",
        variant: "destructive"
      });
    }
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      console.log('Environment check:', {
        hostname: window.location.hostname,
        isProduction: window.location.hostname === 'ayra.app',
        isPreview: window.location.hostname.includes('sandbox.lovable.dev')
      });

      const { data, error } = await supabase
        .from('assistant_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      console.log('Raw messages fetched:', data?.length);
      console.log('All messages:', data);
      
      // Filter out tool messages and associate them with assistant messages
      const allMessages = data || [];
      const toolMessages = allMessages.filter(msg => msg.role === 'tool');
      const displayMessages = allMessages.filter(msg => msg.role !== 'tool');
      
      console.log('Tool messages found:', toolMessages.length);
      console.log('Tool messages details:', toolMessages.map(tm => ({
        id: tm.id,
        tool_name: tm.tool_name,
        created_at: tm.created_at,
        content_preview: tm.content?.substring(0, 100),
        hasContent: !!tm.content
      })));
      console.log('Display messages:', displayMessages.length);
      
      // Associate tool results with assistant messages
      const messagesWithTools = displayMessages.map(msg => {
        if (msg.role === 'assistant') {
          // Find the most recent tool message before this assistant message
          const toolMsg = toolMessages
            .filter(tool => tool.created_at <= msg.created_at)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          
          if (toolMsg) {
            console.log(`Associating tool ${toolMsg.tool_name} with assistant message:`, msg.content?.substring(0, 100));
            return {
              ...msg,
              tool_name: toolMsg.tool_name,
              tool_result: (() => {
                try {
                  const result = toolMsg.tool_result ? JSON.parse(typeof toolMsg.tool_result === 'string' ? toolMsg.tool_result : JSON.stringify(toolMsg.tool_result)) : null;
                  console.log('Parsed tool result for', toolMsg.tool_name, ':', result);
                  return result;
                } catch (e) {
                  console.error('Error parsing tool result:', e, toolMsg.tool_result);
                  return toolMsg.tool_result;
                }
              })(),
              role: msg.role as 'user' | 'assistant'
            };
          }
        }
        
        return {
          ...msg,
          role: msg.role as 'user' | 'assistant'
        };
      });
      
      setMessages(messagesWithTools);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const { data, error } = await supabase
        .from('assistant_sessions')
        .insert({ user_id: user!.id, title: 'New Chat' })
        .select()
        .single();

      if (error) throw error;
      
      setCurrentSession(data);
      setSessions(prev => [data, ...prev]);
      setMessages([]);
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Error",
        description: "Failed to create new chat",
        variant: "destructive"
      });
    }
  };

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    
    try {
      const { error } = await supabase
        .from('assistant_sessions')
        .update({ title: newTitle.trim() })
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, title: newTitle.trim() } : s
      ));
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, title: newTitle.trim() } : null);
      }
    } catch (error) {
      console.error('Error updating session title:', error);
      toast({
        title: "Error",
        description: "Failed to update chat title",
        variant: "destructive"
      });
    }
  };

  const startEditing = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const stopEditing = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveTitle = async () => {
    if (editingSessionId && editingTitle.trim()) {
      await updateSessionTitle(editingSessionId, editingTitle);
    }
    stopEditing();
  };

  const handleTitleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      stopEditing();
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('assistant_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // If we deleted the current session, clear it and create a new one
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
        // Optionally create a new session automatically
        createNewSession();
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const handleImageUpload = async (files: FileList) => {
    const imageFiles = Array.from(files).filter(file => 
      ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
    );

    if (imageFiles.length === 0) {
      toast({
        title: "Invalid file type",
        description: "Please select PNG, JPEG, WEBP, or GIF images only.",
        variant: "destructive"
      });
      return;
    }

    try {
      const uploadPromises = imageFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${user!.id}/chat-images/${fileName}`;

        const { data, error } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        return {
          id: crypto.randomUUID(),
          name: file.name,
          url: publicUrl,
          type: file.type
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setSelectedImages(prev => [...prev, ...uploadedImages]);
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive"
      });
    }
  };

  const removeImage = (imageId: string) => {
    setSelectedImages(prev => prev.filter(img => img.id !== imageId));
  };

  const sendMessage = async () => {
    if ((!inputMessage.trim() && selectedImages.length === 0) || !currentSession || isLoading) return;

    const message = inputMessage.trim();
    const attachments = [...selectedImages];
    setInputMessage('');
    setSelectedImages([]);
    setIsLoading(true);

    try {
      // Optimistic add
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
        attachments: attachments
      };
      setMessages(prev => [...prev, userMessage]);

      // Detect triggers locally (faster UX)
      const detectedTriggers = detectTriggers(message);

      // Get client timezone for calendar parsing
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Call Lovable edge function
      const { data, error } = await supabase.functions.invoke('assistant', {
        body: { 
          message, 
          sessionId: currentSession.id, 
          detectedTriggers,
          images: attachments.map(img => ({ url: img.url, type: img.type })),
          client_timezone: clientTimezone,
          current_time: new Date().toISOString()
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Assistant request failed');

      // Update messages
      await fetchMessages(currentSession.id);

      // Short session title for first message
      if (messages.length === 0) {
        const shortTitle = message.length > 30 ? message.substring(0, 30) + '...' : message;
        await supabase.from('assistant_sessions').update({ title: shortTitle }).eq('id', currentSession.id);
        setCurrentSession(prev => prev ? { ...prev, title: shortTitle } : null);
        setSessions(prev => prev.map(s => s.id === currentSession.id ? { ...s, title: shortTitle } : s));
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Extract error message from supabase function response
      let errorMessage = "Failed to send message";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error) {
        errorMessage = error.error;
      }
      
      toast({ 
        title: "Error", 
        description: errorMessage, 
        variant: "destructive" 
      });
      
      // Remove the user message we optimistically added
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const renderToolResult = (toolName: string, toolResult: any) => {
    if (!toolResult) return null;

    switch (toolName) {
      case 'emails_list':
      case 'emails_search':
        return null;

      case 'documents_list':
      case 'documents_search':
        return (
          <Card className="mt-2 bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Found {toolResult.documents?.length || 0} documents
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {toolResult.documents?.slice(0, 3).map((doc: any, idx: number) => (
                <div key={idx} className="border-l-2 border-primary/20 pl-3 mb-2 last:mb-0">
                  <div className="font-medium text-sm">{doc.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.category && <Badge variant="outline" className="mr-2">{doc.category}</Badge>}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {toolResult.documents?.length > 3 && (
                <div className="text-xs text-muted-foreground mt-2">
                  ...and {toolResult.documents.length - 3} more documents
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'emails_compose_draft':
        // Handle draft composition and show open draft button
        console.log('Processing emails_compose_draft tool result:', {
          toolResult,
          environment: window.location.hostname,
          hasToolResult: !!toolResult
        });
        
        if (toolResult) {
          console.log('Email compose draft tool result:', toolResult);
          // Handle both old format (direct) and new format (nested under draft)
          const draft = toolResult.draft || (toolResult.action === 'compose_draft' ? toolResult : null);
          console.log('Extracted draft:', draft);
          
          if (draft) {
            console.log('Draft found, creating button for:', {
              to: draft.to,
              subject: draft.subject,
              hasContent: !!draft.content
            });
            const openDraft = () => {
              navigate('/mailbox', { 
                state: { 
                  composeDraft: {
                    to: draft.to,
                    subject: draft.subject,
                    content: draft.content,
                    replyTo: draft.replyTo,
                    threadId: draft.threadId,
                    attachments: draft.attachedDocuments || []
                  }
                }
              });
            };

            return (
              <Card className="mt-2 bg-accent/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Draft Prepared</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p><span className="font-medium">To:</span> {draft.to}</p>
                    <p><span className="font-medium">Subject:</span> {draft.subject}</p>
                    {draft.attachedDocuments && draft.attachedDocuments.length > 0 && (
                      <p><span className="font-medium">Attachments:</span> {draft.attachedDocuments.length} file(s)</p>
                    )}
                    <Button onClick={openDraft} className="w-full">
                      <Mail className="w-4 h-4 mr-2" />
                      Open Draft
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          }
        }
        return null;

      case 'emails_send':
        return (
          <Card className="mt-2 bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                {toolResult.success ? 'Email sent successfully' : 'Email sending failed'}
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  // Sessions sidebar component for reuse
  const SessionsSidebar = ({ onSessionSelect }: { onSessionSelect?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4">
        <h3 className="font-semibold text-foreground">Chat History</h3>
        <Button onClick={createNewSession} size="sm" variant="outline" className="md:hidden">
          <MessageSquare className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {sessions.map((session) => (
             <div
               key={session.id}
               className={`p-3 rounded-lg cursor-pointer transition-all duration-200 group relative ${
                 currentSession?.id === session.id 
                   ? 'bg-primary/10 border border-primary/20 shadow-sm' 
                   : 'hover:bg-muted/50 border border-transparent'
               }`}
               onClick={() => {
                 if (editingSessionId !== session.id) {
                   setCurrentSession(session);
                   onSessionSelect?.();
                 }
               }}
             >
               <div className="flex items-start justify-between">
                 <div className="flex-1 min-w-0">
                   {editingSessionId === session.id ? (
                     <Input
                       value={editingTitle}
                       onChange={(e) => setEditingTitle(e.target.value)}
                       onKeyDown={handleTitleKeyPress}
                       onBlur={saveTitle}
                       className="text-sm font-medium h-auto p-0 border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                       autoFocus
                       onClick={(e) => e.stopPropagation()}
                     />
                   ) : (
                     <div className="font-medium text-sm line-clamp-2 text-foreground">
                       {session.title}
                     </div>
                   )}
                   <div className="text-xs text-muted-foreground mt-1">
                     {new Date(session.updated_at).toLocaleDateString()}
                   </div>
                 </div>
                  {editingSessionId !== session.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(session.id, session.title);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
               </div>
             </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chats yet</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="min-h-screen bg-background max-w-[1240px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-14 max-w-screen-2xl items-center px-4">
          <div className="flex items-center gap-4 md:gap-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/dashboard')}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-heading font-bold truncate">Ayra</h1>
          </div>
          
          <div className="ml-auto flex items-center gap-2">
            {!isMobile && (
              <Button onClick={createNewSession} size="sm" className="bg-send hover:bg-send/90 text-send-foreground">
                <MessageSquare className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            )}
            {isMobile && (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-80 [&>button]:hidden">
                  <SessionsSidebar onSessionSelect={() => setSidebarOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="hidden md:flex w-80 border-r bg-card/30">
            <SessionsSidebar />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground pt-6 pb-1 px-4">
                  <h3 className="text-xl font-semibold mb-6 text-foreground">Hi, i'm Ayra your personal AI assistant.</h3>
                  <div className="w-48 h-48 mx-auto mb-1.5 flex items-center justify-center">
                    <img 
                      src="/lovable-uploads/fc3ef300-a3f1-42f7-9cf2-4eed433cb33c.png" 
                      alt="Ayra Assistant" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-muted-foreground mb-6 max-w-lg mx-auto leading-relaxed">
                    Try asking me something like:
                  </p>
                  <div className="grid gap-3 max-w-md mx-auto">
                    {[
                      "What's on my schedule next week",
                      "Can you show me my email's from last Monday",
                      "Draft an email to John about our meeting next week"
                    ].map((example, idx) => (
                      <div 
                        key={idx}
                        className="bg-muted/50 rounded-lg p-3 text-sm cursor-pointer hover:bg-muted/70 transition-colors"
                        onClick={() => setInputMessage(example)}
                      >
                        "{example}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className="flex items-start">
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className={`rounded-lg px-4 py-3 max-w-none ${
                      message.role === 'user' 
                        ? 'bg-primary/5 border border-primary/10 ml-auto max-w-2xl' 
                        : 'bg-muted/30'
                    }`}>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <img 
                              key={attachment.id}
                              src={attachment.url} 
                              alt={attachment.name}
                              className="max-w-xs max-h-40 object-cover rounded border"
                            />
                          ))}
                        </div>
                      )}
                      {message.content && (
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                          {message.content}
                        </p>
                      )}
                    </div>
                    {message.tool_name && message.tool_result && 
                      renderToolResult(message.tool_name, message.tool_result)
                    }
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-start">
                  <div className="flex-1 min-w-0">
                    <div className="bg-muted/50 rounded-lg p-4 animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.1s]" />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="text-sm text-muted-foreground ml-2">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-card/50 p-4 px-2 md:px-4">
            <div className="container max-w-4xl mx-auto px-2 md:px-4">
              {/* Image previews */}
              {selectedImages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedImages.map((image) => (
                    <div key={image.id} className="relative">
                      <img 
                        src={image.url} 
                        alt={image.name}
                        className="w-20 h-20 object-cover rounded-lg border"
                      />
                      <button
                        onClick={() => removeImage(image.id)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-destructive/90"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                  className="hidden"
                />
                <Textarea
                  value={inputMessage}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask me anything..."
                  disabled={isLoading}
                  className="w-full min-h-[44px] max-h-[200px] resize-none bg-background pl-12 pr-12 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-none [&:focus]:outline-none [&:focus]:ring-0 [&:focus]:border-none [&:focus-visible]:outline-none [&:focus-visible]:ring-0 [&:focus-visible]:border-none text-base"
                  rows={1}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span className="sr-only">Add images</span>
                </Button>
                <Button 
                  onClick={sendMessage} 
                  disabled={!inputMessage.trim() || isLoading}
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 shrink-0 rounded-full bg-send hover:bg-send/90 text-send-foreground disabled:bg-muted disabled:text-muted-foreground"
                >
                  <Send className="w-4 h-4" />
                  <span className="sr-only">Send message</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assistant;