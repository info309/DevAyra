import React, { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Download, Star, Calendar, Mail, FileText, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatFileSize } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface UserDocument {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  source_type: 'upload' | 'email_attachment';
  source_email_id: string | null;
  source_email_subject: string | null;
  category: string | null;
  tags: string[] | null;
  description: string | null;
  is_favorite: boolean;
  is_folder: boolean;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentViewerProps {
  document: UserDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (doc: UserDocument) => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  isOpen,
  onClose,
  onToggleFavorite
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (document && isOpen) {
      generatePreview();
    }
    
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [document, isOpen]);

  const generatePreview = async () => {
    if (!document || !document.file_path) return;

    try {
      setLoading(true);
      
      // Create signed URL for preview
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.file_path, 3600); // 1 hour expiry
      
      if (error) {
        console.error('Error creating signed URL:', error);
        toast({
          title: "Error",
          description: "Failed to load document preview",
          variant: "destructive",
        });
      } else if (data) {
        setPreviewUrl(data.signedUrl);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(document.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `Downloaded ${document.name}`,
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderPreview = () => {
    if (!document || !previewUrl) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {loading ? 'Loading preview...' : 'Preview not available'}
            </p>
          </div>
        </div>
      );
    }

    // Image preview
    if (document.mime_type?.startsWith('image/')) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden p-4">
          <img
            src={previewUrl}
            alt={document.name}
            className="max-w-full max-h-full object-contain rounded shadow-lg"
            style={{ 
              maxHeight: 'calc(95vh - 160px)',
              maxWidth: 'calc(100vw - 100px)'
            }}
            onError={() => {
              console.error('Failed to load image preview');
              setPreviewUrl(null);
            }}
          />
        </div>
      );
    }

    // PDF preview
    if (document.mime_type?.includes('pdf')) {
      return (
        <div className="flex-1 bg-gray-50 rounded-lg overflow-hidden">
          <iframe
            src={`${previewUrl}#toolbar=1&navpanes=0&scrollbar=0&view=Fit&zoom=page-fit`}
            className="w-full h-full border-0 rounded shadow-lg"
            style={{ 
              height: 'calc(95vh - 160px)',
              width: '100%'
            }}
            title={`Preview of ${document.name}`}
            onError={() => {
              console.error('Failed to load PDF preview');
              setPreviewUrl(null);
            }}
          />
        </div>
      );
    }

    // Text files preview
    if (document.mime_type?.startsWith('text/') || 
        document.mime_type?.includes('plain')) {
      return (
        <div className="flex-1 bg-white rounded-lg border overflow-hidden">
          <iframe
            src={previewUrl}
            className="w-full h-full border-0 rounded shadow-lg"
            style={{ 
              height: 'calc(95vh - 160px)',
              width: '100%'
            }}
            title={`Preview of ${document.name}`}
          />
        </div>
      );
    }

    // Other document types - show document info
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center max-w-sm">
          <FileText className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">{document.name}</h3>
          <p className="text-gray-500 mb-4">
            This file type cannot be previewed. Click download to open it with the appropriate application.
          </p>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" />
            Download to View
          </Button>
        </div>
      </div>
    );
  };

  if (!document) return null;

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[95vh] w-full max-w-none mx-auto">
        <DrawerHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-lg font-semibold truncate">
                {document.name}
              </DrawerTitle>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(document.created_at)}
                </div>
                {document.file_size && (
                  <span>{formatFileSize(document.file_size)}</span>
                )}
                <Badge variant="secondary">
                  {document.source_type === 'email_attachment' ? 'From Email' : 'Uploaded'}
                </Badge>
              </div>
              
              {document.source_email_subject && (
                <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  From: {document.source_email_subject}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleFavorite(document)}
                className={document.is_favorite ? "text-yellow-500" : "text-muted-foreground"}
              >
                <Star className={`w-4 h-4 ${document.is_favorite ? 'fill-current' : ''}`} />
              </Button>
              
              <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
              
              <DrawerClose asChild>
                <Button variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        
        <div className="flex-1 p-6 overflow-hidden bg-gray-50">
          <div className="h-full w-full flex items-center justify-center">
            {renderPreview()}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DocumentViewer;
