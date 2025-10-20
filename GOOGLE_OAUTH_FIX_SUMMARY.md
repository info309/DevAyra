# Google OAuth Scope Fix Summary

## Issue
Google's verification team identified a discrepancy between the OAuth scopes configured in Google Cloud Console and those requested by the application code.

## Missing Scopes (Were in Cloud Console but NOT in code)
The following 5 scopes were missing from the application code:

1. `openid` - OpenID Connect authentication
2. `https://www.googleapis.com/auth/userinfo.profile` - User profile information
3. `https://www.googleapis.com/auth/calendar.events` - Calendar events access (one of the 2 not showing on consent screen)
4. `https://www.googleapis.com/auth/gmail.readonly` - Gmail read-only access (one of the 2 not showing on consent screen)
5. `https://www.googleapis.com/auth/gmail.labels` - Gmail labels management

## Changes Made

### File: `supabase/functions/gmail-auth/index.ts` (Line 194)

**BEFORE:**
```typescript
const scope = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';
```

**AFTER:**
```typescript
const scope = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels';
```

## Final Scopes List (All 10 scopes now match Cloud Console)

1. ✅ `openid` (9315: API_EMERALDSEA_ME)
2. ✅ `https://www.googleapis.com/auth/userinfo.email` (202: API_EMAIL)
3. ✅ `https://www.googleapis.com/auth/userinfo.profile` (204: API_ACCOUNT_INFO_PROFILE)
4. ✅ `https://www.googleapis.com/auth/calendar` (700: API_CL)
5. ✅ `https://www.googleapis.com/auth/calendar.events` (752: API_CL_EVENTS) ⚠️ **Was missing**
6. ✅ `https://www.googleapis.com/auth/gmail.modify` (301: API_MAIL_MODIFY)
7. ✅ `https://www.googleapis.com/auth/gmail.compose` (302: API_MAIL_COMPOSE)
8. ✅ `https://www.googleapis.com/auth/gmail.readonly` (310: API_MAIL_READONLY) ⚠️ **Was missing**
9. ✅ `https://www.googleapis.com/auth/gmail.send` (311: API_MAIL_SEND)
10. ✅ `https://www.googleapis.com/auth/gmail.labels` (309: API_MAIL_LABELS)

## Next Steps

1. **Deploy the updated code** to your production environment
2. **Test the OAuth flow** to ensure all 10 scopes appear on the consent screen
3. **Reply to Google's verification email** confirming the changes have been deployed
4. **Wait for Google to re-test** your application

## Verification Checklist

- [x] Code updated with all required scopes
- [ ] Code deployed to production
- [ ] OAuth consent screen tested (verify all 10 scopes appear)
- [ ] Google verification team notified via email reply
- [ ] Google re-verification completed

## Important Notes

- The OAuth consent screen will now request additional permissions (calendar.events, gmail.readonly, gmail.labels, userinfo.profile, and openid)
- Existing users may need to reconnect their Google accounts to grant the new permissions
- Make sure to deploy these changes to the same environment that Google is testing against

## Email Response to Google

Once deployed and tested, you can reply to Google with:

```
Dear Third Party Data Safety Team,

Thank you for your feedback. We have updated our application code to include all the scopes that were submitted in the Cloud Console.

The following scopes have been added to our OAuth request:
- openid
- https://www.googleapis.com/auth/userinfo.profile
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/gmail.readonly
- https://www.googleapis.com/auth/gmail.labels

All changes have been deployed to production and the OAuth consent screen now displays all 10 scopes as configured in the Cloud Console.

Please re-test our application at your earliest convenience.

Thank you,
[Your Name]
```

---

**Date Fixed:** $(date)
**Fixed By:** AI Assistant via Cursor




