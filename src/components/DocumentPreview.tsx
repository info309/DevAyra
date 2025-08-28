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
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // For images, generate direct preview
      if (document.mime_type.startsWith('image/')) {
        const { data, error } = await supabase.storage
          .from('documents')
          .download(document.file_path);
        
        if (!error && data) {
          const url = URL.createObjectURL(data);
          setPreviewUrl(url);
          
          // Detect orientation
          const img = new Image();
          img.onload = () => {
            setImageOrientation(img.width > img.height ? 'landscape' : 'portrait');
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      }
      // For PDFs, we could implement PDF.js preview here
      // For now, we'll show the A4 icon
      
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

  // If it's an image and we have a preview, show the actual image
  if (document.mime_type?.startsWith('image/') && previewUrl) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <img
          src={previewUrl}
          alt={document.name}
          className={`max-w-full max-h-full object-cover rounded ${
            imageOrientation === 'landscape' ? 'w-full h-auto' : 'h-full w-auto'
          }`}
          onLoad={() => URL.revokeObjectURL(previewUrl)}
        />
      </div>
    );
  }

  // For PDFs, show a special PDF preview (could be enhanced with PDF.js)
  if (document.mime_type?.includes('pdf')) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="bg-red-50 border border-red-200 rounded p-2 flex items-center justify-center w-12 h-16">
          <div className="text-center">
            <div className="text-red-600 text-xs font-bold">PDF</div>
            <div className="text-red-500 text-[10px]">📄</div>
          </div>
        </div>
      </div>
    );
  }

  // For all other documents, show A4 icon with extension
  return (
    <A4DocumentIcon 
      extension={getFileExtension()} 
      orientation={imageOrientation}
    />
  );
};

export default DocumentPreview;