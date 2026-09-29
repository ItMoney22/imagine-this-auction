# Supabase Auth email templates

Generated — do not hand-edit. Change `apps/web/lib/email/layout.ts` or
`scripts/build-auth-emails.mts`, then re-run:

```
node --experimental-strip-types scripts/build-auth-emails.mts
```

Paste each file into the Supabase dashboard under **Authentication → Emails**,
into the tab named below, with the subject given. Supabase sends these itself,
so they must also be reachable from a sender we own — see SMTP below.

| File | Template tab | Subject |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your email · Imagine This Auction |
| `magic-link.html` | Magic Link | Your sign-in link · Imagine This Auction |
| `reset-password.html` | Reset Password | Reset your password · Imagine This Auction |
| `change-email.html` | Change Email Address | Confirm your new email · Imagine This Auction |
| `invite.html` | Invite user | You have been invited · Imagine This Auction |
| `reauthentication.html` | Reauthentication | Your verification code · Imagine This Auction |

## SMTP

Supabase's built-in sender is rate-limited and stamps its own address on the
mail, which is why signup confirmations arrived unbranded. Point the project at
Resend instead, under **Project Settings → Authentication → SMTP Settings**:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | the `RESEND_API_KEY` already in `apps/web/.env.local` |
| Sender email | `noreply@imaginethisauction.com` |
| Sender name | `Imagine This Auction` |

The `imaginethisauction.com` domain is already verified in Resend with sending
enabled, so no DNS work is needed.
