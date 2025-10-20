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
import { Bot, User, Send, Plus, MessageSquare, Mail, FileText, AlertCircle, PanelLeft, ArrowLeft, Pencil, Trash2, ImagePlus, Calendar, Square, Clock } from 'lucide-react';
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
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
          // Only associate if tool message is within 5 seconds of the assistant message
          const toolMsg = toolMessages
            .filter(tool => {
              const toolTime = new Date(tool.created_at).getTime();
              const msgTime = new Date(msg.created_at).getTime();
              const timeDiff = msgTime - toolTime;
              return tool.created_at <= msg.created_at && timeDiff < 30000; // Within 30 seconds (increased for slower operations)
            })
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

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const sendMessage = async (slotTimeOverride?: string | null) => {
    if ((!inputMessage.trim() && selectedImages.length === 0) || !currentSession || isLoading) return;

    const message = inputMessage.trim();
    const attachments = [...selectedImages];
    
    // Defensive: Ensure slotTime is always a string or null, never an object
    let slotTime: string | null = null;
    if (slotTimeOverride !== undefined && typeof slotTimeOverride === 'string') {
      slotTime = slotTimeOverride;
    } else if (selectedSlotTime && typeof selectedSlotTime === 'string') {
      slotTime = selectedSlotTime;
    }
    
    setInputMessage('');
    setSelectedImages([]);
    setIsLoading(true);

    // Create new abort controller
    abortControllerRef.current = new AbortController();

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

      // Get user's JWT token for authentication
      const { data: session } = await supabase.auth.getSession();
      const authToken = session.session?.access_token;
      
      console.log('🔐 Auth Debug:', {
        hasSession: !!session.session,
        hasToken: !!authToken,
        tokenLength: authToken?.length,
        user: session.session?.user?.email
      });
      
      if (!authToken) {
        throw new Error('You must be signed in to use the assistant.');
      }

      // Call Lovable edge function with abort signal using fetch
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message, 
          sessionId: currentSession.id, 
          detectedTriggers,
          images: attachments.map(img => ({ url: img.url, type: img.type })),
          client_timezone: clientTimezone,
          current_time: new Date().toISOString(),
          selected_slot_time: slotTime
        }),
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Assistant request failed');
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Assistant request failed');

      // Clear selected slot time after sending
      setSelectedSlotTime(null);
      
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
      
      // Check if it was aborted
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        // Don't show error for intentional cancellation
        setMessages(prev => prev.slice(0, -1));
        return;
      }
      
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
      abortControllerRef.current = null;
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

      case 'calendar_check_availability':
        // Render clickable time slot buttons
        if (toolResult && toolResult.freeSlots && toolResult.freeSlots.length > 0) {
          return (
            <Card className="mt-2 bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Available Time Slots</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {toolResult.freeSlots.map((slot: any, idx: number) => {
                    const startTime = new Date(slot.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    const endTime = new Date(slot.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    const slotTimeString = String(slot.start); // Convert to string outside handler
                    
                    const handleSlotClick = () => {
                      if (isLoading) return;
                      
                      const start = new Date(slotTimeString);
                      const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      
                      setInputMessage(timeStr);
                      setSelectedSlotTime(slotTimeString);
                      
                      // Use a clean timeout with no closures
                      setTimeout(() => {
                        sendMessage(slotTimeString);
                      }, 100);
                    };
                    
                    return (
                      <Button
                        key={idx}
                        variant="outline"
                        className="justify-start text-sm"
                        disabled={isLoading}
                        onClick={handleSlotClick}
                      >
                        <Clock className="w-3 h-3 mr-2" />
                        {startTime} - {endTime}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        }
        return null;

      case 'emails_compose_draft':
        // Handle draft composition and show open draft button
        console.log('Processing emails_compose_draft tool result:', {
          toolResult,
          environment: window.location.hostname,
          hasToolResult: !!toolResult
        });
        
      // Check if this is an error result first
      if (toolResult && toolResult.error) {
        console.log('❌ Email compose draft error:', toolResult.error);
        
        // Don't show INVALID_TOOL or TOOL_ERROR to user - these are internal validation errors
        if (toolResult.error.includes('INVALID_TOOL') || toolResult.error.includes('TOOL_ERROR')) {
          console.log('🔄 Tool validation error detected - AI should retry with correct tool');
          return null; // Don't render anything, let the AI retry
        }
        
        return (
          <Card className="mt-2 bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-red-600">Error</span>
              </div>
              <p className="text-sm text-red-700">{toolResult.error}</p>
            </CardContent>
          </Card>
        );
      }
        
        if (toolResult && !toolResult.error) {
          console.log('Email compose draft tool result:', toolResult);
          
          // Check if this is actually a calendar event (auto-fixed by backend)
          if (toolResult.event && toolResult.success) {
            console.log('🔄 Backend auto-fixed: emails_compose_draft → calendar_create_event');
            console.log('Event data:', toolResult.event);
            
            // Render as a calendar event card instead of email draft
            const event = toolResult.event;
            
            const editInvitation = () => {
              // Clean up the description if it contains the email draft content
              const cleanDescription = event.description?.includes('Hi Sarah') 
                ? '' // Don't include the email draft content in the meeting invitation
                : event.description || '';
              
              navigate('/mailbox', {
                state: {
                  composeDraft: {
                    to: event.guests || '',
                    subject: `Meeting - ${new Date(event.startTime).toLocaleDateString()} at ${new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                    content: `Hi,\n\nI've scheduled a meeting for ${new Date(event.startTime).toLocaleDateString()} at ${new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.\n\n${cleanDescription ? cleanDescription + '\n\n' : ''}Looking forward to our discussion!\n\nBest regards`,
                    action: 'compose_draft'
                  }
                }
              });
            };

            return (
              <Card className="mt-2 bg-green-50 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">
                      Meeting Prepared
                    </span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p><span className="font-medium">Title:</span> {event.title}</p>
                    <p><span className="font-medium">Time:</span> {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleString()}</p>
                    {event.description && (
                      <p><span className="font-medium">Description:</span> {event.description}</p>
                    )}
                    {event.guests && (
                      <p><span className="font-medium">Guests:</span> {event.guests}</p>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs text-green-700">
                        📅 Meeting scheduled in your calendar
                        {event.guests && ` • ${event.guests} will be notified`}
                      </p>
                      <Button onClick={editInvitation} className="w-full">
                        <Mail className="w-4 h-4 mr-2" />
                        Send Invitation Message
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
          
          // Handle both old format (direct) and new format (nested under draft)
          const draft = toolResult.draft || (toolResult.action === 'compose_draft' ? toolResult : null);
          console.log('Extracted draft:', draft);
          
          if (draft) {
            console.log('Draft found, creating button for:', {
              to: draft.to,
              subject: draft.subject,
              hasContent: !!draft.content
            });
            
            // Safely combine and process attachments
            const processAttachments = () => {
              const attachments = (draft.attachments && Array.isArray(draft.attachments) ? draft.attachments : []);
              const attachedDocs = (draft.attachedDocuments && Array.isArray(draft.attachedDocuments) ? draft.attachedDocuments : []);
              
              return [...attachments, ...attachedDocs].map(doc => ({
                id: doc.id,
                name: doc.name,
                url: doc.publicUrl || doc.url,
                mime_type: doc.mime_type,
                file_size: doc.file_size,
                type: doc.mime_type // Adding type for compatibility
              }));
            };
            
            const openDraft = () => {
              navigate('/mailbox', { 
                state: { 
                  composeDraft: {
                    to: draft.to,
                    subject: draft.subject,
                    content: draft.content,
                    replyTo: draft.replyTo,
                    threadId: draft.threadId,
                    attachments: processAttachments(),
                    calendarInvite: draft.calendarInvite // Pass calendar invite to compose window
                  }
                }
              });
            };

            return (
              <Card className="mt-2 bg-accent/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{draft.calendarInvite ? 'Meeting Invitation Draft' : 'Draft Prepared'}</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p><span className="font-medium">To:</span> {draft.to}</p>
                    <p><span className="font-medium">Subject:</span> {draft.subject}</p>
                    {draft.calendarInvite && (
                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-blue-900 dark:text-blue-100">Calendar Invitation Attached</span>
                        </div>
                        <div className="text-xs space-y-1 text-blue-800 dark:text-blue-200">
                          <p>📅 {draft.calendarInvite.title}</p>
                          <p>🕐 {new Date(draft.calendarInvite.startTime).toLocaleString()}</p>
                          <p>📎 {draft.calendarInvite.filename}</p>
                        </div>
                      </div>
                    )}
                    {processAttachments().length > 0 && (
                      <p><span className="font-medium">Documents:</span> {processAttachments().length} file(s)</p>
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

      case 'calendar_create_event':
        // Handle calendar event creation and show schedule meeting button
        console.log('Processing calendar_create_event tool result:', toolResult);
        console.log('Tool result success:', toolResult?.success);
        console.log('Tool result event:', toolResult?.event);
        console.log('Tool result keys:', Object.keys(toolResult || {}));
        
        if (toolResult && toolResult.success && toolResult.event) {
          const event = toolResult.event;
          const showEditInvitation = toolResult.showEditInvitation;
          const meetingDetails = toolResult.meetingDetails;
          
          // Note: scheduleMeeting function removed since meeting is already created by auto-fix

          const editInvitation = () => {
            // Create email content with Google Meet link or location
            let emailContent = `Hi,\n\nI've scheduled a meeting for ${meetingDetails?.when || new Date(event.startTime).toLocaleString()}.`;
            
            if (event.meeting_link || event.meetingLink) {
              emailContent += `\n\nJoin the meeting using this Google Meet link:\n${event.meeting_link || event.meetingLink}`;
            }
            
            if (event.location) {
              emailContent += `\n\n📍 Location: ${event.location}`;
            }
            
            emailContent += `\n\n${event.description || 'Looking forward to our discussion!'}\n\nBest regards`;
            
            // Open email compose with meeting details
            navigate('/mailbox', {
              state: {
                composeDraft: {
                  to: meetingDetails?.recipient || event.guests || '',
                  subject: `${meetingDetails?.title || event.title} - ${meetingDetails?.when || 'Meeting'}`,
                  content: emailContent,
                  action: 'compose_draft'
                }
              }
            });
          };

          return (
            <Card className="mt-2 bg-green-50 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">
                    {showEditInvitation ? '✅ Meeting Scheduled!' : 'Meeting Prepared'}
                  </span>
                </div>
                <div className="space-y-3 text-sm">
                  <p><span className="font-medium">Title:</span> {event.title}</p>
                  <p><span className="font-medium">Time:</span> {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleString()}</p>
                  {event.description && (
                    <p><span className="font-medium">Description:</span> {event.description}</p>
                  )}
                  {event.location && (
                    <p><span className="font-medium">📍 Location:</span> {event.location}</p>
                  )}
                  {event.guests && (
                    <p><span className="font-medium">Guests:</span> {event.guests}</p>
                  )}
                  {(event.meeting_link || event.meetingLink) && (
                    <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 87.5 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z" fill="#00832d"/>
                          <path d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z" fill="#0066da"/>
                          <path d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z" fill="#e94235"/>
                          <path d="M20.5 20.5H0v31h20.5z" fill="#2684fc"/>
                          <path d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32zM49.5 36v15.5h-29V72h35.67c3.315 0 6-2.685 6-6V53.08z" fill="#00ac47"/>
                          <path d="M62.17 0H6c-3.315 0-6 2.685-6 6v14.5h20.5V0z" fill="#ffba00"/>
                          <path d="M20.5 20.5H49.5V36l-29 .03z" fill="#ff6d00"/>
                        </svg>
                        <p className="font-medium text-sm text-gray-800 dark:text-gray-100">Google Meet</p>
                      </div>
                      <a 
                        href={event.meeting_link || event.meetingLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium underline break-all inline-flex items-center gap-1"
                      >
                        Join Meeting
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs text-green-700">
                      📅 Meeting scheduled in your calendar
                      {event.guests && ` • ${event.guests} will be notified`}
                      {(event.meeting_link || event.meetingLink) && ` • Google Meet link created`}
                    </p>
                    <Button onClick={editInvitation} className="w-full">
                      <Mail className="w-4 h-4 mr-2" />
                      Send Invitation Message
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        } else {
          console.log('Calendar event creation failed or missing data:', toolResult);
          return (
            <Card className="mt-2 bg-red-50 border-red-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium">Meeting Creation Failed</span>
                </div>
                <div className="space-y-3 text-sm">
                  <p>There was an issue creating the meeting. Please try again.</p>
                  <p className="text-xs text-gray-500">Debug info: {JSON.stringify(toolResult)}</p>
                </div>
              </CardContent>
            </Card>
          );
        }

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
                  <h3 className="text-xl font-semibold mb-6 text-foreground">Hi, I'm Ayra—your personal AI assistant!</h3>
                  <div className="w-48 h-48 mx-auto mb-1.5 flex items-center justify-center">
                    <img 
                      src="/lovable-uploads/ayra-assistant-avatar.png" 
                      alt="Ayra Assistant" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-muted-foreground mb-6 max-w-lg mx-auto leading-relaxed">
                    I can help you manage your emails, check your calendar, schedule meetings, and more. Try asking me:
                  </p>
                  <div className="grid gap-3 max-w-md mx-auto">
                    {[
                      "What's on my schedule next week?",
                      "Can I schedule a meeting with Sarah tomorrow?",
                      "Show me my recent emails"
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
                  onClick={isLoading ? stopGeneration : () => sendMessage()} 
                  disabled={!isLoading && !inputMessage.trim()}
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 shrink-0 rounded-full bg-send hover:bg-send/90 text-send-foreground disabled:bg-muted disabled:text-muted-foreground"
                >
                  {isLoading ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="sr-only">{isLoading ? 'Stop generation' : 'Send message'}</span>
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