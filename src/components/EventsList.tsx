import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Plus, Clock, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { format, isSameDay, differenceInDays, startOfDay } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  is_synced: boolean;
}

interface EventsListProps {
  selectedDate: Date;
  events: CalendarEvent[];
  onAddEvent?: () => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (event: CalendarEvent) => void;
  loading?: boolean;
  className?: string;
}

export const EventsList: React.FC<EventsListProps> = ({
  selectedDate,
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  loading = false,
  className = ""
}) => {
  // Get events for selected date
  const selectedDateEvents = events.filter(event => {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);
    const selectedDay = startOfDay(selectedDate);
    
    // Check if the selected date falls within the event's date range (inclusive)
    return selectedDay >= startOfDay(eventStart) && selectedDay <= startOfDay(eventEnd);
  });

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

  return (
    <Card className={`w-full ${className}`}>
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
            <p className="text-base text-muted-foreground mt-2">Loading events...</p>
          </div>
        ) : selectedDateEvents.length === 0 ? (
          <div className="text-center py-8">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground text-base">No events scheduled for this day</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedDateEvents.map(event => (
              <div key={event.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-base">{event.title}</h4>
                    {event.description && (
                      <p className="text-base text-muted-foreground mt-1">
                        {event.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-base text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatEventTime(event, selectedDate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    {differenceInDays(new Date(event.end_time), new Date(event.start_time)) > 0 && (
                      <Badge variant="outline" className="text-base">
                        {format(new Date(event.start_time), 'MMM d')} - {format(new Date(event.end_time), 'MMM d')}
                      </Badge>
                    )}
                    
                    {/* Event Actions */}
                    {(onEditEvent || onDeleteEvent) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background border shadow-md">
                          {onEditEvent && (
                            <DropdownMenuItem onClick={() => onEditEvent(event)} className="hover:bg-accent">
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onDeleteEvent && (
                            <DropdownMenuItem 
                              onClick={() => onDeleteEvent(event)} 
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};