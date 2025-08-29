import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Upload, 
  FileText, 
  Image, 
  File, 
  Download, 
  Star, 
  Calendar,
  Mail,
  FolderOpen,
  Plus,
  ArrowLeft,
  Folder,
  MoreVertical,
  Edit,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { formatFileSize } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentViewer from '@/components/DocumentViewer';

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

const Documents = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [currentFolder, setCurrentFolder] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<UserDocument | null>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, currentFolder]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user?.id);
      
      // If we're in a specific folder, show only items in that folder
      // If we're at root level, show items with no folder_id (loose documents) and folders at root level
      if (currentFolder) {
        query = query.eq('folder_id', currentFolder.id);
      } else {
        query = query.is('folder_id', null);
      }
      
      const { data, error } = await query
        .order('is_folder', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data || []) as UserDocument[]);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileUpload(files);
    }
  }, [currentFolder]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    try {
      setLoading(true);
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolder) {
          formData.append('folderId', currentFolder.id);
        }

        const { error } = await supabase.functions.invoke('document-upload', {
          body: formData
        });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Uploaded ${files.length} file${files.length > 1 ? 's' : ''} successfully`,
      });

      loadDocuments();
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    try {
      const { error } = await supabase
        .from('user_documents')
        .insert({
          user_id: user?.id,
          name: folderName,
          file_path: '', // Empty for folders
          is_folder: true,
          folder_id: currentFolder?.id || null,
          source_type: 'upload'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Folder created successfully",
      });

      loadDocuments();
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (doc: UserDocument) => {
    if (doc.is_folder) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `Downloaded ${doc.name}`,
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

  const handleDocumentClick = (doc: UserDocument) => {
    if (doc.is_folder) {
      setCurrentFolder(doc);
    } else {
      setSelectedDocument(doc);
      setShowDocumentViewer(true);
    }
  };

  const toggleFavorite = async (doc: UserDocument) => {
    try {
      const { error } = await supabase
        .from('user_documents')
        .update({ is_favorite: !doc.is_favorite })
        .eq('id', doc.id);

      if (error) throw error;

      setDocuments(prev => 
        prev.map(d => d.id === doc.id ? { ...d, is_favorite: !d.is_favorite } : d)
      );

      // Also update selectedDocument if it's the same document
      if (selectedDocument?.id === doc.id) {
        setSelectedDocument(prev => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
      }

      toast({
        title: "Success",
        description: doc.is_favorite ? "Removed from favorites" : "Added to favorites",
      });
    } catch (error) {
      console.error('Error updating favorite:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite",
        variant: "destructive",
      });
    }
  };

  const deleteDocument = async (doc: UserDocument) => {
    if (!confirm(`Are you sure you want to delete ${doc.name}?`)) return;

    try {
      // If it's a file, delete from storage first
      if (!doc.is_folder && doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([doc.file_path]);
        
        if (storageError) console.error('Storage deletion error:', storageError);
      }

      // Delete from database
      const { error } = await supabase
        .from('user_documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${doc.is_folder ? 'Folder' : 'File'} deleted successfully`,
      });

      loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return File;
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
    return File;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 p-4 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Mobile/Tablet Back Arrow and Logo - Left side */}
              <div className="flex lg:hidden items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate('/dashboard')}
                  className="ml-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-2xl font-bold">
                  {currentFolder ? currentFolder.name : 'Documents'}
                </h1>
              </div>
              
              {/* Desktop Header */}
              <div className="hidden lg:flex items-center gap-3">
                {currentFolder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentFolder(null)}
                    className="gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                )}
                <h1 className="text-2xl font-bold">
                  {currentFolder ? currentFolder.name : 'Documents'}
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button onClick={createFolder} variant="outline" size="sm" className="gap-2">
                <Folder className="w-4 h-4" />
                New Folder
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Upload Area */}
        <div className="mb-8">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary hover:bg-accent/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1">Upload Documents</h3>
                  <p className="text-muted-foreground">
                    Drag and drop files here, or click to browse
                  </p>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Documents Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {currentFolder ? 'Contents' : 'My Documents'}
            </h2>
          </div>
          
          {/* Search */}
          <div className="relative max-w-md mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search documents and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchQuery ? 'No matches found' : 'No documents yet'}
              </h3>
              <p className="text-muted-foreground">
                {searchQuery 
                  ? 'Try adjusting your search terms'
                  : currentFolder 
                    ? 'This folder is empty'
                    : 'Upload some files to get started'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative cursor-pointer"
                  onClick={() => handleDocumentClick(doc)}
                >
                  {/* Preview/Icon Area */}
                  <div className="w-full aspect-[3/4] mb-2 rounded-lg overflow-hidden">
                    {doc.is_folder ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-16 h-16">
                          <svg viewBox="0 0 100 100" className="w-full h-full">
                            <defs>
                              <linearGradient id={`folderGrad-${doc.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#60a5fa" />
                                <stop offset="100%" stopColor="#3b82f6" />
                              </linearGradient>
                            </defs>
                            <path
                              d="M15 25 L35 25 L40 35 L85 35 L85 75 L15 75 Z"
                              fill={`url(#folderGrad-${doc.id})`}
                              stroke="#2563eb"
                              strokeWidth="1"
                            />
                            <path
                              d="M15 25 L15 20 L35 20 L40 30 L85 30 L85 35 L40 35 L35 25 Z"
                              fill="#93c5fd"
                              stroke="#2563eb"
                              strokeWidth="1"
                            />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <DocumentPreview 
                        document={doc}
                        className="w-full h-full"
                      />
                    )}
                  </div>
                  
                  {/* Document Info */}
                  <div className="text-center">
                    <p className="text-sm font-medium truncate w-full leading-tight mb-1" title={doc.name}>
                      {doc.name}
                    </p>
                    
                    {!doc.is_folder && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>{formatDate(doc.created_at)}</div>
                        {doc.file_size && (
                          <div>{formatFileSize(doc.file_size)}</div>
                        )}
                      </div>
                    )}
                    
                    {doc.is_folder && (
                      <div className="text-xs text-muted-foreground">
                        {/* We'd need to count items in folder here */}
                        Folder
                      </div>
                    )}
                  </div>

                  {/* Context Menu */}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 bg-background/80 hover:bg-background shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!doc.is_folder && (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDocument(doc);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Document Viewer */}
        <DocumentViewer
          document={selectedDocument}
          isOpen={showDocumentViewer}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedDocument(null);
          }}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  );
};

export default Documents;