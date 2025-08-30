import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DocumentPreviewProps {
  document: {
    id: string;
    name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
    thumbnail_path?: string | null;
  };
  className?: string;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ document, className = "" }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generatePreview();
  }, [document]);

  const generatePreview = async () => {
    try {
      setLoading(true);
      console.log('Generating preview for:', document.name);
      
      // First, try to load thumbnail if available
      if (document.thumbnail_path) {
        console.log('Loading thumbnail:', document.thumbnail_path);
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.thumbnail_path, 3600, {
            download: false
          });
        
        if (!error && data) {
          console.log('Thumbnail loaded successfully');
          setPreviewUrl(data.signedUrl);
          setLoading(false);
          return;
        } else {
          console.log('Failed to load thumbnail, falling back to original logic');
        }
      }
      
      // Fallback to original preview logic if no thumbnail
      if (!document.mime_type || !document.file_path) {
        console.log('No mime type or file path for document:', document.name);
        setLoading(false);
        return;
      }

      console.log('Fallback preview for:', document.name, 'Type:', document.mime_type);
      
      // For images and PDFs, generate direct preview
      if (document.mime_type.startsWith('image/') || document.mime_type.includes('pdf')) {
        console.log('Creating signed URL for:', document.mime_type, 'at path:', document.file_path);
        
        // First, let's check if the file actually exists in storage
        const { data: fileData, error: fileError } = await supabase.storage
          .from('documents')
          .list(`attachments/${document.file_path.split('/')[1]}`, {
            limit: 100,
            search: document.name.split('_')[0] // Search by base filename
          });
          
        console.log('Storage list result for', document.file_path, ':', { fileData, fileError });
        
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.file_path, 3600, {
            download: false
          });
        
        if (error) {
          console.error('Error creating signed URL for', document.file_path, ':', error);
          console.log('Available files in storage:', fileData);
          setPreviewUrl(null);
        } else if (data) {
          console.log('Signed URL created successfully:', data.signedUrl);
          setPreviewUrl(data.signedUrl);
          
          // For images, detect orientation
          if (document.mime_type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
              console.log('Image loaded, dimensions:', img.width, 'x', img.height);
              setImageOrientation(img.width > img.height ? 'landscape' : 'portrait');
            };
            img.onerror = (e) => {
              console.error('Error loading image:', e);
              setPreviewUrl(null);
            };
            img.src = data.signedUrl;
          }
        }
      }
      
      // For other documents, don't generate preview URL
      else {
        setPreviewUrl(null);
      }
      
    } catch (error) {
      console.error('Error generating preview:', error);
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const getFileExtension = () => {
    const extension = document.name.split('.').pop()?.toUpperCase();
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

  const A4DocumentIcon = ({ extension, orientation = 'portrait' }: { extension: string; orientation?: 'portrait' | 'landscape' }) => {
    const isLandscape = orientation === 'landscape';
    const width = isLandscape ? 64 : 48;
    const height = isLandscape ? 48 : 64;
    
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <svg 
          width={width} 
          height={height} 
          viewBox={`0 0 ${width} ${height}`} 
          className="drop-shadow-sm"
        >
          <defs>
            <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
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
            fill="url(#paperGrad)"
            stroke="#e2e8f0"
            strokeWidth="1"
            rx="2"
          />
          
          {/* Document lines */}
          {Array.from({ length: Math.floor(height / 8) - 2 }).map((_, i) => (
            <line
              key={i}
              x1="6"
              y1={8 + i * 6}
              x2={width - 6}
              y2={8 + i * 6}
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
          ))}
          
          {/* Document corner fold */}
          <path
            d={`M${width - 12} 2 L${width - 2} 12 L${width - 12} 12 Z`}
            fill="#f1f5f9"
            stroke="#e2e8f0"
            strokeWidth="0.5"
          />
          
          {/* Extension text */}
          <text
            x={width / 2}
            y={height / 2 + 3}
            textAnchor="middle"
            className="fill-slate-600 text-[8px] font-medium"
            style={{ fontSize: extension.length > 4 ? '6px' : '8px' }}
          >
            {extension}
          </text>
        </svg>
      </div>
    );
  };

  // Show loading state
  if (loading) {
    return (
      <div className={`${className} bg-muted/30 rounded-xl animate-pulse`}>
        <div className="w-full h-full bg-muted/50 rounded-xl"></div>
      </div>
    );
  }

  // If we have a preview URL, show appropriate preview
  if (previewUrl) {
    // For PDFs, use iframe preview instead of image
    if (document.mime_type?.includes('pdf')) {
      return (
        <div className={`${className} bg-muted/30 rounded-xl overflow-hidden`}>
          <iframe
            src={`${previewUrl}#view=FitH&pagemode=none&toolbar=0&navpanes=0&statusbar=0`}
            className="w-full h-full border-0"
            title={`Preview of ${document.name}`}
            onError={(e) => {
              console.error('PDF preview failed to load:', previewUrl);
              setPreviewUrl(null); // Fallback to document icon
            }}
          />
        </div>
      );
    }
    
    // For images and other supported types, use image preview
    return (
      <div className={`${className} bg-muted/30 rounded-xl overflow-hidden`}>
        <img
          src={previewUrl}
          alt={document.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error('Preview failed to load:', previewUrl);
            setPreviewUrl(null); // Fallback to document icon
          }}
        />
      </div>
    );
  }

  // For PDFs without thumbnails, show a simple document preview
  if (document.mime_type?.includes('pdf')) {
    return (
      <div className={`${className} bg-muted/30 rounded-xl flex flex-col items-center justify-center p-6`}>
        <div className="w-8 h-10 mb-3 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-full h-full text-red-500 fill-current">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
            <path d="M6.5,15.25L7.5,15.25L7.5,16.75L6.5,16.75L6.5,15.25M6.5,12.25L10.5,12.25L10.5,13.75L6.5,13.75L6.5,12.25M6.5,9.25L10.5,9.25L10.5,10.75L6.5,10.75L6.5,9.25Z" />
          </svg>
        </div>
        <div className="text-xs text-muted-foreground font-medium">PDF</div>
      </div>
    );
  }

  // For all other documents without thumbnails, show document icon
  return (
    <div className={`${className} bg-muted/30 rounded-xl flex flex-col items-center justify-center p-6`}>
      <div className="w-8 h-10 mb-3 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-full h-full text-primary fill-current">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
        </svg>
      </div>
      <div className="text-xs text-muted-foreground font-medium">
        {getFileExtension()}
      </div>
    </div>
  );
};

export default DocumentPreview;