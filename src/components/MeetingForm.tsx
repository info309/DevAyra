import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MeetingFormData {
  title: string;
  description?: string;
  meeting_platform: string;
  meeting_link?: string;
  start_time: string;
  end_time: string;
  location?: string;
  notes?: string;
}

interface MeetingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: any;
}

const MeetingForm = ({ open, onOpenChange, meeting }: MeetingFormProps) => {
  const { user } = useAuth();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<MeetingFormData>();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const meetingPlatform = watch('meeting_platform');

  useEffect(() => {
    const fetchContacts = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      setContacts(data || []);
    };
    fetchContacts();
  }, [user]);

  useEffect(() => {
    if (meeting) {
      reset({
        title: meeting.title,
        description: meeting.description,
        meeting_platform: meeting.meeting_platform,
        meeting_link: meeting.meeting_link,
        start_time: format(new Date(meeting.start_time), "yyyy-MM-dd'T'HH:mm"),
        end_time: format(new Date(meeting.end_time), "yyyy-MM-dd'T'HH:mm"),
        location: meeting.location,
        notes: meeting.notes,
      });
      setSelectedAttendees(meeting.attendees?.map((a: any) => a.email) || []);
    } else {
      reset({
        title: '',
        description: '',
        meeting_platform: 'google_meet',
        meeting_link: '',
        start_time: '',
        end_time: '',
        location: '',
        notes: '',
      });
      setSelectedAttendees([]);
    }
  }, [meeting, reset]);

  const onSubmit = async (data: MeetingFormData) => {
    if (!user) return;
    setLoading(true);

    try {
      const attendeesData = selectedAttendees.map(email => {
        const contact = contacts.find(c => c.email === email);
        return { name: contact?.name || email, email };
      });

      const meetingData = {
        ...data,
        user_id: user.id,
        attendees: attendeesData,
        start_time: new Date(data.start_time).toISOString(),
        end_time: new Date(data.end_time).toISOString(),
      };

      if (meeting) {
        const { error } = await supabase
          .from('meetings')
          .update(meetingData)
          .eq('id', meeting.id);

        if (error) throw error;
        toast.success('Meeting updated');
      } else {
        // Call edge function to create meeting and send invitations
        const { error: functionError } = await supabase.functions.invoke('schedule-meeting', {
          body: meetingData,
        });

        if (functionError) throw functionError;
        toast.success('Meeting scheduled and invitations sent');
      }

      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      console.error('Error saving meeting:', error);
      toast.error('Failed to save meeting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>{meeting ? 'Edit Meeting' : 'Schedule Meeting'}</DrawerTitle>
            <DrawerDescription>
              {meeting ? 'Update meeting information' : 'Schedule a new online meeting'}
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60vh] overflow-y-auto">
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="grid gap-4 p-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    {...register('title', { required: 'Title is required' })}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" {...register('description')} rows={2} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="datetime-local"
                      {...register('start_time', { required: 'Start time is required' })}
                    />
                    {errors.start_time && (
                      <p className="text-sm text-destructive">{errors.start_time.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="datetime-local"
                      {...register('end_time', { required: 'End time is required' })}
                    />
                    {errors.end_time && (
                      <p className="text-sm text-destructive">{errors.end_time.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="meeting_platform">Meeting Platform *</Label>
                  <Select
                    onValueChange={(value) => setValue('meeting_platform', value)}
                    defaultValue={meetingPlatform || 'google_meet'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {meetingPlatform === 'google_meet' ? (
                  <div className="grid gap-2">
                    <Label>Meeting Link</Label>
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      ✨ Google Meet link will be auto-generated when you schedule the meeting
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="meeting_link">Meeting Link</Label>
                    <Input
                      id="meeting_link"
                      placeholder="Enter meeting link"
                      {...register('meeting_link')}
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Attendees</Label>
                  <div className="border rounded-md p-4 max-h-48 overflow-y-auto space-y-2">
                    {contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No contacts available</p>
                    ) : (
                      contacts.map((contact) => (
                        <div key={contact.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={contact.id}
                            checked={selectedAttendees.includes(contact.email)}
                            onCheckedChange={(checked) => {
                              setSelectedAttendees(prev =>
                                checked
                                  ? [...prev, contact.email]
                                  : prev.filter(email => email !== contact.email)
                              );
                            }}
                          />
                          <label
                            htmlFor={contact.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {contact.name} ({contact.email})
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" {...register('notes')} rows={2} />
                </div>
              </div>
              <DrawerFooter>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : meeting ? 'Update' : 'Schedule & Send Invites'}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </DrawerFooter>
            </form>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MeetingForm;
