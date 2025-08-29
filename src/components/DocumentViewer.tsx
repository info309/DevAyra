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
    
    // Map common extensions to readable names
    const extensionMap: { [key: string]: string } = {
      'DOCX': 'WORD',
      'DOC': 'WORD', 
      'PAGES': 'PAGES',
      'PDF': 'PDF',
      'TXT': 'TEXT',
      'RTF': 'RTF',
      'ODT': 'ODT',
      'XLSX': 'EXCEL',
      'XLS': 'EXCEL',
      'NUMBERS': 'NUMBERS',
      'CSV': 'CSV',
      'PPTX': 'PPT',
      'PPT': 'PPT',
      'KEY': 'KEY',
      'ODP': 'ODP'
    };
    
    return extensionMap[extension] || extension;
  };

  const A4DocumentIcon = ({ extension, size = 80 }: { extension: string; size?: number }) => {
    const width = size * 0.6; // Portrait aspect ratio
    const height = size;
    
    return (
      <div className="flex flex-col items-center justify-center">
        <svg 
          width={width} 
          height={height} 
          viewBox={`0 0 ${width} ${height}`} 
          className="drop-shadow-lg"
        >
          <defs>
            <linearGradient id={`paperGrad-${document?.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>
          
          {/* Document body */}
          <rect
            x="2"
            y="2"
            width={width - 4}
            height={height - 4}
            fill={`url(#paperGrad-${document?.id})`}
            stroke="#e2e8f0"
            strokeWidth="1"
            rx="3"
          />
          
          {/* Document lines */}
          {Array.from({ length: Math.floor(height / 12) - 2 }).map((_, i) => (
            <line
              key={i}
              x1="8"
              y1={16 + i * 8}
              x2={width - 8}
              y2={16 + i * 8}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}
          
          {/* Document corner fold */}
          <path
            d={`M${width - 16} 2 L${width - 2} 16 L${width - 16} 16 Z`}
            fill="#f1f5f9"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          
          {/* Extension text */}
          <text
            x={width / 2}
            y={height / 2 + 4}
            textAnchor="middle"
            className="fill-slate-600 text-xs font-semibold"
            style={{ fontSize: extension.length > 4 ? '10px' : '12px' }}
          >
            {extension}
          </text>
        </svg>
      </div>
    );
  };

  const renderPreview = () => {
    if (!document || !previewUrl) {
      return (
        <div className="flex items-center justify-center h-full bg-background">
          <div className="text-center">
            <A4DocumentIcon extension={getFileExtension()} size={120} />
            <p className="text-muted-foreground mt-6">
              {loading ? 'Loading preview...' : 'Preview not available'}
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

    // Other document types - show beautiful document icon
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center max-w-sm p-6">
          <A4DocumentIcon extension={getFileExtension()} size={120} />
          <h3 className="text-lg font-medium mb-2 mt-6">{document.name}</h3>
          <p className="text-muted-foreground mb-4">
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
        {/* Clean header */}
        <DrawerHeader className="border-b px-4 py-3 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 mr-4 text-left">
              <DrawerTitle className="text-lg font-semibold truncate mb-1 text-left">
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
            
            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleFavorite(document)}
                className={`h-8 w-8 ${document.is_favorite ? "text-yellow-500" : "text-muted-foreground"}`}
              >
                <Star className={`w-4 h-4 ${document.is_favorite ? 'fill-current' : ''}`} />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleDownload} 
                className="h-8 w-8 text-muted-foreground"
              >
                <Download className="w-4 h-4" />
              </Button>
              
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
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
