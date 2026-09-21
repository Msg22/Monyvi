# Data Model: Complete Email Verification

## Summary

#321 introduces **no new persisted Monyvi domain entity and no schema
migration**. Verification remains owned by Supabase Auth. This document records
the state boundaries that implementation must preserve.

## 1. Supabase Auth User Verification State

**Owner**: Supabase Auth  
**Persistence**: Auth system, not Monyvi application tables

Relevant state:

- user exists with an email identity;
- email is unverified while the provider has no confirmation timestamp;
- email is verified once the provider accepts a valid confirmation token.

Monyvi must never create a parallel `is_email_verified` application column.

### State transitions

```text
NEW SIGNUP
   |
   v
UNVERIFIED ---- valid confirmation ----> VERIFIED
   |                                     |
   | sign-in attempt                     | sign-in/session
   v                                     v
VERIFICATION PENDING                 AUTHENTICATED
   |
   +---- resend ----> UNVERIFIED (new confirmation message)
```

Invalid/expired callbacks do not advance the state.

## 2. Verification Pending UI State

**Owner**: auth screen controller  
**Persistence**: ephemeral memory only

Fields/concepts:

- pending email address;
- screen state = verification pending;
- resend request pending/not pending;
- localized success/error feedback.

The pending email exists only to render recovery UI and request resend. It is not
authorization evidence.

## 3. Auth Callback Result

**Owner**: mobile auth service layer  
**Persistence**: none

The callback-completion boundary should expose a stable result classification,
for example:

- success;
- provider-declared callback error;
- invalid/missing authentication material;
- session-establishment failure.

Raw access tokens, refresh tokens, verification tokens, and complete callback
URLs are never part of user-visible result payloads or logs.

## 4. Routing State

The callback route may coordinate:

1. callback processing;
2. authenticated session establishment;
3. handoff to existing root/profile routing.

It must not duplicate onboarding/profile business decisions.

## Database / Sync Impact

- PostgreSQL migrations: none.
- WatermelonDB schema: none.
- RLS: no new policy.
- Sync protocol: unchanged.
- Financial actions: unchanged.
