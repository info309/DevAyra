import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { 
  Search, 
  FileText, 
  Image, 
  File, 
  Star, 
  Calendar,
  Mail,
  Upload,
  Check,
  FolderOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatFileSize } from '@/lib/utils';

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

interface DocumentPickerProps {
  onDocumentsSelected: (documents: UserDocument[]) => void;
  selectedDocuments?: UserDocument[];
  multiple?: boolean;
  trigger?: React.ReactNode;
}

const DocumentPicker: React.FC<DocumentPickerProps> = ({
  onDocumentsSelected,
  selectedDocuments = [],
  multiple = true,
  trigger
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'upload' | 'email_attachment'>('all');
  const [open, setOpen] = useState(false);
  const [localSelection, setLocalSelection] = useState<UserDocument[]>(selectedDocuments);

  useEffect(() => {
    if (user && open) {
      loadDocuments();
    }
  }, [user, open]);

  useEffect(() => {
    setLocalSelection(selectedDocuments);
  }, [selectedDocuments]);

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

  const getFileIcon = (mimeType: string | null, fileName: string) => {
    if (!mimeType && !fileName) return File;
    
    const fileExtension = fileName.toLowerCase().split('.').pop();
    
    // Check by MIME type first
    if (mimeType) {
      if (mimeType.includes('pdf')) return FileText;
      if (mimeType.startsWith('image/')) return Image;
      if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
      if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileText;
      if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return FileText;
    }
    
    // Fallback to file extension
    switch (fileExtension) {
      case 'pdf':
        return FileText;
      case 'doc':
      case 'docx':
        return FileText;
      case 'xls':
      case 'xlsx':
        return FileText;
      case 'ppt':
      case 'pptx':
        return FileText;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return Image;
      default:
        return File;
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

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.source_email_subject?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterSource === 'all' || doc.source_type === filterSource;
    
    return matchesSearch && matchesFilter;
  });

  const handleDocumentToggle = (document: UserDocument) => {
    console.log('Document toggle clicked:', document.name);
    if (multiple) {
      const isSelected = localSelection.some(d => d.id === document.id);
      if (isSelected) {
        const newSelection = localSelection.filter(d => d.id !== document.id);
        console.log('Removing document, new selection:', newSelection.map(d => d.name));
        setLocalSelection(newSelection);
      } else {
        const newSelection = [...localSelection, document];
        console.log('Adding document, new selection:', newSelection.map(d => d.name));
        setLocalSelection(newSelection);
      }
    } else {
      console.log('Single select mode, selecting:', document.name);
      setLocalSelection([document]);
    }
  };

  const handleConfirm = () => {
    console.log('DocumentPicker confirm clicked with selection:', localSelection.map(d => d.name));
    onDocumentsSelected(localSelection);
    setOpen(false);
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <FolderOpen className="w-4 h-4" />
      From Documents
    </Button>
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger || defaultTrigger}
      </DrawerTrigger>
      <DrawerContent 
        className="h-[85vh] max-w-full"
        onPointerDownOutside={(e) => {
          // Allow closing when clicking outside the drawer
        }}
        onInteractOutside={(e) => {
          // Allow closing when clicking outside the drawer
        }}
      >
        <DrawerHeader className="border-b px-4 pb-3">
          <DrawerTitle>Select Documents to Attach</DrawerTitle>
        </DrawerHeader>
        
        <div 
          className="flex flex-col gap-4 flex-1 min-h-0 p-4" 
          onClick={(e) => {
            // Prevent drawer from closing when clicking inside content area
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            // Prevent drawer from closing on mouse down inside content area
            e.stopPropagation();
          }}
        >
          {/* Search */}
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Selection Counter */}
          <div className="text-sm text-muted-foreground">
            {localSelection.length} document{localSelection.length !== 1 ? 's' : ''} selected
          </div>

          {/* Document List */}
          <ScrollArea className="flex-1 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading documents...</div>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <FolderOpen className="w-12 h-12 text-muted-foreground mb-2" />
                <h3 className="text-lg font-medium mb-1">No documents found</h3>
                <p className="text-muted-foreground text-sm">
                  {searchQuery || filterSource !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Upload files or save email attachments first'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map((doc) => {
                  const FileIcon = getFileIcon(doc.mime_type, doc.name);
                  const isSelected = localSelection.some(d => d.id === doc.id);
                  
                  return (
                    <Card 
                      key={doc.id} 
                      className="hover:shadow-sm transition-all cursor-pointer"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('Card clicked:', doc.name);
                        handleDocumentToggle(doc);
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <FileIcon className="w-8 h-8 text-primary flex-shrink-0" />
                            {isSelected && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium truncate text-sm">{doc.name}</h4>
                              {doc.is_favorite && (
                                <Star className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" />
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 mb-1">
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
                              <p className="text-xs text-muted-foreground truncate">
                                From email: {doc.source_email_subject}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button 
              variant="outline" 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleConfirm();
              }}
              disabled={localSelection.length === 0}
            >
              Attach {localSelection.length} Document{localSelection.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default DocumentPicker;