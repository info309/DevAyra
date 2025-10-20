# 🔍 Debug Guide: Why Google Meet Links Aren't Being Created

## Quick Checklist

After waiting 2-3 minutes for deployment and creating a test meeting:

### ✅ Check Browser Console

Look for these specific console logs (in order):

#### 1. Meeting Type Received
```
💾 Saving to meetings table with meeting_link: [should show URL or null]
```

#### 2. Calendar API Call
```
📅 Calling calendar-api with JWT token...
```

#### 3. Calendar API Response
```
📅 Calendar API Response: {...}
```

#### 4. Conference Data Check
```
🔗 Conference data found: {...}
```
**OR**
```
❌ No conference data in calendar event response
```

#### 5. Meet Link Extraction
```
✅ Google Meet link generated: https://meet.google.com/xxx-xxxx-xxx
```
**OR**
```
❌ No video entry point found in conference data
```

#### 6. Return Value
```
✅ Returning result with meetingLink: https://meet.google.com/...
```
**OR**
```
⚠️ Virtual meeting but no meetingLink generated
```

## 🐛 Debugging Scenarios

### Scenario 1: "No conference data in calendar event response"

**This means:** Google Calendar API responded but didn't include conferenceData.

**Possible causes:**
1. `conferenceDataVersion=1` parameter not being sent
2. Calendar API doesn't have permission to create Meet links
3. Gmail scopes don't include Calendar

**Fix:**
Check the calendar-api function - it should be called with `?conferenceDataVersion=1` query parameter.

**In console, look for:**
```
Calling calendar-api with JWT token...
```
And verify the URL ends with `?conferenceDataVersion=1`

### Scenario 2: "No video entry point found in conference data"

**This means:** Conference data exists but has no video link.

**This is weird** - usually means Google API returned partial data.

**Fix:** Check the full Calendar API response in console for structure.

### Scenario 3: No calendar API call at all

**This means:** The `if (gmailConnection)` check is failing.

**Possible causes:**
1. No active Gmail connection
2. `userToken` not being passed
3. Gmail connection query failing

**Fix:** Check these console logs:
```
📅 Fetching LIVE events from Google Calendar API...
✅ Found X LIVE Google Calendar events
```

If you DON'T see these, the Gmail connection check is failing.

### Scenario 4: "⚠️ Virtual meeting but no meetingLink generated"

**This means:** Everything ran but no Meet link was created.

**Most likely cause:** Calendar API call failed silently.

**Fix:** Look for error logs just before this warning:
```
❌ Google Calendar creation failed: [error details]
```

## 🔬 Detailed Diagnostic Steps

### Step 1: Verify Gmail Connection

Run this in Supabase SQL Editor:

```sql
SELECT 
  id,
  email_address,
  is_active,
  created_at
FROM public.gmail_connections
WHERE user_id = '88dd8031-ccb2-4611-8a8f-0f1c239a4b9a'
ORDER BY created_at DESC;
```

**Expected:** At least 1 row with `is_active = true`

### Step 2: Check Calendar API Function

```bash
cd /Users/meir.horwitz/Documents/ayra-unified-suite-main
npx supabase functions list
```

**Expected:** `calendar-api` should be in the list

If it's not there, the Google Meet link creation will fail silently.

### Step 3: Test Calendar API Directly

In browser console (while logged in):

```javascript
const session = await supabase.auth.getSession();
const token = session.data.session?.access_token;

const response = await fetch(
  'https://lmkpmnndrygjatnipfgd.supabase.co/functions/v1/calendar-api?conferenceDataVersion=1',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create',
      event: {
        summary: 'Test Meeting',
        start: { dateTime: '2025-10-20T14:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2025-10-20T15:00:00Z', timeZone: 'UTC' },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }
    })
  }
);

const data = await response.json();
console.log('Calendar API test result:', data);
```

**Look for:** `data.event.conferenceData.entryPoints[0].uri` should be a Meet link.

### Step 4: Check Auto-Fix Code

In your console logs, you're seeing:

```
🔄 Backend auto-fixed: emails_compose_draft → calendar_create_event
```

This means the AI is STILL calling `emails_compose_draft` instead of the correct tool!

**This is the MAIN problem!** The assistant deployment hasn't propagated yet.

## 🎯 The Real Issue

Based on your console logs showing `emails_compose_draft` being auto-fixed, the assistant is **still using the OLD code**. The new prompt that forces `calendar_check_availability` hasn't taken effect yet.

### Solution: Wait for Propagation

The assistant function was just deployed. You need to:

1. ⏰ **Wait 2-3 minutes** from the deployment time
2. 🔄 **Hard refresh** the browser
3. 🆕 **Start a BRAND NEW conversation**
4. 📝 **Ask the test question again**

### How to Know It's Working

**OLD behavior (auto-fix still happening):**
```
Processing emails_compose_draft tool result
🔄 Backend auto-fixed: emails_compose_draft → calendar_create_event
```

**NEW behavior (correct tool used):**
```
Processing calendar_check_availability tool result
Available Time Slots
[buttons appear]
```

## ⏱️ Timeline

- **T+0:** Function deployed (just now)
- **T+1-2min:** Function propagating across edge network...
- **T+3min:** ✅ **TEST NOW** - should see correct behavior

## 🆘 If Still Not Working After 5 Minutes

1. **Redeploy the function:**
   ```bash
   cd /Users/meir.horwitz/Documents/ayra-unified-suite-main
   npx supabase functions deploy assistant --no-verify-jwt
   ```

2. **Check function logs:**
   - Go to: https://supabase.com/dashboard/project/lmkpmnndrygjatnipfgd/functions
   - Click "assistant"
   - Click "Logs"
   - Look for the console.log messages

3. **Share these with me:**
   - Complete browser console output
   - Supabase function logs
   - What the assistant responded

## 💡 Quick Status Check

Want to know if the new code is live? Ask:

**"What's the weather?"**

Then check console - if you see **any** availability-related logs without asking about meetings, the old code is still running.

**OR** just ask:

**"Can I schedule a meeting?"**

- ✅ If it asks "virtual or physical?" → **NEW CODE IS LIVE**
- ❌ If it immediately creates meeting → **STILL OLD CODE**

---

**Bottom line:** The fixes are deployed. Wait 2-3 minutes, hard refresh, and test in a NEW conversation!


