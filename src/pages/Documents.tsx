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
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
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
  const [draggedItem, setDraggedItem] = useState<UserDocument | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renamingItem, setRenamingItem] = useState<UserDocument | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Prevent auto-focus on page load
  useEffect(() => {
    // Prevent any element from being focused on page load
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    
    // Ensure we stay at top when entering page
    window.scrollTo(0, 0);
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!user?.id) {
      console.log('No user ID available, skipping document load');
      return;
    }
    
    try {
      // Don't show loading for folder navigation - only for initial load
      if (documents.length === 0) {
        setLoading(true);
      }
      
      let query = supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user.id);
      
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

      if (error) {
        console.error('Database query error:', error);
        throw error;
      }
      
      setDocuments((data || []) as UserDocument[]);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      // Only clear loading if we were actually showing it
      if (documents.length === 0) {
        setLoading(false);
      }
    }
  }, [user?.id, currentFolder?.id, toast, documents.length]);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, currentFolder?.id, loadDocuments]);

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

      // Show success message in upload box
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);

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
    if (!newFolderName.trim()) return;

    try {
      // Generate a unique file_path for the folder using timestamp and random string
      const uniquePath = `folders/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      const { error } = await supabase
        .from('user_documents')
        .insert({
          user_id: user?.id,
          name: newFolderName.trim(),
          file_path: uniquePath, // Use unique path for folders
          is_folder: true,
          folder_id: currentFolder?.id || null,
          source_type: 'upload'
        });

      if (error) throw error;

      // No success toast for folder creation

      setNewFolderName('');
      setIsCreateFolderOpen(false);
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
      // Determine the bucket and clean file path
      let bucket = 'documents';
      let filePath = doc.file_path;
      
      if (doc.file_path.startsWith('attachments/')) {
        bucket = 'attachments';
        filePath = doc.file_path.replace('attachments/', ''); // Remove the prefix
      }
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Success - no toast message needed
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };
  
  const startRename = (item: UserDocument) => {
    setRenamingItem(item);
    setNewItemName(item.name);
    setIsRenameOpen(true);
  };

  const handleRename = async () => {
    if (!renamingItem || !newItemName.trim()) return;

    try {
      const { error } = await supabase
        .from('user_documents')
        .update({ name: newItemName.trim() })
        .eq('id', renamingItem.id);

      if (error) throw error;

      setIsRenameOpen(false);
      setRenamingItem(null);
      setNewItemName('');
      loadDocuments();
    } catch (error) {
      console.error('Error renaming item:', error);
      toast({
        title: "Error",
        description: `Failed to rename ${renamingItem.is_folder ? 'folder' : 'file'}`,
        variant: "destructive",
      });
    }
  };

  const handleDocumentClick = useCallback((doc: UserDocument) => {
    if (doc.is_folder) {
      setCurrentFolder(doc);
      
      // After the folder content loads, scroll to the top of the file grid
      setTimeout(() => {
        const fileGrid = document.querySelector('[data-file-grid]');
        if (fileGrid) {
          fileGrid.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 100);
    } else {
      setSelectedDocument(doc);
      setShowDocumentViewer(true);
    }
  }, []);

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

      // Success - no toast message needed
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
        // Determine the bucket and clean file path
        let bucket = 'documents';
        let filePath = doc.file_path;
        
        if (doc.file_path.startsWith('attachments/')) {
          bucket = 'attachments';
          filePath = doc.file_path.replace('attachments/', ''); // Remove the prefix
        }
        
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove([filePath]);
        
        if (storageError) console.error('Storage deletion error:', storageError);
      }

      // Delete from database
      const { error } = await supabase
        .from('user_documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      // Success - no toast message needed

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

  const handleDragStart = (e: React.DragEvent, doc: UserDocument) => {
    setDraggedItem(doc);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    if (draggedItem && draggedItem.id !== folderId) {
      e.preventDefault();
      setDropTarget(folderId);
    }
  };

  const handleFolderDragLeave = () => {
    setDropTarget(null);
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolder: UserDocument) => {
    e.preventDefault();
    setDropTarget(null);
    
    if (!draggedItem || draggedItem.id === targetFolder.id) {
      return;
    }

    // Prevent dropping a folder into its own descendant (circular reference)
    if (draggedItem.is_folder) {
      const isDescendant = await checkIfDescendant(draggedItem.id, targetFolder.id);
      if (isDescendant) {
        toast({
          title: "Invalid Move",
          description: "Cannot move a folder into its own subfolder",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('user_documents')
        .update({ folder_id: targetFolder.id })
        .eq('id', draggedItem.id);

      if (error) throw error;

      loadDocuments();
    } catch (error) {
      console.error('Error moving item:', error);
      toast({
        title: "Error",
        description: `Failed to move ${draggedItem.is_folder ? 'folder' : 'document'}`,
        variant: "destructive",
      });
    }
  };

  // Helper function to check if targetId is a descendant of sourceId
  const checkIfDescendant = async (sourceId: string, targetId: string): Promise<boolean> => {
    const { data: folders } = await supabase
      .from('user_documents')
      .select('id, folder_id')
      .eq('user_id', user?.id)
      .eq('is_folder', true);

    if (!folders) return false;

    const findParents = (folderId: string): string[] => {
      const parents: string[] = [];
      let currentId = folderId;
      
      while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (folder?.folder_id) {
          parents.push(folder.folder_id);
          currentId = folder.folder_id;
        } else {
          break;
        }
      }
      
      return parents;
    };

    const targetParents = findParents(targetId);
    return targetParents.includes(sourceId);
  };

  // Mobile touch handlers
  const handleTouchStart = (e: React.TouchEvent, doc: UserDocument) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setDraggedItem(doc);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || !draggedItem) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStart.x);
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    
    if (deltaX > 10 || deltaY > 10) {
      setIsDragging(true);
      e.preventDefault();
    }

    // Find element under touch point
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const folderElement = elementBelow?.closest('[data-folder-id]');
    
    if (folderElement) {
      const folderId = folderElement.getAttribute('data-folder-id');
      setDropTarget(folderId);
    } else {
      setDropTarget(null);
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    if (!isDragging || !draggedItem || !dropTarget) {
      setTouchStart(null);
      setDraggedItem(null);
      setDropTarget(null);
      setIsDragging(false);
      return;
    }

    e.preventDefault();
    
    const targetFolder = documents.find(doc => doc.id === dropTarget && doc.is_folder);
    if (targetFolder && draggedItem.id !== targetFolder.id) {
      // Prevent dropping a folder into its own descendant (circular reference)
      if (draggedItem.is_folder) {
        const isDescendant = await checkIfDescendant(draggedItem.id, targetFolder.id);
        if (isDescendant) {
          toast({
            title: "Invalid Move",
            description: "Cannot move a folder into its own subfolder",
            variant: "destructive",
          });
          setTouchStart(null);
          setDraggedItem(null);
          setDropTarget(null);
          setIsDragging(false);
          return;
        }
      }

      try {
        const { error } = await supabase
          .from('user_documents')
          .update({ folder_id: targetFolder.id })
          .eq('id', draggedItem.id);

        if (error) throw error;

        loadDocuments();
      } catch (error) {
        console.error('Error moving item:', error);
        toast({
          title: "Error",
          description: `Failed to move ${draggedItem.is_folder ? 'folder' : 'document'}`,
          variant: "destructive",
        });
      }
    }

    setTouchStart(null);
    setDraggedItem(null);
    setDropTarget(null);
    setIsDragging(false);
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
      {/* Aggressively prevent ALL scroll behavior */}
      <style>{`
        html {
          scroll-behavior: auto !important;
          overflow-anchor: none !important;
        }
        body {
          scroll-behavior: auto !important;
          overflow-anchor: none !important;
        }
        * {
          scroll-behavior: auto !important;
          scroll-margin: 0 !important;
          scroll-padding: 0 !important;
          scroll-snap-type: none !important;
          overflow-anchor: none !important;
        }
        .document-grid-item {
          scroll-margin: 0 !important;
          scroll-padding: 0 !important;
          scroll-snap-align: none !important;
        }
        .document-grid-item:focus,
        .document-grid-item:focus-visible,
        .document-grid-item:target,
        .document-grid-item:active {
          scroll-margin: 0 !important;
          scroll-padding: 0 !important;
        }
        /* Prevent browser scroll-into-view on any interaction */
        div:focus {
          scroll-margin: 0 !important;
        }
        /* Disable smooth scrolling completely */
        @media (prefers-reduced-motion: no-preference) {
          * {
            scroll-behavior: auto !important;
          }
        }
      `}</style>
      {/* Header */}
      <div className="bg-background">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile/Tablet Back Arrow and Logo - Left side */}
              <div className="flex lg:hidden items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate('/dashboard')}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-2xl font-bold">Documents</h1>
              </div>
              
              {/* Desktop Header - Always visible on large screens */}
              <div className="hidden lg:flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/dashboard')}
                  className="gap-2 flex-shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </Button>
                <h1 className="text-2xl font-bold">Documents</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* New folder button moved to be inline with My Documents heading */}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Upload Area */}
        <div 
          className="mb-8"
          style={{ 
            scrollMargin: '0px',
            scrollPadding: '0px',
            outline: 'none'
          }}
          tabIndex={-1}
          onFocus={(e) => {
            console.log('UPLOAD AREA FOCUS EVENT');
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.blur();
          }}
        >
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
              tabIndex={-1}
              style={{ 
                scrollMargin: '0px',
                scrollPadding: '0px',
                outline: 'none'
              }}
              onFocus={(e) => {
                console.log('FILE INPUT FOCUS EVENT - PREVENTING');
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }}
            />
            <label 
              htmlFor="file-upload" 
              className="cursor-pointer"
              style={{ 
                scrollMargin: '0px',
                scrollPadding: '0px',
                outline: 'none'
              }}
              tabIndex={-1}
              onFocus={(e) => {
                console.log('UPLOAD LABEL FOCUS EVENT');
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }}
            >
              <div className="flex flex-col items-center gap-4">
                {uploadSuccess ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-1 text-green-700">Upload Successful!</h3>
                      <p className="text-green-600">
                        Files have been saved to My Documents
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-1">Upload Documents</h3>
                      <p className="text-muted-foreground">
                        Drag and drop files here, or click to browse
                      </p>
                    </div>
                  </>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Documents Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 
              className="text-lg font-semibold"
              style={{ 
                scrollMargin: '0px',
                scrollPadding: '0px',
                outline: 'none'
              }}
              tabIndex={-1}
              onFocus={(e) => {
                console.log('HEADER FOCUS EVENT:', currentFolder ? currentFolder.name : 'My Documents');
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }}
              ref={(el) => {
                if (el) {
                  el.scrollIntoView = () => {};
                  el.focus = () => {};
                }
              }}
            >
              {currentFolder ? currentFolder.name : 'My Documents'}
            </h2>
            
            <Drawer open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
              <button
                type="button"
                onClick={() => setIsCreateFolderOpen(true)}
                className="gap-2 shrink-0 h-auto p-0 text-primary hover:text-primary/80 bg-transparent border-0 cursor-pointer flex items-center"
              >
                <Folder className="w-4 h-4" />
                New Folder
              </button>
              <DrawerContent>
                <div className="mx-auto w-full max-w-sm">
                  <DrawerHeader>
                    <DrawerTitle>Create New Folder</DrawerTitle>
                    <DrawerDescription>
                      Enter a name for your new folder.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="p-4 pb-0">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="folder-name">Folder Name</Label>
                        <Input
                          id="folder-name"
                          placeholder="Enter folder name..."
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newFolderName.trim()) {
                              createFolder();
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <DrawerFooter>
                    <Button 
                      onClick={createFolder}
                      disabled={!newFolderName.trim()}
                      className="gap-2"
                    >
                      <Folder className="w-4 h-4" />
                      Create Folder
                    </Button>
                    <DrawerClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DrawerClose>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
          
          {/* Search */}
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search documents and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Breadcrumbs */}
          <div className="breadcrumb-container h-8 mb-3" style={{ contain: 'layout' }}>
            {currentFolder && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  onClick={() => setCurrentFolder(null)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  Documents
                </span>
                <span>/</span>
                <span className="text-foreground font-medium">
                  {currentFolder.name}
                </span>
              </div>
            )}
          </div>
          
          {loading && documents.length === 0 ? (
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
            <div 
              data-file-grid
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-3 sm:gap-4"
              style={{ 
                scrollMargin: '0px',
                scrollPadding: '0px',
                outline: 'none',
                scrollBehavior: 'auto' // Prevent smooth scrolling
              }}
              tabIndex={-1}
              onFocus={(e) => {
                console.log('GRID FOCUS EVENT - PREVENTING');
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.blur();
              }}
              ref={(el) => {
                if (el) {
                  // Completely disable all scroll methods on the grid
                  el.scrollIntoView = () => {
                    console.log('GRID scrollIntoView BLOCKED');
                  };
                  el.focus = () => {
                    console.log('GRID focus BLOCKED');
                  };
                  
                  // Prevent any automatic scrolling when content changes
                  const observer = new MutationObserver(() => {
                    // Don't scroll when content changes
                    el.scrollIntoView = () => {};
                  });
                  observer.observe(el, { childList: true, subtree: true });
                }
              }}
            >
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`document-grid-item group relative transition-all duration-300 ease-out ${
                    draggedItem?.id === doc.id ? 'opacity-50 scale-95' : ''
                  }`}
                  data-folder-id={doc.is_folder ? doc.id : undefined}
                  tabIndex={-1}
                  onFocus={(e) => {
                    console.log('FOCUS EVENT on:', doc.name, 'Scroll position:', window.scrollY);
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.blur();
                  }}
                  onFocusCapture={(e) => {
                    console.log('FOCUS CAPTURE on:', doc.name);
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, doc)}
                  onDragEnd={handleDragEnd}
                  onDragOver={doc.is_folder ? (e) => handleFolderDragOver(e, doc.id) : undefined}
                  onDragLeave={doc.is_folder ? handleFolderDragLeave : undefined}
                  onDrop={doc.is_folder ? (e) => handleFolderDrop(e, doc) : undefined}
                  onTouchStart={(e) => handleTouchStart(e, doc)}
                  onTouchMove={handleTouchMove}
                  style={{ 
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    scrollMargin: '0px',
                    scrollPadding: '0px',
                    outline: 'none'
                  }}
                >
                  {/* Preview/Icon Area - Icons are directly clickable */}
                  <div className="w-full aspect-[4/5] sm:aspect-[6/4] mb-2 flex items-center justify-center">
                    {doc.is_folder ? (
                      <svg 
                        viewBox="0 0 120 96" 
                        className={`w-20 h-16 drop-shadow-sm cursor-pointer transition-transform duration-300 ease-out ${
                          doc.is_folder && dropTarget === doc.id ? 'scale-125' : 'hover:scale-110'
                        }`}
                        onMouseUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Mouse up on:', doc.name, 'Scroll before click:', window.scrollY);
                          if (!isDragging) handleDocumentClick(doc);
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isDragging) handleDocumentClick(doc);
                        }}
                      >
                        <defs>
                          <linearGradient id={`folderGrad-${doc.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                        
                        {/* Folder body */}
                        <path
                          d="M10 24 L10 80 C10 84 14 88 18 88 L102 88 C106 88 110 84 110 80 L110 32 C110 28 106 24 102 24 L54 24 L48 16 C46 14 44 12 40 12 L18 12 C14 12 10 16 10 20 Z"
                          fill={`url(#folderGrad-${doc.id})`}
                          rx="4"
                        />
                        
                        {/* Folder tab */}
                        <path
                          d="M10 20 C10 16 14 12 18 12 L40 12 C44 12 46 14 48 16 L54 24 L48 20 C46 18 44 16 40 16 L18 16 C14 16 10 16 10 20 Z"
                          fill="#93c5fd"
                        />
                      </svg>
                    ) : (
                      <DocumentPreview 
                        document={doc}
                        className={`w-full h-full cursor-pointer transition-transform duration-300 ease-out hover:scale-110`}
                        onMouseUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Mouse up on:', doc.name, 'Scroll before click:', window.scrollY);
                          if (!isDragging) handleDocumentClick(doc);
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isDragging) handleDocumentClick(doc);
                        }}
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
                         <DropdownMenuItem onClick={(e) => {
                           e.stopPropagation();
                           startRename(doc);
                         }}>
                           <Edit className="w-4 h-4 mr-2" />
                           Rename
                         </DropdownMenuItem>
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
        
        {/* Rename Dialog */}
        <Drawer open={isRenameOpen} onOpenChange={setIsRenameOpen}>
          <DrawerContent>
            <div className="mx-auto w-full max-w-sm">
              <DrawerHeader>
                <DrawerTitle>Rename {renamingItem?.is_folder ? 'Folder' : 'File'}</DrawerTitle>
                <DrawerDescription>
                  Enter a new name for "{renamingItem?.name}".
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 pb-0">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-name">Name</Label>
                    <Input
                      id="item-name"
                      placeholder={`Enter ${renamingItem?.is_folder ? 'folder' : 'file'} name...`}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newItemName.trim()) {
                          handleRename();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <Button 
                  onClick={handleRename}
                  disabled={!newItemName.trim()}
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Rename
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
        
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