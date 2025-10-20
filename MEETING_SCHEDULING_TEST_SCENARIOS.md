# Meeting Scheduling - Test Scenarios

## ✅ Test Checklist

### Scenario 1: Basic Virtual Meeting (Happy Path)
**Purpose**: Verify the complete virtual meeting flow with Google Meet link generation

**Steps**:
1. Say: `"Can I schedule a meeting with john@example.com tomorrow?"`
2. AI asks: "Would you like this to be a virtual or physical meeting?"
3. Reply: `"virtual"`
4. AI shows available time slots
5. Click on **any time slot** (e.g., "2:00 PM - 3:00 PM")
6. Chat should display just: `"2:00 PM"`

**Expected Results**:
- ✅ Meeting created at **exactly 2:00 PM** (not 5:00 PM or any other time)
- ✅ "Meeting Prepared" card appears with:
  - Title: Meeting
  - Correct date and time
  - Guest: john@example.com
  - **Google Meet logo and "Join Meeting" link**
- ✅ Only **ONE** meeting created (no duplicates)
- ✅ Meeting appears in your Google Calendar with Meet link

---

### Scenario 2: Physical Meeting
**Purpose**: Verify physical meeting flow (no Google Meet link)

**Steps**:
1. Say: `"Schedule a meeting with sarah@example.com in 3 days"`
2. Reply: `"physical"`
3. Select a time slot
4. Verify meeting creation

**Expected Results**:
- ✅ Meeting created at selected time
- ✅ No Google Meet link shown
- ✅ Location field would be empty (or could add location in future)
- ✅ Meeting appears in calendar without Meet link

---

### Scenario 3: Multiple Time Slot Options
**Purpose**: Verify different time slots work correctly

**Steps**:
1. Schedule a meeting for tomorrow, virtual
2. Try clicking different time slots:
   - **12:00 PM** → Should schedule at 12:00 PM
   - **3:30 PM** → Should schedule at 3:30 PM
   - **7:00 PM** → Should schedule at 7:00 PM

**Expected Results**:
- ✅ Each time slot schedules at the **exact time clicked**
- ✅ All times show correctly in both chat and calendar
- ✅ Timezone is handled correctly (Asia/Jerusalem in your case)

---

### Scenario 4: Meeting in Several Days
**Purpose**: Verify date calculation works for future dates

**Steps**:
1. Say: `"Can I schedule a meeting with alex@example.com in 5 days?"`
2. Select "virtual"
3. Pick any time slot
4. Verify the date is **exactly 5 days from today**

**Expected Results**:
- ✅ Meeting scheduled on the correct date (5 days from today)
- ✅ Time is correct
- ✅ Google Meet link included

---

### Scenario 5: Same-Day Meeting
**Purpose**: Verify urgent meeting scheduling

**Steps**:
1. Say: `"I need to schedule a meeting with urgent@example.com today at 4pm"`
2. AI should show availability for today
3. Select the 4:00 PM slot

**Expected Results**:
- ✅ Meeting scheduled for **today** at 4:00 PM
- ✅ No date confusion
- ✅ Google Meet link works

---

### Scenario 6: Multiple Guests
**Purpose**: Verify meetings with multiple attendees

**Steps**:
1. Say: `"Schedule a virtual meeting with john@example.com and sarah@example.com tomorrow"`
2. Select a time slot

**Expected Results**:
- ✅ Both guests added to the meeting
- ✅ Both receive calendar invitations
- ✅ Google Meet link shared with all attendees

---

### Scenario 7: Specific Day of Week
**Purpose**: Verify natural language date parsing

**Steps**:
1. Say: `"Can I schedule a meeting next Monday?"`
2. Select virtual
3. Pick a time

**Expected Results**:
- ✅ Meeting scheduled on **next Monday** (not this Monday if today is Monday)
- ✅ Correct date displayed
- ✅ Time correct

---

### Scenario 8: Morning vs Evening Slots
**Purpose**: Verify AM/PM handling

**Steps**:
1. Schedule meeting for tomorrow
2. Test both:
   - Morning slot (e.g., 9:00 AM)
   - Evening slot (e.g., 8:00 PM)

