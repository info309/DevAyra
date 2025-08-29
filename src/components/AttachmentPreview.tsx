import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Save, X, File, Image, FileText, Archive, Music, Video } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { gmailApi } from '@/utils/gmailApi';
import { formatFileSize } from '@/lib/utils';

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
}

interface AttachmentPreviewProps {
  attachment: Attachment | null;
  messageId?: string;
  emailSubject?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  messageId,
  emailSubject,
  open,
  onOpenChange
}) => {
  const { toast } = useToast();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Save form state
  const [saveForm, setSaveForm] = useState({
    description: '',
    category: 'email_attachment',
    tags: [] as string[],
    tagInput: ''
  });

  useEffect(() => {
    if (!attachment || !messageId || !attachment.attachmentId || !open) {
      setFileContent(null);
      return;
    }

    const loadAttachment = async () => {
      setLoading(true);
      try {
        const data = await gmailApi.downloadAttachment(messageId, attachment.attachmentId!);
        
        // For images and text files, create preview
        if (attachment.mimeType.startsWith('image/')) {
          // Convert binary data to base64 for image display
          const base64 = btoa(data.data);
          setFileContent(`data:${attachment.mimeType};base64,${base64}`);
        } else if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/json') {
          // Display text content directly
          setFileContent(data.data);
        } else {
          // For other file types, just show file info
          setFileContent(null);
        }
      } catch (error) {
        console.error('Failed to load attachment:', error);
        toast({
          title: "Error",
          description: "Failed to load attachment preview",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadAttachment();
  }, [attachment, messageId, open]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-6 w-6" />;
    if (mimeType.startsWith('text/') || mimeType.includes('document')) return <FileText className="h-6 w-6" />;
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return <Archive className="h-6 w-6" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-6 w-6" />;
    if (mimeType.startsWith('video/')) return <Video className="h-6 w-6" />;
    return <File className="h-6 w-6" />;
  };

  const handleDownload = async () => {
    if (!attachment || !messageId || !attachment.attachmentId) return;

    try {
      const data = await gmailApi.downloadAttachment(messageId, attachment.attachmentId);
      
      // Create blob and download
      const blob = new Blob([data.data], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Downloaded",
        description: `${attachment.filename} has been downloaded`
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Error",
        description: "Failed to download attachment",
        variant: "destructive"
      });
    }
  };

  const handleSaveToDocuments = async () => {
    if (!attachment || !messageId || !attachment.attachmentId) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-attachment', {
        body: {
          messageId,
          attachmentId: attachment.attachmentId,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          emailSubject,
          description: saveForm.description,
          category: saveForm.category,
          tags: saveForm.tags
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Saved",
        description: `${attachment.filename} has been saved to your documents`
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Error", 
        description: "Failed to save attachment to documents",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = saveForm.tagInput.trim();
    if (tag && !saveForm.tags.includes(tag)) {
      setSaveForm(prev => ({
        ...prev,
        tags: [...prev.tags, tag],
        tagInput: ''
      }));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setSaveForm(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  if (!attachment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getFileIcon(attachment.mimeType)}
            {attachment.filename}
          </DialogTitle>
          <DialogDescription>
            {attachment.mimeType} • {formatFileSize(attachment.size)}
            {emailSubject && (
              <>
                <br />
                <span className="text-xs text-muted-foreground">From: {emailSubject}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Preview Content */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : fileContent ? (
            <div className="border rounded-lg p-4 bg-muted/50">
              {attachment.mimeType.startsWith('image/') ? (
                <img
                  src={fileContent}
                  alt={attachment.filename}
                  className="max-w-full max-h-96 mx-auto rounded"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm overflow-auto max-h-96 font-mono">
                  {fileContent}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 border rounded-lg border-dashed">
              <div className="text-center">
                {getFileIcon(attachment.mimeType)}
                <p className="mt-2 text-sm text-muted-foreground">
                  Preview not available for this file type
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Save to Documents Form */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Save to Documents</h4>
          
          <div className="space-y-3">
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description for this document..."
                value={saveForm.description}
                onChange={(e) => setSaveForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={saveForm.category}
                onChange={(e) => setSaveForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., email_attachment, invoice, contract"
              />
            </div>

            <div>
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  id="tags"
                  value={saveForm.tagInput}
                  onChange={(e) => setSaveForm(prev => ({ ...prev, tagInput: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add tags..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  Add
                </Button>
              </div>
              {saveForm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {saveForm.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 ml-1"
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDownload} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button 
            onClick={handleSaveToDocuments} 
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save to Documents'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttachmentPreview;