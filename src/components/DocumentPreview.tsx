import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DocumentPreviewProps {
  document: {
    id: string;
    name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
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
    if (!document.mime_type || !document.file_path) {
      console.log('No mime type or file path for document:', document.name);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Generating preview for:', document.name, 'Type:', document.mime_type);
      
      // For images, generate direct preview
      if (document.mime_type.startsWith('image/')) {
        console.log('Creating signed URL for image:', document.file_path);
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.file_path, 3600); // 1 hour expiry
        
        if (error) {
          console.error('Error creating signed URL:', error);
        } else if (data) {
          console.log('Signed URL created:', data.signedUrl);
          setPreviewUrl(data.signedUrl);
          
          // Detect orientation
          const img = new Image();
          img.onload = () => {
            console.log('Image loaded, dimensions:', img.width, 'x', img.height);
            setImageOrientation(img.width > img.height ? 'landscape' : 'portrait');
          };
          img.onerror = (e) => {
            console.error('Error loading image:', e);
          };
          img.src = data.signedUrl;
        }
      }
      
      // For PDFs, create a signed URL for preview
      if (document.mime_type?.includes('pdf')) {
        console.log('Creating signed URL for PDF:', document.file_path);
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(document.file_path, 3600);
        
        if (error) {
          console.error('Error creating PDF signed URL:', error);
        } else if (data) {
          console.log('PDF signed URL created:', data.signedUrl);
          setPreviewUrl(data.signedUrl);
        }
      }
      
    } catch (error) {
      console.error('Error generating preview:', error);
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
      <div className={`${className} bg-muted rounded-lg overflow-hidden shadow-md animate-pulse`}>
        <div className="w-full h-full bg-muted-foreground/20"></div>
      </div>
    );
  }

  // If it's an image and we have a preview, show the actual image
  if (document.mime_type?.startsWith('image/') && previewUrl) {
    return (
      <div className={`${className} bg-background rounded-lg overflow-hidden shadow-md border border-border`}>
        <img
          src={previewUrl}
          alt={document.name}
          className="w-full h-full object-contain"
          style={{ minHeight: '120px' }}
          onError={(e) => {
            console.error('Image failed to load:', previewUrl);
            setPreviewUrl(null); // Fallback to document preview
          }}
        />
      </div>
    );
  }

  // For PDFs, show a document-like preview
  if (document.mime_type?.includes('pdf')) {
    return (
      <div className={`${className} bg-background rounded-lg overflow-hidden shadow-md border border-border`}>
        <div className="w-full h-full bg-card relative">
          {/* PDF icon and preview */}
          <div className="p-4 h-full flex flex-col items-center justify-center">
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg mb-3 font-medium text-sm">
              PDF
            </div>
            <div className="space-y-2 w-full max-w-[80%]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`bg-muted rounded h-2 ${i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6'}`} 
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For all other documents, show document-like preview
  return (
    <div className={`${className} bg-background rounded-lg overflow-hidden shadow-md border border-border`}>
      <div className="w-full h-full bg-card relative p-4">
        {/* Document lines simulation */}
        <div className="space-y-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div 
              key={i} 
              className={`bg-muted rounded h-2 ${i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-full' : 'w-4/5'}`} 
            />
          ))}
        </div>
        
        {/* File extension in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg font-medium text-sm shadow-lg">
            {getFileExtension()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentPreview;