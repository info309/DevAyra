import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';

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
  id: string;
  subject: string;
  participants: string[];
  lastDate: string;
  unreadCount: number;
  messageCount: number;
  emails: Email[];
}

interface EmailRowProps {
  conversation: Conversation;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (conversation: Conversation) => void;
  onToggleExpansion: (conversationId: string, e: React.MouseEvent) => void;
}

const EmailRow = React.memo(({ 
  conversation, 
  isSelected, 
  isExpanded, 
  onSelect,
  onToggleExpansion 
}: EmailRowProps) => {
  // Check if conversation has attachments
  const hasAttachments = conversation.emails.some(email => 
    email.attachments && email.attachments.length > 0
  );

  return (
    <div className="border-b border-border last:border-b-0 w-full max-w-full overflow-hidden">
      <div
        className={`p-3 cursor-pointer hover:bg-accent transition-colors w-full max-w-full overflow-hidden h-[68px] flex-shrink-0 ${
          isSelected ? 'bg-accent' : ''
        }`}
        onClick={() => onSelect(conversation)}
      >
        <div className="flex justify-between items-start gap-3 w-full max-w-full overflow-hidden h-[44px]">
          {/* Left side content */}
          <div className="min-w-0 space-y-1 overflow-hidden flex-1 h-[44px]">
            {/* Email address and unread badge */}
            <div className="flex items-center gap-2 min-w-0 h-4">
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
            <div className="w-full overflow-hidden h-3">
              <p className="text-xs text-muted-foreground font-medium truncate">
                {conversation.subject}
              </p>
            </div>
            
            {/* Snippet with proper ellipsis */}
            <div className="w-full overflow-hidden h-3">
              <p className="text-xs text-muted-foreground/80 truncate">
                {conversation.emails[0]?.snippet}
              </p>
            </div>
          </div>
          
          {/* Right side content */}
          <div className="flex flex-col items-end justify-between h-[44px] flex-shrink-0 w-24">
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
                  onClick={(e) => onToggleExpansion(conversation.id, e)}
                >
                  {isExpanded ? (
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
    </div>
  );
});

EmailRow.displayName = 'EmailRow';

export default EmailRow;