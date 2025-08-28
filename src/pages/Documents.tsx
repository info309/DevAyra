import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  Filter,
  Grid,
  List
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { formatFileSize } from '@/lib/utils';
import DocumentUploadDialog from '@/components/DocumentUploadDialog';

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
  created_at: string;
  updated_at: string;
}

const Documents = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'upload' | 'email_attachment'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user?.id)
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

  const handleDownload = async (doc: UserDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (error) throw error;

      // Create blob URL and trigger download
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.source_email_subject?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterSource === 'all' || doc.source_type === filterSource;
    
    return matchesSearch && matchesFilter;
  });

  const handleFileUpload = async (files: File[], metadata: { category?: string; description?: string }) => {
    try {
      setLoading(true);
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (metadata.category) formData.append('category', metadata.category);
        if (metadata.description) formData.append('description', metadata.description);

        const { error } = await supabase.functions.invoke('document-upload', {
          body: formData
        });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Uploaded ${files.length} file${files.length > 1 ? 's' : ''} successfully`,
      });

      loadDocuments(); // Refresh the document list
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

  const handleFileSelect = (files: File[]) => {
    // Files selected, ready for upload
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-heading font-bold">Documents</h1>
            <div className="flex items-center gap-2">
              <DocumentUploadDialog
                onUpload={handleFileUpload}
                isUploading={loading}
              />
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={filterSource === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterSource('all')}
              >
                All
              </Button>
              <Button
                variant={filterSource === 'upload' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterSource('upload')}
              >
                <Upload className="w-4 h-4 mr-1" />
                Uploaded
              </Button>
              <Button
                variant={filterSource === 'email_attachment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterSource('email_attachment')}
              >
                <Mail className="w-4 h-4 mr-1" />
                From Email
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading documents...</div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No documents found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterSource !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Upload files or save email attachments to get started'
              }
            </p>
            {!searchQuery && filterSource === 'all' && (
              <Button asChild>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Your First Document
                </label>
              </Button>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-2"
          }>
            {filteredDocuments.map((doc) => {
              const FileIcon = getFileIcon(doc.mime_type);
              
              if (viewMode === 'grid') {
                return (
                  <Card key={doc.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <FileIcon className="w-8 h-8 text-primary" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFavorite(doc)}
                          className={doc.is_favorite ? "text-yellow-500" : "text-muted-foreground"}
                        >
                          <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-current' : ''}`} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h4 className="font-medium truncate mb-1" title={doc.name}>
                        {doc.name}
                      </h4>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {doc.source_type === 'email_attachment' ? 'Email' : 'Upload'}
                        </Badge>
                        {doc.file_size && (
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)}
                          </span>
                        )}
                      </div>

                      {doc.source_email_subject && (
                        <p className="text-xs text-muted-foreground truncate mb-2">
                          From: {doc.source_email_subject}
                        </p>
                      )}

                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                        <Calendar className="w-3 h-3" />
                        {formatDate(doc.created_at)}
                      </div>

                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </CardContent>
                  </Card>
                );
              } else {
                return (
                  <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <FileIcon className="w-8 h-8 text-primary flex-shrink-0" />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{doc.name}</h4>
                            {doc.is_favorite && (
                              <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {doc.source_type === 'email_attachment' ? 'Email' : 'Upload'}
                            </Badge>
                            {doc.file_size && (
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(doc.file_size)}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.created_at)}
                            </span>
                          </div>

                          {doc.source_email_subject && (
                            <p className="text-sm text-muted-foreground truncate">
                              From email: {doc.source_email_subject}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFavorite(doc)}
                            className={doc.is_favorite ? "text-yellow-500" : "text-muted-foreground"}
                          >
                            <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-current' : ''}`} />
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleDownload(doc)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Documents;