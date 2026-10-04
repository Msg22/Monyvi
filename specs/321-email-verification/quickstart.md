# Quickstart: Email Verification Implementation & QA

## Planning authority

- Issue: #321
- Branch: `codex/issue321-email-verification`
- Revised approved plan: 2026-10-04
- Primary flow: six-digit signup verification code
- Verification authority: Supabase Auth
- Resend policy: 2-minute cooldown, 3 resends, 24-hour window

## Hosted status reported by user

On 2026-10-04:

- custom SMTP was configured in Supabase;
- a real Confirm Signup email was received successfully;
- the Monyvi Confirm Signup subject/template was pasted into the Supabase
  template editor.

Treat template installation as complete.

**Required correction check:** the earlier template draft said "expires in 1
hour". The new product contract is **10 minutes**, so verify the hosted template
now says 10 minutes before release.

## Local Auth configuration target

```toml
[auth.email]
enable_confirmations = true
otp_length = 6
otp_expiry = 600
max_frequency = "2m"
```

The exact local project-wide email-sent rate limit should be high enough not to
mask the product's per-email limiter tests.

## Primary manual QA journey

1. Start from a clean/unverified email.
2. Sign up with email/password.
3. Verify Monyvi shows the approved code-entry state.
4. Confirm private dashboard access is unavailable.
5. Confirm the email contains a six-digit code and says it expires in 10
   minutes.
6. Paste all six digits.
7. Verify submission begins automatically without an extra Verify button.
8. Confirm exactly one verification request occurs.
9. Verify Email verified is shown.
10. Verify the app does not automatically skip the success state.
11. Tap Continue to dashboard.
12. Verify the existing authenticated startup flow continues normally.

## Wrong / expired code QA

- wrong six digits -> localized error, remain on code screen;
- expired code -> localized expiry error and resend recovery;
- fewer than six digits -> no submit;
- non-digit paste -> sanitize/reject safely;
- repeated sixth-digit render/state update -> no duplicate verification call.

## Resend QA

### Initial send

Immediately after signup:

- resend disabled;
- UI shows countdown such as `Resend in 1:59`.

### Cooldown

After two minutes:

- resend becomes available.

After successful resend:

- resend disables for another two minutes;
- code-expiry timer restarts from 10 minutes.

### Daily/window limit

Within one active window:

- original send succeeds;
- resend 1 succeeds;
- resend 2 succeeds;
- resend 3 succeeds;
- resend 4 is denied with product-safe "try later" copy.

After 24 hours from original-send window start:

- allowance resets.

Server enforcement must still hold if the mobile button is bypassed or requests
arrive concurrently.

## Returning unverified account

1. Sign in with correct password before verification.
2. Verify raw `email_not_confirmed` is not displayed.
3. Verify code-entry state opens.
4. Do not automatically send a new code merely because the user signed in.
5. Resend remains subject to the same server policy.

If this device does not know the real last-send timestamp, the UI must not show
a fabricated countdown; generic ten-minute expiry copy is acceptable until a
new send creates a known timestamp.

## Legacy confirmation-link regression

Real-device issue observed:

- link verified email successfully;
- app opened the auth-callback skeleton and stayed there;
- backing out and signing in succeeded.

After the callback fix:

1. open an already-sent/legacy valid signup confirmation link;
2. callback completes and validates a session;
3. Email verified appears;
4. no indefinite skeleton;
5. Continue enters the app.

Also retest:

- cold start;
- warm start;
- invalid/malformed callback;
- reused link;
- offline/network callback;
- OAuth;
- password recovery.

## Local automated E2E target

Update `npm run e2e:email-verification:local` to use Mailpit code extraction,
not link-first confirmation:

```text
fresh signup
 -> verification code state
 -> Mailpit receives code email
 -> extract six-digit token
 -> enter/paste token
 -> auto-submit
 -> Email verified
 -> Continue
 -> authenticated app
```

Do not consume production SMTP in local E2E.

## Visual QA

The revised English-light code screen is approved.

Before implementation resumes, approve remaining:

- English dark code screen;
- Arabic light/dark code screens;
- Email verified EN/AR light/dark.

After implementation, capture baseline/variants and keep functional,
visual-fidelity, and accessibility statuses separate.

## Hosted deployment sequence

After the PR code is approved and before hosted device QA:

```bash
# Apply tracked database migrations, including 081.
npm run db:push -- --include-all

# Deploy the public pre-auth resend limiter. Its own SQL/HMAC/rate-limit
# contract protects the endpoint; pending users do not have an authenticated
# JWT yet.
npm run fn:deploy:email-verification-resend

# Inspect hosted Auth policy without printing template contents.
npm run auth:verification:status

# If the status is not Confirm-email=true, OTP=600s, length=6,
# minimum send frequency=120s, apply the approved policy.
npm run auth:verification:configure
```

The hosted function derives a purpose-specific limiter HMAC key from server-only
credentials unless `EMAIL_VERIFICATION_LIMITER_PEPPER` is explicitly set.
No limiter secret belongs in the mobile bundle or Git.

**Important limitation:** the Monyvi resend path is server-enforced, but the
underlying public Supabase Auth endpoints still retain their own built-in rate
limits. Do not describe the product limiter as replacing Supabase's platform
rate limiting.

## Production delivery QA

Required before release:

- Gmail;
- Outlook/Hotmail;
- one additional common mailbox;
- spam-folder observation;
- provider delivery/bounce/suppression logs;
- SPF/DKIM/DMARC health as applicable.

## Secrets

Never commit or log:

- SMTP password;
- service-role key;
- limiter HMAC pepper;
- OTP;
- access/refresh token;
- token-bearing callback URL.
