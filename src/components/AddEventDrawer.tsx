import React, { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CalendarIcon, Clock, Plus, X } from 'lucide-react';
import { format, addHours, startOfDay, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  reminder_minutes?: number;
  external_id?: string;
  calendar_id?: string;
  is_synced: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface AddEventDrawerProps {
  selectedDate?: Date;
  onEventAdded?: () => void;
  trigger?: React.ReactNode;
  gmailConnection?: any;
  eventToEdit?: CalendarEvent | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AddEventDrawer: React.FC<AddEventDrawerProps> = ({ 
  selectedDate = new Date(), 
  onEventAdded,
  trigger,
  gmailConnection,
  eventToEdit,
  open: controlledOpen,
  onOpenChange
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Use controlled or internal open state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const isEditing = !!eventToEdit;
  
  // Form state - initialize with event data if editing
  const [title, setTitle] = useState(eventToEdit?.title || '');
  const [description, setDescription] = useState(eventToEdit?.description || '');
  const [allDay, setAllDay] = useState(eventToEdit?.all_day || false);
  const [startDate, setStartDate] = useState(() => {
    if (eventToEdit) {
      return format(parseISO(eventToEdit.start_time), 'yyyy-MM-dd');
    }
    return format(selectedDate, 'yyyy-MM-dd');
  });
  const [startTime, setStartTime] = useState(() => {
    if (eventToEdit && !eventToEdit.all_day) {
      return format(parseISO(eventToEdit.start_time), 'HH:mm');
    }
    return format(selectedDate, 'HH:mm');
  });
  const [endDate, setEndDate] = useState(() => {
    if (eventToEdit) {
      return format(parseISO(eventToEdit.end_time), 'yyyy-MM-dd');
    }
    return format(selectedDate, 'yyyy-MM-dd');
  });
  const [endTime, setEndTime] = useState(() => {
    if (eventToEdit && !eventToEdit.all_day) {
      return format(parseISO(eventToEdit.end_time), 'HH:mm');
    }
    return format(addHours(selectedDate, 1), 'HH:mm');
  });
  const [reminderMinutes, setReminderMinutes] = useState<string>(() => {
    if (eventToEdit?.reminder_minutes) {
      return eventToEdit.reminder_minutes.toString();
    }
    return 'none';
  });

  const resetForm = () => {
    if (isEditing && eventToEdit) {
      // Reset to original event data
      setTitle(eventToEdit.title);
      setDescription(eventToEdit.description || '');
      setAllDay(eventToEdit.all_day);
      setStartDate(format(parseISO(eventToEdit.start_time), 'yyyy-MM-dd'));
      setStartTime(format(parseISO(eventToEdit.start_time), 'HH:mm'));
      setEndDate(format(parseISO(eventToEdit.end_time), 'yyyy-MM-dd'));
      setEndTime(format(parseISO(eventToEdit.end_time), 'HH:mm'));
      setReminderMinutes(eventToEdit.reminder_minutes?.toString() || 'none');
    } else {
      // Reset to defaults for new event
      setTitle('');
      setDescription('');
      setAllDay(false);
      setStartDate(format(selectedDate, 'yyyy-MM-dd'));
      setStartTime(format(selectedDate, 'HH:mm'));
      setEndDate(format(selectedDate, 'yyyy-MM-dd'));
      setEndTime(format(addHours(selectedDate, 1), 'HH:mm'));
      setReminderMinutes('none');
    }
  };

  // Update form dates when selectedDate changes (only for new events)
  useEffect(() => {
    if (!isEditing) {
      setStartDate(format(selectedDate, 'yyyy-MM-dd'));
      setStartTime(format(selectedDate, 'HH:mm'));
      setEndDate(format(selectedDate, 'yyyy-MM-dd'));
      setEndTime(format(addHours(selectedDate, 1), 'HH:mm'));
    }
  }, [selectedDate, isEditing]);

  // Update form fields when eventToEdit changes
  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title);
      setDescription(eventToEdit.description || '');
      setAllDay(eventToEdit.all_day);
      setStartDate(format(parseISO(eventToEdit.start_time), 'yyyy-MM-dd'));
      setStartTime(eventToEdit.all_day ? '00:00' : format(parseISO(eventToEdit.start_time), 'HH:mm'));
      setEndDate(format(parseISO(eventToEdit.end_time), 'yyyy-MM-dd'));
      setEndTime(eventToEdit.all_day ? '23:59' : format(parseISO(eventToEdit.end_time), 'HH:mm'));
      setReminderMinutes(eventToEdit.reminder_minutes?.toString() || 'none');
    }
  }, [eventToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !title.trim()) return;

    setLoading(true);
    try {
      let startDateTime: string;
      let endDateTime: string;

      if (allDay) {
        // For all-day events, use date format and set times to start/end of day
        startDateTime = new Date(`${startDate}T00:00:00`).toISOString();
        endDateTime = new Date(`${endDate}T23:59:59`).toISOString();
      } else {
        // For timed events, combine date and time
        startDateTime = new Date(`${startDate}T${startTime}`).toISOString();
        endDateTime = new Date(`${endDate}T${endTime}`).toISOString();
      }

      // Validate end time is after start time
      if (new Date(endDateTime) <= new Date(startDateTime)) {
        toast({
          title: "Invalid time",
          description: "End time must be after start time",
          variant: "destructive"
        });
        return;
      }

      // If editing, handle update logic
      if (isEditing && eventToEdit) {
        if (eventToEdit.is_synced && eventToEdit.external_id && gmailConnection) {
          // Update Google Calendar event
          try {
            console.log('Updating Google Calendar event...');
            const googleEventData = {
              summary: title.trim(),
              description: description.trim() || undefined,
              start: allDay 
                ? { date: startDate }
                : { dateTime: startDateTime },
              end: allDay 
                ? { date: endDate }
                : { dateTime: endDateTime },
              reminders: reminderMinutes !== 'none' ? {
                useDefault: false,
                overrides: [{ method: 'popup', minutes: parseInt(reminderMinutes) }]
              } : undefined
            };

            const { error: googleError } = await supabase.functions.invoke('calendar-api', {
              body: {
                action: 'update',
                eventId: eventToEdit.external_id,
                event: googleEventData
              }
            });

            if (googleError) {
              console.error('Failed to update Google Calendar event:', googleError);
              toast({
                title: "Update failed",
                description: "Failed to update event in Google Calendar",
                variant: "destructive"
              });
              return;
            }
          } catch (googleError) {
            console.error('Error updating Google Calendar event:', googleError);
            toast({
              title: "Update failed",
              description: "Failed to update event in Google Calendar",
              variant: "destructive"
            });
            return;
          }
        } else {
          // Update local event
          const { error } = await supabase
            .from('calendar_events')
            .update({
              title: title.trim(),
              description: description.trim() || null,
              start_time: startDateTime,
              end_time: endDateTime,
              all_day: allDay,
              reminder_minutes: reminderMinutes !== 'none' ? parseInt(reminderMinutes) : null,
            })
            .eq('id', eventToEdit.id);

          if (error) throw error;
        }

        setOpen(false);
        onEventAdded?.();
        return;
      }

      // If creating new event, handle creation logic
      const eventData: any = {
        title: title.trim(),
        description: description.trim() || null,
        start_time: startDateTime,
        end_time: endDateTime,
        all_day: allDay,
        reminder_minutes: reminderMinutes !== 'none' ? parseInt(reminderMinutes) : null,
        user_id: user.id,
        is_synced: false,
        external_id: null,
        calendar_id: null
      };

      // If connected to Google Calendar, only create in Google Calendar (no local copy)
      if (gmailConnection) {
        try {
          console.log('Creating event in Google Calendar only...');
          const googleEventData = {
            summary: title.trim(),
            description: description.trim() || undefined,
            start: allDay 
              ? { date: startDate }
              : { dateTime: startDateTime },
            end: allDay 
              ? { date: endDate }
              : { dateTime: endDateTime },
            reminders: reminderMinutes !== 'none' ? {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: parseInt(reminderMinutes) }]
            } : undefined
          };

          console.log('Google event data:', googleEventData);

          const { data: googleEvent, error: googleError } = await supabase.functions.invoke('calendar-api', {
            body: {
              action: 'create',
              event: googleEventData
            }
          });

          console.log('Google Calendar response:', { googleEvent, googleError });

          if (googleError) {
            console.error('Failed to create Google Calendar event:', googleError);
            
            // Check if it's a scope insufficient error
            if (googleError.message && googleError.message.includes('insufficient authentication scopes')) {
              toast({
                title: "Calendar Permission Required",
                description: "Please disconnect and reconnect your Google account to enable calendar access. Go to Account → Gmail Integration → Disconnect, then reconnect.",
                variant: "destructive"
              });
            } else if (googleError.message && googleError.message.includes('GOOGLE_ACCESS_REVOKED')) {
              toast({
                title: "Google Account Disconnected",
                description: "Your Google account access has been revoked. Please reconnect your account in Account settings.",
                variant: "destructive"
              });
            } else {
              toast({
                title: "Sync failed",
                description: googleError.message || "Failed to create event in Google Calendar",
                variant: "destructive"
              });
            }
            return; // Don't create local event if Google Calendar fails
          } else if (googleEvent?.event) {
            console.log('Successfully created Google Calendar event:', googleEvent.event);
            
            resetForm();
            setOpen(false);
            onEventAdded?.();
            return; // Successfully created in Google Calendar, don't create local event
          } else {
            console.error('Unexpected Google Calendar response:', googleEvent);
            toast({
              title: "Sync failed",
              description: "Unexpected response from Google Calendar",
              variant: "destructive"
            });
            return;
          }
        } catch (googleError) {
          console.error('Error creating Google Calendar event:', googleError);
          toast({
            title: "Sync failed", 
            description: "Failed to create event in Google Calendar",
            variant: "destructive"
          });
          return;
        }
      } else {
        // No Google Calendar connection - create local event only
        console.log('Creating local event only...');
        const { error } = await supabase
          .from('calendar_events')
          .insert([eventData]);

        if (error) throw error;
      }

      resetForm();
      setOpen(false);
      onEventAdded?.();
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: "Error",
        description: "Failed to create event. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            {isEditing ? 'Edit Event' : 'New Event'}
          </DrawerTitle>
        </DrawerHeader>
        
        <div className="px-4 pb-4 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
              />
            </div>

            {/* All-day toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="all-day"
                checked={allDay}
                onCheckedChange={setAllDay}
              />
              <Label htmlFor="all-day">All day</Label>
            </div>

            {/* Date and time inputs */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label>Start</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    {!allDay && (
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label>End</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    {!allDay && (
                      <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Reminder */}
            <div className="space-y-2">
              <Label>Reminder</Label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reminder time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No reminder</SelectItem>
                  <SelectItem value="5">5 minutes before</SelectItem>
                  <SelectItem value="10">10 minutes before</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="120">2 hours before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sync status info */}
            {gmailConnection ? (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                This event will be created in your Google Calendar
              </div>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                This event will be created locally (connect Google Calendar to sync events)
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <DrawerClose asChild>
                <Button 
                  type="button" 
                  variant="outline"
                  disabled={loading}
                >
                  Cancel
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={loading || !title.trim()}>
                {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Event' : 'Create Event')}
              </Button>
            </div>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
};