**Expected Results**:
- ✅ 9:00 AM schedules in the morning (not 9:00 PM)
- ✅ 8:00 PM schedules in the evening (not 8:00 AM)
- ✅ No AM/PM confusion

---

### Scenario 9: Busy Time Slots (Conflict Detection)
**Purpose**: Verify you don't see slots when you're busy

**Steps**:
1. Create a meeting in Google Calendar manually for tomorrow 2-3 PM
2. Ask AI to schedule a meeting tomorrow
3. Check available slots

**Expected Results**:
- ✅ 2:00 PM - 3:00 PM slot should **NOT** appear
- ✅ Slots before and after 2-3 PM are available
- ✅ No double-booking

---

### Scenario 10: Cancel/Disable Time Slot Buttons
**Purpose**: Verify no duplicate submissions

**Steps**:
1. Schedule a meeting
2. While AI is processing, try to click another time slot quickly

**Expected Results**:
- ✅ Buttons are **disabled** while loading
- ✅ Cannot create duplicate meetings by double-clicking
- ✅ Only one meeting created

---

### Scenario 11: Send Invitation Email
**Purpose**: Verify the full flow including email notification

**Steps**:
1. Schedule a virtual meeting
2. Click "Send Invitation Message" button
3. Verify it opens the email composer
4. Check email content includes:
   - Meeting details
   - Google Meet link
   - Date and time

**Expected Results**:
- ✅ Email composer opens with pre-filled content
- ✅ Google Meet link is in the email body
- ✅ Recipient is pre-filled
- ✅ Subject line is appropriate

---

### Scenario 12: Different Time Zones (Edge Case)
**Purpose**: Verify timezone handling for international meetings

**Steps**:
1. Your timezone: Asia/Jerusalem (UTC+2/+3)
2. Schedule meeting for 2:00 PM your time
3. Check Google Calendar

**Expected Results**:
- ✅ Meeting shows at 2:00 PM **in your timezone**
- ✅ Google Calendar adjusts for guests in other timezones
- ✅ No time confusion

---

## 🔍 Things to Watch For (Red Flags)

### ❌ Issues to Report Immediately:
1. **Wrong Time**: Meeting scheduled at different time than selected
2. **Missing Google Meet Link**: Virtual meetings without Meet link
3. **Duplicates**: Multiple identical meetings created
4. **Date Issues**: Meeting on wrong date
5. **Timezone Problems**: Times off by several hours
6. **No Time Slots**: Available slots list is empty when you're free
7. **Crashed/Errors**: Any error messages or failures

---

## 📊 Quick Smoke Test (5 minutes)

If you just want to do a quick test:

1. ✅ **Test 1**: Schedule virtual meeting tomorrow at 2 PM
   - Verify time is exactly 2:00 PM
   - Verify Google Meet link appears
   
2. ✅ **Test 2**: Schedule physical meeting in 3 days at 10 AM
   - Verify no Google Meet link
   - Verify correct date
   
3. ✅ **Test 3**: Check your Google Calendar
   - Verify both meetings appear
   - Verify times are correct

---

## 🐛 Known Limitations (Expected Behavior)

1. **Title**: All meetings default to "Meeting" (can be customized later)
2. **Duration**: All slots are 1 hour by default
3. **Working Hours**: Time slots only show 9 AM - 8 PM
4. **No Location**: Physical meetings don't have location field yet

---

## 📝 Testing Checklist Template

Use this for each test:

```
[ ] Chat displays clean time (e.g., "2:00 PM")
[ ] Meeting created at correct time
[ ] Correct date
[ ] Only one meeting (no duplicates)
[ ] Google Meet link present (virtual meetings)
[ ] No Google Meet link (physical meetings)
[ ] Meeting in Google Calendar
[ ] Can click "Send Invitation Message"
```

---

## 🎯 Success Criteria

The system is working correctly if:
- ✅ 10/12 scenarios pass
- ✅ No critical red flags
- ✅ Google Meet links always created for virtual meetings
- ✅ Times are always accurate
- ✅ No duplicates

---

## 📞 Need Help?

If you encounter any issues:
1. Note which scenario failed
2. Copy the exact error message or behavior
3. Check browser console for any errors
4. Share the Supabase function logs if needed

