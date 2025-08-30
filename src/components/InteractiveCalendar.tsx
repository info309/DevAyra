import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isSameMonth, isToday, startOfWeek, endOfWeek, startOfDay } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  is_synced: boolean;
}

interface InteractiveCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  events: CalendarEvent[];
  onAddEvent?: () => void;
  className?: string;
  showEvents?: boolean; // New prop to control events display
}

export const InteractiveCalendar: React.FC<InteractiveCalendarProps> = ({
  selectedDate,
  onDateSelect,
  currentMonth,
  onMonthChange,
  events,
  onAddEvent,
  className = "",
  showEvents = true // Default to true for backward compatibility
}) => {
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  // Get all days in the current month view (including partial weeks)
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start on Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });

  // Get events for a specific date - including multi-day events that span this date
  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      const targetDate = startOfDay(date);
      
      // Check if the date falls within the event's date range (inclusive)
      return targetDate >= startOfDay(eventStart) && targetDate <= startOfDay(eventEnd);
    });
  };

  // Handle month navigation
  const handlePrevMonth = () => {
    const newMonth = subMonths(currentMonth, 1);
    onMonthChange(newMonth);
  };

  const handleNextMonth = () => {
    const newMonth = addMonths(currentMonth, 1);
    onMonthChange(newMonth);
  };

  // Handle date click
  const handleDateClick = (date: Date) => {
    onDateSelect(date);
  };

  // Weekday headers
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Card className={`w-full max-w-none bg-card ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handlePrevMonth}
            className="h-8 w-8 p-0 hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <h3 className="text-xl font-semibold leading-none tracking-tight">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleNextMonth}
            className="h-8 w-8 p-0 hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-0">
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {/* Weekday headers */}
          {weekdays.map(day => (
            <div key={day} className="h-8 sm:h-10 flex items-center justify-center text-base font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {calendarDays.map((date, index) => {
            const isSelected = isSameDay(date, selectedDate);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isCurrentDay = isToday(date);
            const dayEvents = getEventsForDate(date);
            const hasEvents = dayEvents.length > 0;
            const isHovered = hoveredDate && isSameDay(date, hoveredDate);
            
            return (
              <div
                key={index}
                className={`
                  relative h-12 w-full sm:h-16 sm:w-full aspect-square flex flex-col items-center justify-center text-base cursor-pointer rounded-md border transition-all duration-200
                  ${isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50'}
                  ${isSelected ? 'border-transparent' : 'border-transparent hover:bg-accent hover:text-accent-foreground'}
                  ${isHovered ? 'ring-2 ring-primary/50' : ''}
                `}
                onClick={() => handleDateClick(date)}
                onMouseEnter={() => setHoveredDate(date)}
                onMouseLeave={() => setHoveredDate(null)}
              >
                <span className={`text-base ${
                  isSelected ? 'w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold' :
                  isCurrentDay ? 'w-8 h-8 flex items-center justify-center rounded-full bg-red-500 text-white font-semibold' : ''
                }`}>
                  {format(date, 'd')}
                </span>
                
                {/* Event indicators */}
                {hasEvents && (
                  <div className="flex gap-0.5 sm:gap-1 mt-0.5">
                    {dayEvents.slice(0, 2).map((event, eventIndex) => (
                      <div
                        key={eventIndex}
                        className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${
                          event.is_synced ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                        title={event.title}
                      />
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-muted-foreground" title={`+${dayEvents.length - 2} more`} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Selected date info - only show if showEvents is true */}
        {showEvents && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-medium">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h4>
              {onAddEvent && (
                <Button size="sm" variant="outline" onClick={onAddEvent} className="text-base">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
            </div>
            
            {/* Events for selected date */}
            <div className="space-y-2 max-h-32 sm:max-h-40 overflow-y-auto">
              {getEventsForDate(selectedDate).length === 0 ? (
                <p className="text-base text-muted-foreground">No events scheduled</p>
              ) : (
                getEventsForDate(selectedDate).map(event => (
                  <div key={event.id} className="flex items-start justify-between p-2 sm:p-3 bg-accent/50 rounded text-base">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{event.title}</p>
                      <div className="flex items-center gap-1 text-muted-foreground mt-1 text-base">
                        <Clock className="h-4 w-4" />
                        <span>
                          {event.all_day ? 'All day' : format(new Date(event.start_time), 'h:mm a')}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-base ml-2">
                      {event.is_synced ? 'Synced' : 'Local'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};