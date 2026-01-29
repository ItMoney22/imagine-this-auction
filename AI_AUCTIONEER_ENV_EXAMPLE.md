# AI Auctioneer + Notifier Environment Variables
Copy these to your `.env.local` file and fill in your actual values.

```env
# =============================================================================
# AI Copywriter Configuration
# =============================================================================
# Provider: openai | groq | together
COPYWRITER_PROVIDER=openai

# OpenAI Configuration (if using openai provider)
OPENAI_API_KEY=sk-your-openai-key

# Groq Configuration (if using groq provider) - RECOMMENDED for cost efficiency
GROQ_API_KEY=gsk_your-groq-key

# Together AI Configuration (if using together provider)
TOGETHER_API_KEY=your-together-key

# =============================================================================
# Email Notification Configuration
# =============================================================================
# Provider: resend | ses
EMAIL_PROVIDER=resend

# Resend Configuration (if using resend provider) - RECOMMENDED for simplicity
RESEND_API_KEY=re_your-resend-key

# AWS SES Configuration (if using ses provider) - RECOMMENDED for cost efficiency
# AWS_ACCESS_KEY_ID=your-aws-access-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret-key
# AWS_REGION=us-east-1

# Email settings
FROM_EMAIL=noreply@yourdomain.com

# =============================================================================
# Push Notification Configuration
# =============================================================================
# Generate VAPID keys using: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=admin@yourdomain.com

# =============================================================================
# SMS Configuration (Optional - Coming Soon)
# =============================================================================
# Twilio Configuration (when SMS_ENABLED=true)
# TWILIO_ACCOUNT_SID=your-twilio-account-sid
# TWILIO_AUTH_TOKEN=your-twilio-auth-token
# TWILIO_PHONE_NUMBER=+1234567890

# =============================================================================
# Feature Flags
# =============================================================================
# Enable/disable major features
USE_EMBEDDINGS=false
SMS_ENABLED=false
PUSH_NOTIFICATIONS=true
COPYWRITER_ENABLED=true
```

## Setup Instructions

### 1. AI Copywriter Setup
Choose one provider:

**Groq (Recommended - cheapest):**
```bash
# Sign up at https://groq.com/
# Get API key from dashboard
COPYWRITER_PROVIDER=groq
GROQ_API_KEY=gsk_your-groq-key
```

**OpenAI (Most reliable):**
```bash
# Sign up at https://platform.openai.com/
# Get API key from dashboard
COPYWRITER_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
```

### 2. Email Setup
Choose one provider:

**Resend (Recommended - simple setup):**
```bash
# Sign up at https://resend.com/
# Get API key from dashboard
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your-resend-key
FROM_EMAIL=noreply@yourdomain.com
```

**AWS SES (Recommended - cheapest):**
```bash
# Set up AWS SES in your AWS account
EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
FROM_EMAIL=noreply@yourdomain.com
```

### 3. Push Notifications Setup
```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Add to .env.local
VAPID_PUBLIC_KEY=your-generated-public-key
VAPID_PRIVATE_KEY=your-generated-private-key
VAPID_EMAIL=admin@yourdomain.com
```

### 4. Deploy Database Migration
```bash
# Apply the database migration
supabase db push

# Or manually run the SQL file:
# supabase/migrations/20250927_ai_auctioneer_notifications.sql
```

### 5. Set Up Cron Jobs
Add these to your server's crontab or use a service like GitHub Actions:

```bash
# Daily recommendations at 9 AM UTC
0 9 * * * curl -X POST https://your-project.supabase.co/functions/v1/recommend-daily

# Email delivery every 15 minutes
*/15 * * * * curl -X POST https://yourdomain.com/api/notifications/deliver-email-batch

# Push delivery every 5 minutes
*/5 * * * * curl -X POST https://yourdomain.com/api/notifications/push
```