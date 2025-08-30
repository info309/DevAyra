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
  onMouseUp?: (e: React.MouseEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ document, className = "", onMouseUp, onTouchEnd }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);

  const getFileExtension = () => {
    const extension = document.name.split('.').pop()?.toUpperCase();
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

  const SimpleDocIcon = ({ extension }: { extension: string }) => {
    // Determine document color based on type
    let bgColor = '#4285f4'; // Default blue
    if (extension === 'PDF') bgColor = '#dc2626'; // Red
    else if (extension === 'XLS') bgColor = '#16a34a'; // Green  
    else if (extension === 'PPT') bgColor = '#ea580c'; // Orange
    else if (extension === 'IMG') bgColor = '#7c3aed'; // Purple
    else if (extension === 'TXT') bgColor = '#6b7280'; // Gray

    return (
      <div className="w-full h-full flex items-center justify-center">
        <div 
          className="relative bg-white border border-gray-200 shadow-sm w-12 h-16 rounded-sm"
        >
          {/* Header stripe */}
          <div 
            className="w-full h-4 flex items-center justify-center rounded-t-sm"
            style={{ backgroundColor: bgColor }}
          >
            <span className="text-white font-bold text-[8px]">{extension}</span>
          </div>
          
          {/* Document lines */}
          <div className="p-1 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div 
                key={i}
                className="bg-gray-100 rounded-sm"
                style={{ 
                  height: '1px',
                  width: i === 0 ? '80%' : i === 5 ? '60%' : '100%'
                }}
              />
            ))}
          </div>
          
          {/* Corner fold */}
          <div 
            className="absolute top-0 right-0 border-l-[6px] border-b-[6px] border-l-gray-100 border-b-transparent"
          />
        </div>
      </div>
    );
  };

  // Load thumbnail if available
  useEffect(() => {
    const loadThumbnail = async () => {
      if (document.thumbnail_path && !thumbnailError) {
        try {
          const { data } = await supabase.storage
            .from('documents')
            .createSignedUrl(document.thumbnail_path, 3600); // 1 hour expiry
          
          if (data?.signedUrl) {
            setThumbnailUrl(data.signedUrl);
          } else {
            setThumbnailError(true);
          }
        } catch (error) {
          console.error('Error loading thumbnail:', error);
          setThumbnailError(true);
        }
      }
    };

    loadThumbnail();
  }, [document.thumbnail_path, thumbnailError]);

  // Render thumbnail or fallback to icon
  return (
    <div 
      className={`${className} bg-muted/30 rounded-xl overflow-hidden relative`}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
    >
      {thumbnailUrl && !thumbnailError ? (
        <img
          src={thumbnailUrl}
          alt={document.name}
          className="w-full h-full object-cover"
          onError={() => setThumbnailError(true)}
          loading="lazy"
        />
      ) : (
        <SimpleDocIcon extension={getFileExtension()} />
      )}
    </div>
  );
};

export default DocumentPreview;