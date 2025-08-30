import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Bot, User, Send, Plus, MessageSquare, Mail, FileText, AlertCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
  tool_name?: string;
  tool_result?: any;
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const { data, error } = await supabase
        .from('assistant_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Filter out tool messages and associate them with assistant messages
      const allMessages = data || [];
      const toolMessages = allMessages.filter(msg => msg.role === 'tool');
      const displayMessages = allMessages.filter(msg => msg.role !== 'tool');
      
      // Associate tool results with assistant messages
      const messagesWithTools = displayMessages.map(msg => {
        if (msg.role === 'assistant') {
          // Find the most recent tool message before this assistant message
          const toolMsg = toolMessages
            .filter(tool => tool.created_at <= msg.created_at)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          
          if (toolMsg) {
            return {
              ...msg,
              tool_name: toolMsg.tool_name,
              tool_result: toolMsg.tool_result ? JSON.parse(typeof toolMsg.tool_result === 'string' ? toolMsg.tool_result : JSON.stringify(toolMsg.tool_result)) : null,
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

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentSession || isLoading) return;

    const message = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    try {
      // Optimistic add
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Detect triggers locally (faster UX)
      const detectedTriggers = detectTriggers(message);

      // Call Lovable edge function
      const { data, error } = await supabase.functions.invoke('assistant', {
        body: { message, sessionId: currentSession.id, detectedTriggers }
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
        if (toolResult) {
          // toolResult is the direct result from the function, not nested
          const draft = toolResult.action === 'compose_draft' ? toolResult : null;
          if (draft) {
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              ← Back to Dashboard
            </Button>
            <h1 className="text-2xl font-heading font-bold">AI Assistant</h1>
          </div>
          <Button onClick={createNewSession} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex h-[calc(100vh-80px)]">
        {/* Sessions Sidebar */}
        <div className="w-64 border-r bg-card/50 p-4">
          <h3 className="font-semibold mb-4">Chat History</h3>
          <ScrollArea className="h-full">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`p-3 rounded-lg cursor-pointer mb-2 transition-colors ${
                  currentSession?.id === session.id 
                    ? 'bg-primary/10 border border-primary/20' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setCurrentSession(session)}
              >
                <div className="font-medium text-sm line-clamp-2">{session.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(session.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="font-semibold mb-2">Hi! I'm Ayra, your AI assistant</h3>
                  <p className="text-sm max-w-lg mx-auto">
                    I can help you with your emails and documents. Try asking me something like:
                  </p>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="bg-muted/30 rounded-lg p-2 max-w-md mx-auto">
                      "Did I get an email from Michelle?"
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 max-w-md mx-auto">
                      "Show me my recent documents"
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 max-w-md mx-auto">
                      "Help me find emails about the project"
                    </div>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {message.tool_name && message.tool_result && 
                      renderToolResult(message.tool_name, message.tool_result)
                    }
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-muted/50 rounded-lg p-3 animate-pulse">
                      <div className="text-sm text-muted-foreground">Thinking...</div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your emails or documents..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button 
                onClick={sendMessage} 
                disabled={!inputMessage.trim() || isLoading}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assistant;