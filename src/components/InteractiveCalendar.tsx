import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isSameMonth, isToday, startOfWeek, endOfWeek, startOfDay, differenceInDays } from 'date-fns';

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

  // Calculate spanning events for display
  const getSpanningEvents = () => {
    const spanningEvents: Array<{
      event: CalendarEvent;
      startCol: number;
      span: number;
      row: number;
      level: number;
    }> = [];

    // Group calendar days into weeks (rows)
    const weeks: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }

    events.forEach(event => {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      const daysDiff = differenceInDays(eventEnd, eventStart);
      
      if (daysDiff > 0) { // Multi-day event
        weeks.forEach((week, weekIndex) => {
          const weekStart = week[0];
          const weekEnd = week[6];
          
          // Check if event overlaps with this week
          if (eventStart <= weekEnd && eventEnd >= weekStart) {
            // Calculate start position in this week
            let startCol = 0;
            if (eventStart >= weekStart) {
              startCol = week.findIndex(day => isSameDay(day, eventStart));
            }
            
            // Calculate span within this week
            let endCol = 6;
            if (eventEnd <= weekEnd) {
              endCol = week.findIndex(day => isSameDay(day, eventEnd));
            }
            
            if (startCol !== -1) {
              spanningEvents.push({
                event,
                startCol,
                span: endCol - startCol + 1,
                row: weekIndex,
                level: 0 // Will be calculated for proper stacking
              });
            }
          }
        });
      }
    });

    // Calculate levels to prevent overlapping
    spanningEvents.forEach((spanEvent, index) => {
      let level = 0;
      spanningEvents.slice(0, index).forEach(prevEvent => {
        if (prevEvent.row === spanEvent.row && 
            prevEvent.startCol < spanEvent.startCol + spanEvent.span &&
            prevEvent.startCol + prevEvent.span > spanEvent.startCol) {
          level = Math.max(level, prevEvent.level + 1);
        }
      });
      spanEvent.level = level;
    });

    return spanningEvents;
  };

  const spanningEvents = getSpanningEvents();

  // Handle date click
  const handleDateClick = (date: Date) => {
    onDateSelect(date);
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

  // Get single-day events for a specific date (non-spanning events)
  const getSingleDayEvents = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      const daysDiff = differenceInDays(eventEnd, eventStart);
      return daysDiff === 0 && isSameDay(eventStart, date);
    });
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
        <div className="relative">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {weekdays.map(day => (
              <div key={day} className="h-8 sm:h-10 flex items-center justify-center text-base font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days with spanning events */}
          <div className="relative">
            {/* Render calendar in weeks */}
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => {
              const weekDays = calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7);
              const weekSpanningEvents = spanningEvents.filter(se => se.row === weekIndex);
              
              return (
                <div key={weekIndex} className="relative">
                  {/* Week row of days */}
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
                    {weekDays.map((date, dayIndex) => {
                      const isSelected = isSameDay(date, selectedDate);
                      const isCurrentMonth = isSameMonth(date, currentMonth);
                      const isCurrentDay = isToday(date);
                      const singleDayEvents = getSingleDayEvents(date);
                      const hasEvents = singleDayEvents.length > 0;
                      const isHovered = hoveredDate && isSameDay(date, hoveredDate);
                      
                      // Check if this date has spanning events going through it
                      const hasSpanningEvents = weekSpanningEvents.some(spanEvent => 
                        dayIndex >= spanEvent.startCol && dayIndex < spanEvent.startCol + spanEvent.span
                      );
                      
                      return (
                        <div
                          key={dayIndex}
                          className={`
                            relative h-12 w-full sm:h-16 sm:w-full aspect-square flex items-center justify-center text-base cursor-pointer rounded-md transition-all duration-200
                            ${isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50'}
                          `}
                          onClick={() => handleDateClick(date)}
                          onMouseEnter={() => setHoveredDate(date)}
                          onMouseLeave={() => setHoveredDate(null)}
                        >
                          {/* Date number - always centered */}
                          <span className={`text-base relative z-20 ${
                            isCurrentDay ? 'w-8 h-8 flex items-center justify-center rounded-full bg-red-500 text-white font-semibold' :
                            isSelected ? 'w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold' :
                            hasSpanningEvents ? 'text-white font-semibold' : ''
                          }`}>
                            {format(date, 'd')}
                          </span>
                          
                          {/* Single-day event indicators - positioned absolutely at bottom */}
                          {hasEvents && (
                            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5 sm:gap-1 z-20">
                              {singleDayEvents.slice(0, 2).map((event, eventIndex) => (
                                <div
                                  key={eventIndex}
                                  className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${
                                    event.is_synced ? 'bg-blue-500' : 'bg-green-500'
                                  }`}
                                  title={event.title}
                                />
                              ))}
                              {singleDayEvents.length > 2 && (
                                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-muted-foreground" title={`+${singleDayEvents.length - 2} more`} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Spanning event bars overlaid in the middle of cells */}
                  {weekSpanningEvents.map((spanEvent, eventIndex) => (
                    <div
                      key={`${spanEvent.event.id}-${weekIndex}-${eventIndex}`}
                      className={`absolute rounded ${
                        spanEvent.event.is_synced ? 'bg-blue-500/80' : 'bg-green-500/80'
                      }`}
                      style={{
                        left: `calc(${(spanEvent.startCol / 7) * 100}% + ${spanEvent.startCol * 2}px)`,
                        width: `calc(${(spanEvent.span / 7) * 100}% - ${(spanEvent.span - 1) * 2}px)`,
                        top: `50%`,
                        transform: 'translateY(-50%)',
                        height: '18px',
                        zIndex: 10,
                        marginTop: `${spanEvent.level * 20}px`
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Selected date info - only show if showEvents is true */}
        {showEvents && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-base font-medium">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h4>
            
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