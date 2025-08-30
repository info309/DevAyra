import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CalendarIcon, Clock, Plus } from 'lucide-react';
import { format, addHours, startOfDay } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AddEventDialogProps {
  selectedDate?: Date;
  onEventAdded?: () => void;
  trigger?: React.ReactNode;
  gmailConnection?: any;
}

export const AddEventDialog: React.FC<AddEventDialogProps> = ({ 
  selectedDate = new Date(), 
  onEventAdded,
  trigger,
  gmailConnection 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(format(selectedDate, 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(format(selectedDate, 'HH:mm'));
  const [endDate, setEndDate] = useState(format(selectedDate, 'yyyy-MM-dd'));
  const [endTime, setEndTime] = useState(format(addHours(selectedDate, 1), 'HH:mm'));
  const [reminderMinutes, setReminderMinutes] = useState<string>('15');

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAllDay(false);
    setStartDate(format(selectedDate, 'yyyy-MM-dd'));
    setStartTime(format(selectedDate, 'HH:mm'));
    setEndDate(format(selectedDate, 'yyyy-MM-dd'));
    setEndTime(format(addHours(selectedDate, 1), 'HH:mm'));
    setReminderMinutes('15');
  };

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

      const eventData: any = {
        title: title.trim(),
        description: description.trim() || null,
        start_time: startDateTime,
        end_time: endDateTime,
        all_day: allDay,
        reminder_minutes: reminderMinutes ? parseInt(reminderMinutes) : null,
        user_id: user.id,
        is_synced: false, // Will be true if we sync to Google Calendar
        external_id: null,
        calendar_id: null
      };

      // If connected to Google Calendar, try to create the event there first
      if (gmailConnection) {
        try {
          const googleEventData = {
            summary: title.trim(),
            description: description.trim() || undefined,
            start: allDay 
              ? { date: startDate }
              : { dateTime: startDateTime },
            end: allDay 
              ? { date: endDate }
              : { dateTime: endDateTime },
            reminders: reminderMinutes ? {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: parseInt(reminderMinutes) }]
            } : undefined
          };

          const { data: googleEvent, error: googleError } = await supabase.functions.invoke('calendar-api', {
            body: {
              action: 'insert',
              event: googleEventData
            }
          });

          if (googleError) {
            console.error('Failed to create Google Calendar event:', googleError);
            // Still create local event but mark as not synced
          } else if (googleEvent?.event) {
            // Successfully created in Google Calendar
            eventData.external_id = googleEvent.event.id;
            eventData.calendar_id = 'primary';
            eventData.is_synced = true;
          }
        } catch (googleError) {
          console.error('Error creating Google Calendar event:', googleError);
          // Continue with local creation
        }
      }

      // Create the event in our local database
      const { error } = await supabase
        .from('calendar_events')
        .insert([eventData]);

      if (error) throw error;

      toast({
        title: "Event created",
        description: gmailConnection && eventData.is_synced 
          ? "Event created and synced to Google Calendar" 
          : "Event created successfully"
      });

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

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Plus className="w-4 h-4 mr-2" />
      Add Event
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            New Event
          </DialogTitle>
        </DialogHeader>
        
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
                <SelectItem value="">No reminder</SelectItem>
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
          {gmailConnection && (
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
              This event will be synced to your Google Calendar
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? 'Creating...' : 'Create Event'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};