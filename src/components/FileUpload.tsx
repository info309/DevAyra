import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  onUpload: (files: File[], metadata: { category?: string; description?: string }) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: number;
  maxFiles?: number;
  maxSize?: number; // in bytes
  acceptedFileTypes?: string[];
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  onUpload,
  isUploading = false,
  uploadProgress = 0,
  maxFiles = 10,
  maxSize = 50 * 1024 * 1024, // 50MB default
  acceptedFileTypes = ['*'],
  className
}) => {
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [category, setCategory] = React.useState('');
  const [description, setDescription] = React.useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter files by size
    const validFiles = acceptedFiles.filter(file => {
      if (file.size > maxSize) {
        // Could show toast here for rejected files
        return false;
      }
      return true;
    });

    const newFiles = [...selectedFiles, ...validFiles].slice(0, maxFiles);
    setSelectedFiles(newFiles);
    onFileSelect(newFiles);
  }, [selectedFiles, maxFiles, maxSize, onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: maxFiles > 1,
    disabled: isUploading,
    accept: acceptedFileTypes.includes('*') ? undefined : acceptedFileTypes.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>)
  });

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFileSelect(newFiles);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    await onUpload(selectedFiles, { category, description });
    
    // Clear files after successful upload
    setSelectedFiles([]);
    setCategory('');
    setDescription('');
    onFileSelect([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Dropzone */}
      <Card
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed p-6 cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          isUploading && "pointer-events-none opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center text-center space-y-2">
          <Upload className="w-8 h-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse (max {formatFileSize(maxSize)} per file)
            </p>
          </div>
        </div>
      </Card>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Selected Files ({selectedFiles.length})</h4>
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} • {file.type || 'Unknown type'}
                  </p>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Metadata Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category (optional)</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Images, Documents, etc."
                className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                className="w-full mt-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          {/* Upload Button */}
          <Button 
            onClick={handleUpload}
            disabled={isUploading || selectedFiles.length === 0}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;