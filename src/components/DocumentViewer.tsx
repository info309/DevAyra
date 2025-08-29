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
      
      // Create signed URL for preview with inline download option
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.file_path, 3600, {
          download: false // This ensures the file is displayed inline, not downloaded
        });
      
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
      toast({
        title: "Error", 
        description: "An unexpected error occurred while loading the preview",
        variant: "destructive",
      });
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

  const getFileExtension = () => {
    const extension = document?.name.split('.').pop()?.toUpperCase();
    if (!extension) return 'FILE';
    
    const extensionMap: { [key: string]: string } = {
      'DOCX': 'DOC', 'DOC': 'DOC', 'PAGES': 'DOC',
      'PDF': 'PDF',
      'TXT': 'TXT', 'RTF': 'TXT',
      'XLSX': 'XLS', 'XLS': 'XLS', 'CSV': 'XLS',
      'PPTX': 'PPT', 'PPT': 'PPT',
      'JPG': 'IMG', 'JPEG': 'IMG', 'PNG': 'IMG', 'GIF': 'IMG', 'WEBP': 'IMG'
    };
    
    return extensionMap[extension] || extension.substring(0, 3);
  };

  const SimpleA4Icon = ({ extension }: { extension: string }) => {
    // Determine document color based on type
    let bgColor = '#4285f4'; // Default blue
    if (extension === 'PDF') bgColor = '#dc2626'; // Red
    else if (extension === 'XLS') bgColor = '#16a34a'; // Green  
    else if (extension === 'PPT') bgColor = '#ea580c'; // Orange
    else if (extension === 'IMG') bgColor = '#7c3aed'; // Purple
    else if (extension === 'TXT') bgColor = '#6b7280'; // Gray

    return (
      <div className="flex flex-col items-center justify-center">
        <div 
          className="relative bg-white border-2 border-gray-200 shadow-lg w-40 h-50 sm:w-48 sm:h-60 lg:w-64 lg:h-80"
          style={{ 
            borderRadius: '4px' 
          }}
        >
          {/* Header stripe with document color */}
          <div 
            className="w-full h-12 flex items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            <span className="text-white font-bold text-sm">{extension}</span>
          </div>
          
          {/* Document content lines */}
          <div className="p-4 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div 
                key={i}
                className="bg-gray-100 rounded"
                style={{ 
                  height: '3px',
                  width: i === 0 ? '80%' : i === 11 ? '60%' : '100%'
                }}
              />
            ))}
          </div>
          
          {/* Corner fold */}
          <div 
            className="absolute top-0 right-0 border-l-[16px] border-b-[16px] border-l-gray-100 border-b-transparent"
          />
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    // Always show the A4 icon for non-image documents when no preview available
    if (!document || !previewUrl) {
      if (document?.mime_type?.startsWith('image/')) {
        return (
          <div className="flex items-center justify-center h-full bg-background">
            <div className="text-center">
              <SimpleA4Icon extension="IMG" />
              <p className="text-muted-foreground mt-4">
                {loading ? 'Loading image...' : 'Image preview not available'}
              </p>
            </div>
          </div>
        );
      }
      
      return (
        <div className="flex items-center justify-center h-full bg-background">
          <div className="text-center">
            <SimpleA4Icon extension={getFileExtension()} />
            <p className="text-muted-foreground mt-4">
              {loading ? 'Loading preview...' : 'Document preview'}
            </p>
          </div>
        </div>
      );
    }

    // Image preview
    if (document.mime_type?.startsWith('image/')) {
      return (
        <div className="w-full h-full bg-background overflow-auto flex items-center justify-center p-4">
          <img
            src={previewUrl}
            alt={document.name}
            className="max-w-full max-h-full object-contain"
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
        <div className="w-full h-full bg-background">
          <iframe
            src={`${previewUrl}#view=FitH&pagemode=none&toolbar=1`}
            className="w-full h-full border-0"
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
        <div className="w-full h-full bg-background">
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={`Preview of ${document.name}`}
          />
        </div>
      );
    }

    // Other document types - show simple A4 icon with download option
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center max-w-sm p-6">
          <SimpleA4Icon extension={getFileExtension()} />
          <h3 className="text-lg font-medium mb-2 mt-6">{document.name}</h3>
          <p className="text-muted-foreground mb-4">
            Click download to open this document
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
        {/* Clean header */}
        <DrawerHeader className="border-b px-4 py-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 max-w-full text-left">
              <DrawerTitle className="text-lg font-semibold truncate mb-1 text-left max-w-full">
                {document.name}
              </DrawerTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(document.created_at)}</span>
                {document.file_size && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(document.file_size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </DrawerHeader>
        
        {/* Preview content */}
        <div className="flex-1 p-0 overflow-hidden bg-muted/20">
          <div className="w-full h-full">
            {renderPreview()}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DocumentViewer;
