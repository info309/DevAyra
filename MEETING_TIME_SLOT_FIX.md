# Meeting Time Slot Scheduling Fix

## Problem
When users selected a specific time slot (e.g., "1:00 PM") from the available time slots, the meeting was always being scheduled at 5:00 PM instead of the selected time. This was a timezone handling issue.

## Root Cause
1. **Frontend Issue**: When a user clicked on a time slot button, the frontend was converting the ISO timestamp to a localized string like `"Schedule for October 22, 2025, 1:00 PM"` using `toLocaleDateString()` and `toLocaleTimeString()`.
   
2. **Backend Issue**: The backend's `parseSpecificTime()` function only had patterns to match:
   - "tomorrow at 2:30pm"
   - "today at 2:30pm"
   
   It did NOT have a pattern to match the full date format like `"Schedule for October 22, 2025, 1:00 PM"`.

3. **Result**: The message fell through to the chrono parser which wasn't handling the timezone correctly, or the fallback was creating a default time (like 2pm or 5pm).

## Solution

### Frontend Change (src/pages/Assistant.tsx)
**Line 565**: Changed the time slot button to send the ISO timestamp directly instead of converting it to a localized string:

**Before:**
```typescript
const fullText = `Schedule for ${dateStr}, ${timeStr}`;
```

**After:**
```typescript
// Send ISO timestamp to preserve timezone information
const fullText = `Schedule meeting at ${slot.start}`;
```

This preserves the exact time from the availability check, including timezone information.

### Backend Changes (supabase/functions/assistant/index.ts)

#### 1. Added ISO Timestamp Pattern (Lines 1096-1111)
Added support for ISO timestamp format at the beginning of `parseSpecificTime()`:

```typescript
// Match ISO timestamp format: "Schedule meeting at 2025-10-22T13:00:00.000Z"
const isoMatch = when_text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
if (isoMatch) {
  const isoTimestamp = isoMatch[1];
  console.log(`📝 Matched ISO timestamp: ${isoTimestamp}`);
  
  const start = new Date(isoTimestamp);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);
  
  console.log(`✅ Parsed ISO timestamp as ${start.toISOString()}`);
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}
```

#### 2. Added Full Date Format Pattern (Lines 1180-1235)
Also added support for the old localized string format as a fallback:

```typescript
// Match patterns like "Schedule for October 22, 2025, 1:00 PM"
const scheduleMatch = text.match(/schedule\s+for\s+(\w+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
```

This parses the month name, day, year, hour, minutes, and AM/PM, then creates a properly timezone-adjusted ISO timestamp.

## Flow After Fix

1. User requests to schedule a meeting → AI shows available time slots
2. User clicks "1:00 PM - 2:00 PM" button
3. Frontend sends: `"Schedule meeting at 2025-10-22T13:00:00.000Z"` (exact ISO timestamp from the slot)
4. Backend's `parseSpecificTime()` matches the ISO timestamp pattern
5. Backend uses the exact time (1:00 PM in the user's timezone)
6. Meeting is created at the correct time

## Testing
To test this fix:
1. Ask the AI to schedule a meeting: "Can I schedule a meeting with test@example.com in two days?"
2. Select "virtual" when asked about meeting type
3. Click on any time slot (e.g., "3:00 PM - 4:00 PM")
4. Verify the meeting is created at exactly 3:00 PM, not at a different time

## Files Modified
- `src/pages/Assistant.tsx` (line 565)
- `supabase/functions/assistant/index.ts` (lines 1096-1111, 1180-1235)

