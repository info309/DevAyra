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
    <div 
      className="border-b border-border last:border-b-0"
      style={{
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        contain: 'layout style',
        isolation: 'isolate'
      }}
    >
      <div
        className={`cursor-pointer hover:bg-accent transition-colors ${
          isSelected ? 'bg-accent' : ''
        }`}
        onClick={() => onSelect(conversation)}
        style={{
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          height: '76px',
          minHeight: '76px',
          maxHeight: '76px',
          padding: '12px',
          display: 'flex',
          contain: 'layout style size',
          isolation: 'isolate'
        }}
      >
        <div 
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            width: '100%',
            maxWidth: '100%',
            overflow: 'hidden',
            height: '52px',
            contain: 'layout style'
          }}
        >
          {/* Left side content */}
          <div 
            style={{
              minWidth: '0',
              flex: '1',
              height: '52px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              contain: 'layout style'
            }}
          >
            {/* Email address and unread badge */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '0',
                height: '16px',
                contain: 'layout style'
              }}
            >
              <p 
                className="font-medium text-sm truncate text-foreground"
                style={{
                  flex: '1',
                  minWidth: '0',
                  fontSize: '14px',
                  fontWeight: '500',
                  lineHeight: '16px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  contain: 'layout style'
                }}
              >
                {conversation.participants.map(p => p.split('<')[0].trim()).join(', ')}
              </p>
              {conversation.unreadCount > 0 && (
                <Badge variant="default" className="text-xs px-2 py-0 flex-shrink-0">
                  {conversation.unreadCount}
                </Badge>
              )}
            </div>
            
            {/* Subject */}
            <div 
              style={{
                width: '100%',
                overflow: 'hidden',
                height: '12px',
                contain: 'layout style'
              }}
            >
              <p 
                className="text-xs text-muted-foreground font-medium truncate"
                style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  lineHeight: '12px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  contain: 'layout style'
                }}
              >
                {conversation.subject}
              </p>
            </div>
            
            {/* Snippet */}
            <div 
              style={{
                width: '100%',
                overflow: 'hidden',
                height: '12px',
                contain: 'layout style'
              }}
            >
              <p 
                className="text-xs text-muted-foreground/80 truncate"
                style={{
                  fontSize: '12px',
                  fontWeight: '400',
                  lineHeight: '12px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  contain: 'layout style'
                }}
              >
                {conversation.emails[0]?.snippet}
              </p>
            </div>
          </div>
          
          {/* Right side content */}
          <div 
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              height: '52px',
              flexShrink: 0,
              width: '96px',
              contain: 'layout style'
            }}
          >
            {/* Date */}
            <p 
              className="text-xs text-muted-foreground"
              style={{
                fontSize: '12px',
                fontWeight: '400',
                lineHeight: '12px',
                whiteSpace: 'nowrap',
                contain: 'layout style'
              }}
            >
              {new Date(conversation.lastDate).toLocaleDateString()}
            </p>
            
            {/* Icons */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                contain: 'layout style'
              }}
            >
              {hasAttachments && (
                <Paperclip className="w-3 h-3 text-muted-foreground" />
              )}
              {conversation.messageCount > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MessageSquare className="w-3 h-3 text-muted-foreground" />
                  <span 
                    className="text-xs text-muted-foreground"
                    style={{
                      fontSize: '12px',
                      fontWeight: '400',
                      lineHeight: '12px',
                      contain: 'layout style'
                    }}
                  >
                    {conversation.messageCount}
                  </span>
                </div>
              )}
            </div>
            
            {/* Arrow */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {conversation.messageCount > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-4 w-4 hover:bg-accent-foreground/10"
                  onClick={(e) => onToggleExpansion(conversation.id, e)}
                  style={{
                    padding: '0',
                    height: '16px',
                    width: '16px',
                    minHeight: '16px',
                    minWidth: '16px',
                    contain: 'layout style'
                  }}
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