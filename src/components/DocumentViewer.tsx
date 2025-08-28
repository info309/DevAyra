import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, FileText, Image, X, Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  downloadUrl?: string;
}

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: Attachment | null;
  messageId: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  isOpen, 
  onClose, 
  attachment, 
  messageId 
}) => {
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [documentContent, setDocumentContent] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && attachment && attachment.attachmentId) {
      fetchAttachmentData();
    }
    return () => {
      // Cleanup blob URLs
      if (attachmentData && attachmentData.startsWith('blob:')) {
        URL.revokeObjectURL(attachmentData);
      }
      setAttachmentData(null);
      setError(null);
      setPageNumber(1);
      setScale(1.0);
      setDocumentContent('');
    };
  }, [isOpen, attachment, messageId]);

  const fetchAttachmentData = async () => {
    if (!attachment?.attachmentId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching attachment:', attachment.filename, 'ID:', attachment.attachmentId);
      
      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: {
          action: 'get-attachment',
          messageId,
          attachmentId: attachment.attachmentId,
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message || 'Failed to fetch attachment');
      }

      if (data?.storageUrl) {
        // Use the storage URL directly
        console.log('Using storage URL for preview');
        setAttachmentData(data.storageUrl);
      } else if (data?.attachmentData) {
        // Fallback to base64 data
        console.log('Using base64 data for preview');
        const byteCharacters = atob(data.attachmentData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: attachment.mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setAttachmentData(blobUrl);
      } else {
        throw new Error('No attachment data received');
      }

      // For Word documents, try to extract text content if we have blob data
      if (attachment.mimeType.includes('officedocument.wordprocessingml') || 
          attachment.mimeType.includes('application/msword')) {
        if (data?.attachmentData) {
          const byteCharacters = atob(data.attachmentData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          await extractWordContent(new Uint8Array(byteNumbers));
        }
      }
      
    } catch (error: any) {
      console.error('Error fetching attachment:', error);
      setError(error.message || 'Failed to load attachment for preview');
      toast({
        variant: "destructive",
        title: "Preview Error",
        description: error.message || "Failed to load attachment for preview",
      });
    } finally {
      setLoading(false);
    }
  };

  const extractWordContent = async (byteArray: Uint8Array) => {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: byteArray.buffer });
      setDocumentContent(result.value);
    } catch (error) {
      console.error('Failed to extract Word content:', error);
      // Not a critical error, document can still be downloaded
    }
  };

  const handleDownload = () => {
    if (attachmentData && attachment) {
      const link = document.createElement('a');
      link.href = attachmentData;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Downloading ${attachment.filename}`,
      });
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2 text-muted-foreground">Loading preview...</span>
        </div>
      );
    }

    if (error || !attachmentData || !attachment) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">{error || 'Preview not available'}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {attachment?.filename} • {formatFileSize(attachment?.size || 0)}
          </p>
          <Button onClick={handleDownload} disabled={!attachmentData}>
            <Download className="w-4 h-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    // Handle different file types
    if (attachment.mimeType.startsWith('image/')) {
      return (
        <div className="flex flex-col items-center max-h-[70vh] overflow-auto">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(3, s + 0.25))}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
          <img
            src={attachmentData}
            alt={attachment.filename}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
            className="max-w-full object-contain rounded-lg"
          />
        </div>
      );
    }

    if (attachment.mimeType === 'application/pdf') {
      return (
        <div className="flex flex-col h-[80vh]">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(page => Math.max(1, page - 1))}
                disabled={pageNumber <= 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {pageNumber} of {numPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageNumber(page => Math.min(numPages, page + 1))}
                disabled={pageNumber >= numPages}
              >
                Next
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm">{Math.round(scale * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(3, s + 0.25))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex justify-center">
            <Document
              file={attachmentData}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<div className="flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading PDF...</div>}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        </div>
      );
    }

    // For Word documents with extracted content
    if (documentContent && (attachment.mimeType.includes('officedocument.wordprocessingml') || 
        attachment.mimeType.includes('application/msword'))) {
      return (
        <div className="flex flex-col h-[80vh]">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-medium">Document Content Preview</h3>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download Original
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {documentContent}
            </pre>
          </div>
        </div>
      );
    }

    // For text files
    if (attachment.mimeType.startsWith('text/')) {
      return (
        <div className="flex flex-col h-[80vh]">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-medium">Text File Preview</h3>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <iframe
              src={attachmentData}
              title={attachment.filename}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      );
    }

    // For other file types, show info and download
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="font-medium mb-2">{attachment.filename}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {attachment.mimeType} • {formatFileSize(attachment.size)}
        </p>
        <p className="text-muted-foreground mb-4">
          This file type cannot be previewed in the browser
        </p>
        <Button onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Download File
        </Button>
      </div>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {attachment?.mimeType.startsWith('image/') ? (
                <Image className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              <span className="truncate">{attachment?.filename || 'Document Preview'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewer;