import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar as CalendarIcon,
  Plus,
  ArrowLeft,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay, differenceInDays, addDays } from 'date-fns';
import { useIsDrawerView } from '@/hooks/use-drawer-view';

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

  // Load events and check Gmail connection
  useEffect(() => {
    if (user) {
      checkGmailConnection();
    }
  }, [user]);

  // Load events when connection status or month changes
  useEffect(() => {
    if (user && gmailConnection !== null) { // Wait for connection check to complete
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
            // Fall back to local events if Google Calendar fails
          } else if (googleEvents?.events) {
            console.log('Received Google Calendar events:', googleEvents.events.length);
            // Convert Google Calendar events to our format
            const convertedEvents: CalendarEvent[] = googleEvents.events.map((event: any) => ({
              id: event.id,
              title: event.summary || 'Untitled Event',
              description: event.description || '',
              start_time: event.start?.dateTime || event.start?.date,
              end_time: event.end?.dateTime || event.end?.date,
              all_day: !!event.start?.date, // All day if date is used instead of dateTime
              reminder_minutes: event.reminders?.overrides?.[0]?.minutes || null,
              external_id: event.id,
              calendar_id: 'primary',
              is_synced: true,
              user_id: user.id,
              created_at: event.created || new Date().toISOString(),
              updated_at: event.updated || new Date().toISOString()
            }));
            
            setEvents(convertedEvents);
            return; // Don't load local events if we have Google events
          }
        } catch (googleError) {
          console.error('Error fetching Google Calendar events:', googleError);
          // Fall back to local events
        }
      } else {
        console.log('No Gmail connection found, loading local events only');
      }
      
      // Load local events (fallback or when not connected to Google Calendar)
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .order('start_time');

      if (error) throw error;
      
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: "Error",
        description: "Failed to load calendar events",
        variant: "destructive",
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
      const popup = window.open(
        data.authUrl,
        'google-calendar-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for messages from the popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setConnecting(false);
          checkGmailConnection();
          toast({
            title: "Success",
            description: "Google Calendar connected successfully!",
          });
        } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
          popup?.close();
          window.removeEventListener('message', handleMessage);
          setConnecting(false);
          toast({
            title: "Error",
            description: "Failed to connect Google Calendar",
            variant: "destructive",
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
        variant: "destructive",
      });
    }
  };

  // Get events for selected date - including multi-day events that span this date
  const selectedDateEvents = events.filter(event => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const selectedStart = startOfDay(selectedDate);
    const selectedEnd = endOfDay(selectedDate);
    
    // Check if the event overlaps with the selected date
    return isWithinInterval(selectedStart, { start: eventStart, end: eventEnd }) ||
           isWithinInterval(selectedEnd, { start: eventStart, end: eventEnd }) ||
           isWithinInterval(eventStart, { start: selectedStart, end: selectedEnd }) ||
           isWithinInterval(eventEnd, { start: selectedStart, end: selectedEnd });
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

  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  if (isDrawerView) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/dashboard')}
                className="p-2"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl font-bold">Calendar</h1>
            </div>
            
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Event
            </Button>
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
                  <Button 
                    onClick={connectGoogleCalendar}
                    disabled={connecting}
                    size="sm"
                  >
                    {connecting ? 'Connecting...' : 'Connect Google Calendar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calendar View */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={handlePrevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg">
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleNextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                modifiers={{
                  hasEvents: eventDates
                }}
                modifiersStyles={{
                  hasEvents: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }
                }}
                className="pointer-events-auto"
              />
            </CardContent>
          </Card>

          {/* Daily Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Events for {format(selectedDate, 'MMMM d, yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">Loading events...</p>
                </div>
              ) : selectedDateEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No events scheduled for this day</p>
                  <Button className="mt-4" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Event
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateEvents.map((event) => (
                    <div key={event.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{event.title}</h4>
                          {event.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {event.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatEventTime(event, selectedDate)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {getEventBadgeText(event)}
                          </Badge>
                          {differenceInDays(new Date(event.end_time), new Date(event.start_time)) > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {format(new Date(event.start_time), 'MMM d')} - {format(new Date(event.end_time), 'MMM d')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
            <Button
              variant="outline" 
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
            <h1 className="text-2xl font-bold">Calendar</h1>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </div>

        <div className="grid xl:grid-cols-4 lg:grid-cols-3 gap-6">
          {/* Calendar Section */}
          <div className="xl:col-span-3 lg:col-span-2">
            <Card className="h-fit">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={handlePrevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                  <Button variant="ghost" onClick={handleNextMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  modifiers={{
                    hasEvents: eventDates
                  }}
                  modifiersStyles={{
                    hasEvents: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }
                  }}
                  className="pointer-events-auto w-full scale-125 lg:scale-150 xl:scale-[1.75] 2xl:scale-[2] origin-top-left"
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Connection Status */}
            {!gmailConnection && (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <CalendarIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">Connect Google Calendar</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Sync your events with Google Calendar to access them everywhere.
                    </p>
                    <Button 
                      onClick={connectGoogleCalendar}
                      disabled={connecting}
                      className="w-full"
                    >
                      {connecting ? 'Connecting...' : 'Connect Google Calendar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  {format(selectedDate, 'MMM d')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    <p className="text-xs text-muted-foreground mt-2">Loading...</p>
                  </div>
                ) : selectedDateEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">No events</p>
                    <Button size="sm" className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateEvents.map((event) => (
                      <div key={event.id} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm">{event.title}</h4>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="text-xs">
                              {getEventBadgeText(event)}
                            </Badge>
                            {differenceInDays(new Date(event.end_time), new Date(event.start_time)) > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {format(new Date(event.start_time), 'MMM d')} - {format(new Date(event.end_time), 'MMM d')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {event.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatEventTime(event, selectedDate)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;