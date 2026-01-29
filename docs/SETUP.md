# ImagineThisAuction - Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Supabase account (https://supabase.com)
- PaymentCloud (or selected provider) merchant account (pending activation)
- Git

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
cd apps/web
npm install
```

### 2. Environment Configuration

Copy the environment template:

```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:

#### Supabase Configuration
1. Create a new project at https://supabase.com
2. Go to Settings > API
3. Copy your project URL and anon key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Payment Provider Configuration (PaymentCloud placeholder)
1. Set `NEXT_PUBLIC_PAYMENT_PROVIDER=paymentcloud` in `.env.local`
2. Once your PaymentCloud account is approved, capture the credentials they issue:

```env
PAYMENTCLOUD_API_KEY=your-api-key
PAYMENTCLOUD_WEBHOOK_SECRET=shared-secret-for-webhooks
```

Until underwriting is complete you can leave these unset—the application will surface "provider pending" messaging and accept test webhooks.

See [PAYMENTCLOUD.md](./PAYMENTCLOUD.md) for provider-specific onboarding notes.

#### Application URLs
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="ImagineThisAuction"
```

### 3. Database Setup

The database schema will be created in **Task B**. For now, ensure your Supabase project is created and connected.

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 to see the application.

## Authentication Setup

The app uses Supabase Auth with magic link authentication:

1. **Magic Link**: Users receive an email with a login link
2. **Automatic Profiles**: User profiles are created automatically on first login
3. **Role-Based Access**: Users are assigned roles (bidder, auctioneer, admin)

### Admin User Creation

After Task B is complete, you can create an admin user by:

1. Signing up through the normal flow
2. Manually updating the user's role in the Supabase dashboard
3. Or using the admin seed script (provided in Task B)

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Run type checking
npm run type-check
```

## Project Structure

```
apps/web/
├── app/                 # Next.js app directory
│   ├── (auth)/         # Authentication pages
│   ├── dashboard/      # User dashboards
│   ├── admin/          # Admin interface
│   ├── auctioneer/     # Auctioneer interface
│   └── api/            # API routes
├── components/         # React components
│   ├── auth/          # Authentication components
│   ├── navigation/    # Navigation components
│   └── ui/            # Reusable UI components
├── lib/               # Utility libraries
│   ├── supabase/     # Supabase configuration
│   └── types/        # TypeScript types
└── middleware.ts      # Next.js middleware
```

## Next Steps

1. Complete **Task B** to set up the database schema
2. Configure PaymentCloud credentials and webhooks once underwriting is complete
3. Set up email sending (Resend or Supabase SMTP)

## Demo Data Seed (Local & Preview)

To explore the full marketplace flow without manual data entry, run the demo seed script (requires your Supabase service role key):

1. Ensure the schema has been applied (`supabase db push` or run the hosted migration).
2. Export the necessary environment variables in your shell:
   ```bash
   export NEXT_PUBLIC_SUPABASE_URL="https://<your-project>.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
   ```
3. Execute the seed script from the repo root:
   ```bash
   node apps/web/scripts/seed-demo-data.js
   ```

The script is idempotent—it will create/update:
- 1 admin, 1 auctioneer, and 3 bidder accounts
- An approved auctioneer company profile
- 1 live auction with active bids and wallet holds
- 1 scheduled auction with inventory staged
- Wallet ledger entries that demonstrate purchases, holds, and refunds

Passwords default to `TempAdmin!234`, `Auctioneer!234`, and `BidderOne|Two|Three!234`. Override them by setting `DEMO_*_PASSWORD` environment variables before running the script.

## Troubleshooting

### Common Issues

**Authentication not working:**
- Check Supabase URL and keys
- Verify email settings in Supabase dashboard
- Ensure auth callback URL is configured

**Database errors:**
- Ensure RLS policies are set up correctly
- Check user permissions in Supabase
- Verify table schema matches TypeScript types

**Environment variables:**
- Restart development server after changing .env.local
- Ensure NEXT_PUBLIC_ prefix for client-side variables
- Check for typos in variable names

### Authentication & Redirect Issues

**ERR_TOO_MANY_REDIRECTS:**
- Verify `NEXT_PUBLIC_SITE_URL` matches your actual domain
- Update Supabase Auth → URL Configuration with:
  - Site URL: `http://your-domain` (e.g., `http://168.231.69.85`)
  - Redirect URLs: Add `http://your-domain/auth/callback`
- Ensure middleware excludes public routes properly
- Check that cookies are being preserved in middleware

**VPS Deployment Auth Issues:**
1. Set correct environment variables:
   ```env
   NEXT_PUBLIC_SITE_URL=http://your-vps-ip
   NEXT_PUBLIC_APP_URL=http://your-vps-ip
   ```
2. Update Supabase dashboard settings:
   - Authentication → Settings → Site URL
   - Authentication → URL Configuration → Redirect URLs
3. Rebuild and restart: `pnpm build && pm2 restart app-name`

**Cookie Domain Issues:**
- Supabase auth cookies must match your domain
- For IP-based deployments, ensure no domain restrictions
- Clear browser cookies when testing auth changes

## Support

For setup issues:
1. Check the troubleshooting section above
2. Review Supabase and Next.js documentation
3. Check the project's GitHub issues

---

## Supabase Integration Verified

**Verification Date**: 2025-09-24

✅ **Environment Configuration**: All Supabase environment variables properly configured
- `NEXT_PUBLIC_SUPABASE_URL`: https://voxwfpcgxtsmejljfhck.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Valid anon key configured
- `SUPABASE_SERVICE_ROLE_KEY`: Valid service role key configured

✅ **Application Health**:
- API health endpoint: `/api/health` returns `{ "ok": true }`
- App loads successfully at http://168.231.69.85/
- PM2 process running correctly (imagine-web)

✅ **Authentication Setup**:
- Login page loads correctly at `/login`
- Supabase client properly configured
- Admin page redirects to login (authentication required)

✅ **Database Connection**:
- Successfully connects to Supabase database
- Database accessible via service role key
- Demo dataset available via `node apps/web/scripts/seed-demo-data.js`

**Last Updated**: Task A - Bootstrap & Auth + Supabase Verification
**Next**: Task B - Schema & Migrations
