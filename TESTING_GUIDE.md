# Testing Guide for Meeting Scheduling Fixes

## ⏰ Important: Edge Function Propagation

The assistant function was just deployed. **Wait 2-3 minutes** before testing to allow the changes to propagate across Supabase's edge network.

## ✅ What Was Fixed

1. **UI now displays Google Meet links** in the meeting card
2. **Assistant prompt updated** to always check availability
3. **Meeting platform** explicitly set to trigger Meet link generation

## 🧪 Test Plan

### Test 1: Available Time Slots (WAIT 2-3 MINUTES FIRST!)

1. **Start a new conversation** in the Assistant
2. **Type:** "Can I schedule a meeting with test@example.com tomorrow?"
3. **Expected Response:** "Would you like this to be a virtual or physical meeting?"
4. **Type:** "virtual"
5. **Expected Behavior:**
   - ✅ Assistant should call `calendar_check_availability`
   - ✅ You should see a blue card with "Available Time Slots"
   - ✅ Card should have clickable time buttons (12:00 PM, 12:30 PM, 1:00 PM, etc.)
   
**If you DON'T see the buttons:**
- Wait another 2 minutes for function propagation
- OR check browser console for errors
- OR try: "What time slots are available tomorrow?"

### Test 2: Google Meet Link Creation

1. **Click one of the time slot buttons** (or type a time like "2pm")
2. **Wait for meeting creation**
3. **Expected Result:**
   - ✅ Green card showing "Meeting Prepared"
   - ✅ Blue section with "🔗 Google Meet Link"
   - ✅ Clickable link: `https://meet.google.com/xxx-xxxx-xxx`
   - ✅ Green text says "Google Meet link created"

**If you DON'T see the Meet link:**
- Check if your Google account has Calendar API access
- Check if Gmail connection is active
- Look at browser console for errors

## 🔍 Debugging

### Check Edge Function Status

1. Go to: https://supabase.com/dashboard/project/lmkpmnndrygjatnipfgd/functions
2. Find "assistant" function
3. Check "Last deployed" time - should be within last 5 minutes

### Check Console Logs

Look for these in the browser console:

**✅ Good signs:**
```
Processing calendar_check_availability tool result
Available Time Slots
Processing calendar_create_event tool result
Event data: {...meeting_link: "https://meet.google.com/..."}
```

**❌ Bad signs:**
```
Processing emails_search tool result  ← Wrong tool!
No meeting_link in event data
Authentication error
```

### Check Meeting in Database

1. Go to Supabase dashboard
2. Table editor → `calendar_events`
3. Find your test meeting
4. Should have `start_time`, `end_time`, and other details

### Check Meeting in Meetings Table

1. Table editor → `meetings`
2. Should have `meeting_link` column populated with Google Meet URL
3. Should have `meeting_type: 'virtual'` and `meeting_platform: 'google_meet'`

## 🐛 Common Issues

### Issue: Still seeing old behavior (no slots shown)

**Solution:**
1. Wait 2-3 minutes after deployment
2. Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
3. Start a NEW conversation (don't continue an old one)
4. Clear conversation history and try again

### Issue: Slots shown but no Meet link

**Possible causes:**
- Google Calendar API not responding
- Gmail connection inactive
- Missing `SUPABASE_ANON_KEY` in Edge Function env vars

**Check:**
1. Go to: https://supabase.com/dashboard/project/lmkpmnndrygjatnipfgd/settings/functions
2. Verify `SUPABASE_ANON_KEY` is set
3. Check browser console for API errors

### Issue: "Authentication error" in console

**Solution:**
1. Go to: https://supabase.com/dashboard/project/lmkpmnndrygjatnipfgd/settings/functions
2. Add environment variable: `SUPABASE_ANON_KEY`
3. Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA`

## 📊 Success Criteria

After following Test 1 and Test 2, you should see:

1. ✅ Blue card with clickable time slot buttons
2. ✅ Green meeting card with:
   - Meeting title
   - Date/time
   - Guest email
   - **Blue box with Google Meet link**
   - "Send Invitation Message" button
3. ✅ No errors in console
4. ✅ Meeting appears in Calendar page

## ⏱️ Timeline

- **T+0min:** Function deployed
- **T+1min:** Function propagating...
- **T+2min:** **START TESTING NOW**
- **T+3min:** Function should be fully live

## 🆘 If Nothing Works

1. **Check function deployment:**
   ```bash
   cd /Users/meir.horwitz/Documents/ayra-unified-suite-main
   npx supabase functions deploy assistant --no-verify-jwt
   ```

2. **Check frontend build:**
   - If running dev server, no rebuild needed
   - Changes to Assistant.tsx are hot-reloaded

3. **Share these details:**
   - Browser console logs (especially errors)
   - Screenshot of what you're seeing
   - What the assistant responds with
   - Timestamp of when you tested

## 💡 Quick Test (30 seconds)

Want to test right now? Try this:

1. Ask: "What's the weather?" (any normal question)
2. Wait for response
3. Then ask: "Can I schedule a meeting tomorrow?"
4. If it asks "virtual or physical?" → **Function is live! ✅**
5. If it immediately schedules → **Wait 2 more minutes**


