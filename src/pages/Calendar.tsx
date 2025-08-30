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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { useIsDrawerView } from '@/hooks/use-drawer-view';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  reminder_minutes?: number;
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
      loadEvents();
      checkGmailConnection();
    }
  }, [user, currentMonth]);

  const loadEvents = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      // Get events for the current month
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
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
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        method: 'GET',
        body: { 
          userId: user.id,
          includeCalendar: true 
        }
      });

      if (error) throw error;

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

  // Get events for selected date
  const selectedDateEvents = events.filter(event => 
    isSameDay(new Date(event.start_time), selectedDate)
  );

  // Get all days with events for the calendar view
  const eventDates = events.map(event => new Date(event.start_time));

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
                              {event.all_day ? 'All day' : 
                                `${format(new Date(event.start_time), 'h:mm a')} - ${format(new Date(event.end_time), 'h:mm a')}`
                              }
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {gmailConnection ? 'Synced' : 'Local'}
                        </Badge>
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
      <div className="container mx-auto px-6 py-8">
        {/* Desktop Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <Card>
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
                          <Badge variant="secondary" className="text-xs">
                            {gmailConnection ? 'Synced' : 'Local'}
                          </Badge>
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {event.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {event.all_day ? 'All day' : 
                            `${format(new Date(event.start_time), 'h:mm a')}`
                          }
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