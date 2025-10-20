import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DiscoveredContact {
  email: string;
  name: string;
  email_count: number;
  last_email_date: string;
  already_exists: boolean;
}

interface FindContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactsAdded: () => void;
}

const FindContactsDialog = ({ open, onOpenChange, onContactsAdded }: FindContactsDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<DiscoveredContact[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      extractContacts();
    }
  }, [open]);

  const extractContacts = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('extract-email-contacts', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      setContacts(data.discovered_contacts || []);
      
      // Select all new contacts by default
      const newContactEmails = new Set<string>(
        (data.discovered_contacts as DiscoveredContact[])
          .filter((c: DiscoveredContact) => !c.already_exists)
          .map((c: DiscoveredContact) => c.email)
      );
      setSelectedEmails(newContactEmails);

      if (data.discovered_contacts.length === 0) {
        toast({
          title: 'No contacts found',
          description: 'No email contacts were found in your cached emails.'
        });
      } else {
        toast({
          title: 'Contacts discovered',
          description: `Found ${data.total_found} contacts (${data.total_found - data.already_in_contacts} new)`
        });
      }
    } catch (error) {
      console.error('Error extracting contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to extract contacts from emails',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleContact = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmails(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedEmails(new Set(contacts.map(c => c.email)));
  };

  const handleDeselectAll = () => {
    setSelectedEmails(new Set());
  };

  const handleSelectNewOnly = () => {
    setSelectedEmails(new Set(contacts.filter(c => !c.already_exists).map(c => c.email)));
  };

  const handleAddSelected = async () => {
    try {
      setAdding(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const contactsToAdd = contacts
        .filter(c => selectedEmails.has(c.email) && !c.already_exists)
        .map(c => ({
          user_id: user.id,
          name: c.name,
          email: c.email,
          notes: `Added from email analysis on ${new Date().toLocaleDateString()}`
        }));

      if (contactsToAdd.length === 0) {
        toast({ title: 'No contacts to add', description: 'All selected contacts already exist' });
        return;
      }

      const { error } = await supabase.from('contacts').insert(contactsToAdd);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Added ${contactsToAdd.length} new contact${contactsToAdd.length === 1 ? '' : 's'}`
      });
      onContactsAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to add contacts',
        variant: 'destructive'
      });
    } finally {
      setAdding(false);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = selectedEmails.size;
  const newSelectedCount = contacts.filter(c => selectedEmails.has(c.email) && !c.already_exists).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Find Contacts from Emails</DialogTitle>
          <DialogDescription>
            {loading ? 'Scanning your emails...' : `${contacts.length} contact${contacts.length === 1 ? '' : 's'} found`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
                <Button size="sm" variant="outline" onClick={handleSelectNewOnly}>
                  Select New Only
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {filteredContacts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No contacts match your search' : 'No contacts found'}
                    </p>
                  ) : (
                    filteredContacts.map((contact) => (
                      <div
                        key={contact.email}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          contact.already_exists ? 'bg-muted/50 opacity-60' : 'bg-card'
                        }`}
                      >
                        <Checkbox
                          checked={selectedEmails.has(contact.email)}
                          onCheckedChange={() => handleToggleContact(contact.email)}
                          disabled={contact.already_exists}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">{contact.name}</span>
                            {contact.already_exists && (
                              <Badge variant="secondary" className="text-xs">
                                Already Added
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span>{contact.email_count} email{contact.email_count === 1 ? '' : 's'}</span>
                            <span>•</span>
                            <span>Last contact {formatDistanceToNow(new Date(contact.last_email_date), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {newSelectedCount} new contact{newSelectedCount === 1 ? '' : 's'} selected
              </p>
              <Button
                onClick={handleAddSelected}
                disabled={newSelectedCount === 0 || adding}
              >
                {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add {newSelectedCount} Contact{newSelectedCount === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FindContactsDialog;
