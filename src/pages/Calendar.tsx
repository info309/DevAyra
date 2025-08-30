import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar as CalendarIcon, Plus, ArrowLeft, Clock, MapPin, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay, differenceInDays, addDays } from 'date-fns';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import { InteractiveCalendar } from '@/components/InteractiveCalendar';
import { EventsList } from '@/components/EventsList';
import { AddEventDrawer } from '@/components/AddEventDrawer';

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

interface GmailConnection {
  id: string;
  email_address: string;
  is_active: boolean;
}

const Calendar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const isDrawerView = useIsDrawerView();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnection, setGmailConnection] = useState<GmailConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);

  // Load events and check Gmail connection
  useEffect(() => {
    if (user) {
      checkGmailConnection();
    }
  }, [user]);

  // Load events when connection status or month changes
  useEffect(() => {
    if (user && gmailConnection !== null) {
      // Wait for connection check to complete
      loadEvents();
    }
  }, [user, currentMonth, gmailConnection]);

  const loadEvents = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      // Get events for the current month
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      // First, try to load Google Calendar events if connected
      let allEvents: CalendarEvent[] = [];
      
      if (gmailConnection) {
        try {
          console.log('Fetching Google Calendar events...');
          const { data: googleEvents, error: googleError } = await supabase.functions.invoke('calendar-api', {
            body: {
              action: 'list',
              timeMin: monthStart.toISOString(),
              timeMax: monthEnd.toISOString()
            }
          });
          if (googleError) {
            console.error('Google Calendar API error:', googleError);
            // Continue to load local events
          } else if (googleEvents?.events) {
            console.log('Received Google Calendar events:', googleEvents.events.length);
            // Convert Google Calendar events to our format
            const convertedEvents: CalendarEvent[] = googleEvents.events.map((event: any) => ({
              id: event.id,
              title: event.summary || 'Untitled Event',
              description: event.description || '',
              start_time: event.start?.dateTime || event.start?.date,
              end_time: event.end?.dateTime || event.end?.date,
              all_day: !!event.start?.date,
              // All day if date is used instead of dateTime
              reminder_minutes: event.reminders?.overrides?.[0]?.minutes || null,
              external_id: event.id,
              calendar_id: 'primary',
              is_synced: true,
              user_id: user.id,
              created_at: event.created || new Date().toISOString(),
              updated_at: event.updated || new Date().toISOString()
            }));
            allEvents.push(...convertedEvents);
          }
        } catch (googleError) {
          console.error('Error fetching Google Calendar events:', googleError);
          // Continue to load local events
        }
      } else {
        console.log('No Gmail connection found, loading local events only');
      }

      // Always load local events to combine with Google Calendar events
      const { data: localEvents, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .order('start_time');
      
      if (error) throw error;
      
      // Add local events to the combined events array
      if (localEvents) {
        allEvents.push(...localEvents);
      }
      
      // Remove duplicates (in case an event exists both locally and in Google Calendar)
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex((e) => e.external_id && e.external_id === event.external_id || e.id === event.id)
      );
      
      setEvents(uniqueEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: "Error",
        description: "Failed to load calendar events",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkGmailConnection = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      setGmailConnection(data);
    } catch (error) {
      console.error('Error checking Gmail connection:', error);
    }
  };

  const connectGoogleCalendar = async () => {
    if (!user?.id) return;
    try {
      setConnecting(true);

      // Get auth URL with calendar scopes  
      const response = await fetch(`https://lmkpmnndrygjatnipfgd.supabase.co/functions/v1/gmail-auth?userId=${user.id}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      const data = await response.json();

      // Open popup for authentication
      const popup = window.open(data.authUrl, 'google-calendar-auth', 'width=500,height=600,scrollbars=yes,resizable=yes');

      // Listen for messages from the popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setConnecting(false);
          checkGmailConnection();
          toast({
            title: "Success",
            description: "Google Calendar connected successfully!"
          });
        } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setConnecting(false);
          toast({
            title: "Error",
            description: "Failed to connect Google Calendar",
            variant: "destructive"
          });
        }
      };
      window.addEventListener('message', handleMessage);

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setConnecting(false);
        }
      }, 1000);
    } catch (error) {
      console.error('Error connecting Google Calendar:', error);
      setConnecting(false);
      toast({
        title: "Error",
        description: "Failed to initiate Google Calendar connection",
        variant: "destructive"
      });
    }
  };

  // Get events for selected date - including multi-day events that span this date
  const selectedDateEvents = events.filter(event => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const selectedDay = startOfDay(selectedDate);
    
    // Check if the selected date falls within the event's date range (inclusive)
    return selectedDay >= startOfDay(eventStart) && selectedDay <= startOfDay(eventEnd);
  });

  // Get all days with events for the calendar view
  const eventDates = events.reduce((dates: Date[], event) => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const daysDiff = differenceInDays(eventEnd, eventStart);

    // Add all days that this event spans
    for (let i = 0; i <= daysDiff; i++) {
      dates.push(addDays(eventStart, i));
    }
    return dates;
  }, []);

  const formatEventTime = (event: CalendarEvent, forSelectedDate: Date) => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const daysDiff = differenceInDays(eventEnd, eventStart);
    if (event.all_day) {
      if (daysDiff === 0) {
        return 'All day';
      } else {
        return `All day (${daysDiff + 1} days)`;
      }
    }

    // Multi-day event
    if (daysDiff > 0) {
      const isFirstDay = isSameDay(eventStart, forSelectedDate);
      const isLastDay = isSameDay(eventEnd, forSelectedDate);
      if (isFirstDay) {
        return `${format(eventStart, 'h:mm a')} - continues tomorrow`;
      } else if (isLastDay) {
        return `Continues until ${format(eventEnd, 'h:mm a')}`;
      } else {
        return 'All day (continued)';
      }
    }

    // Single day event
    return `${format(eventStart, 'h:mm a')} - ${format(eventEnd, 'h:mm a')}`;
  };

  const getEventBadgeText = (event: CalendarEvent) => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const daysDiff = differenceInDays(eventEnd, eventStart);
    if (daysDiff > 0) {
      return 'Multi-day';
    }
    return event.is_synced ? 'Synced' : 'Local';
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    try {
      if (event.is_synced && event.external_id && gmailConnection) {
        // Delete from Google Calendar
        const { error: googleError } = await supabase.functions.invoke('calendar-api', {
          body: {
            action: 'delete',
            eventId: event.external_id
          }
        });
        
        if (googleError) {
          console.error('Failed to delete from Google Calendar:', googleError);
          toast({
            title: "Error",
            description: "Failed to delete event from Google Calendar",
            variant: "destructive"
          });
          return;
        }
      } else {
        // Delete local event
        const { error } = await supabase
          .from('calendar_events')
          .delete()
          .eq('id', event.id);
          
        if (error) throw error;
      }
      
      // Reload events
      loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive"
      });
    }
  };

  const handleEditEvent = (event: CalendarEvent) => {
    // For now, just show a toast. We can implement edit functionality later
    toast({
      title: "Edit Event",
      description: "Event editing coming soon!"
    });
  };

  if (isDrawerView) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="p-2">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl font-bold">
                {format(new Date(), "EEEE do MMMM yyyy")}
              </h1>
            </div>
            
            <AddEventDrawer
              selectedDate={selectedDate}
              onEventAdded={loadEvents}
              gmailConnection={gmailConnection}
              trigger={
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Event
                </Button>
              }
            />
          </div>

          {/* Connection Status */}
          {!gmailConnection && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="text-center">
                  <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">Connect Google Calendar</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Sync your events with Google Calendar to access them everywhere.
                  </p>
                  <Button onClick={connectGoogleCalendar} disabled={connecting} size="sm">
                    {connecting ? 'Connecting...' : 'Connect Google Calendar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mobile Calendar with events built-in */}
          <InteractiveCalendar
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            events={events}
            onAddEvent={() => {
              // This will be handled by the AddEventDialog component
            }}
            showEvents={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Desktop Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
            <h1 className="text-2xl font-bold">
              {format(new Date(), "EEEE do MMMM yyyy")}
            </h1>
          </div>
          
          <AddEventDrawer
            selectedDate={selectedDate}
            onEventAdded={loadEvents}
            gmailConnection={gmailConnection}
            trigger={
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            }
          />
        </div>

        {/* Google Calendar Connection - show at top if not connected */}
        {!gmailConnection && (
          <div className="mb-6 max-w-md mx-auto">
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-semibold mb-2 text-base">Connect Google Calendar</h3>
                  <p className="text-base text-muted-foreground mb-4">
                    Sync your events with Google Calendar to access them everywhere.
                  </p>
                  <Button onClick={connectGoogleCalendar} disabled={connecting} className="w-full text-base">
                    {connecting ? 'Connecting...' : 'Connect Google Calendar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Mobile: Single Calendar with Events - below md breakpoint */}
        <div className="block md:hidden w-full">
          <InteractiveCalendar
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            events={events}
            onAddEvent={() => {
              toast({
                title: "Add Event",
                description: "Event creation coming soon!"
              });
            }}
            showEvents={true}
          />
        </div>

        {/* Tablet & Desktop: Two Card Layout - md breakpoint and above (768px+) */}
        <div className="hidden md:flex gap-4 lg:gap-6 w-full">
          {/* Calendar Card - 60% width on tablet and desktop */}
          <div className="w-[60%]">
            <InteractiveCalendar
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              events={events}
              onAddEvent={() => {
                // This will be handled by the AddEventDialog component
              }}
              showEvents={false} // Hide events on tablet and desktop - shown separately
            />
          </div>

          {/* Events Card - fills remaining space to screen edge */}
          <div className="flex-1">
            <EventsList
              selectedDate={selectedDate}
              events={events}
              loading={loading}
              onEditEvent={handleEditEvent}
              onDeleteEvent={handleDeleteEvent}
              onAddEvent={() => {
                // This will be handled by the AddEventDialog component
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;