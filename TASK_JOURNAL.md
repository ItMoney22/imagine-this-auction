# AI Auctioneer + Notifier - Task Journal

## Overview
Implementation of AI-powered auction notifications with copywriting, recommendations, and multi-channel delivery.

## Completed: 2025-09-27

### Database Schema & Migrations ✅
- **File**: `supabase/migrations/20250927_ai_auctioneer_notifications.sql`
- **Tables Added**:
  - `user_interests` - Tracks user preferences for recommendation engine
  - `notifications` - Queue for email, push, and SMS notifications
  - `notification_batches` - Tracks batch notification jobs
  - `user_device_tokens` - Stores device tokens for push notifications
  - `lot_interactions` - Tracks user interactions for recommendation scoring
  - `feature_flags` - Controls feature rollout
- **Columns Added**:
  - `users.notification_prefs` - User notification preferences and quiet hours
  - `lots.hype_copy` - AI-generated marketing copy in JSON format
  - `lots.embedding` - Vector embeddings (optional, behind feature flag)
- **Functions Added**:
  - `upsert_user_interest()` - Updates user interest weights
  - `get_user_recommendations()` - Returns personalized lot recommendations

### AI Copywriter Microservice ✅
- **Endpoint**: `POST /api/ai/copywriter`
- **Providers Supported**: OpenAI, Groq, Together AI
- **Styles**: Hype, Classic, Collector
- **Features**:
  - Toxicity detection and content filtering
  - Retry logic with fallback copy
  - Rate limiting (basic)
  - Batch processing
- **Environment Variables**:
  - `COPYWRITER_PROVIDER` - AI provider (openai|groq|together)
  - `OPENAI_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`
  - `COPYWRITER_ENABLED` - Feature flag

### Supabase Edge Functions ✅
- **Function**: `recommend-daily`
  - **URL**: `/functions/v1/recommend-daily`
  - **Schedule**: Daily cron job (manual trigger available)
  - **Process**: Generates personalized recommendations, respects quiet hours
- **Function**: `on-lot-publish`
  - **Trigger**: Database trigger on lot status change to 'published'/'live'
  - **Process**: Generates hype copy, triggers interest-based notifications

### Email Notification System ✅
- **Endpoint**: `POST /api/notifications/deliver-email-batch`
- **Provider**: Resend (configurable for AWS SES)
- **Templates**:
  - Daily digest with personalized recommendations
  - Lot interest match alerts
- **Features**:
  - HTML/text dual format
  - Unsubscribe links
  - Batch processing with rate limiting
  - Dry run mode for testing
- **Environment Variables**:
  - `EMAIL_PROVIDER` - resend|ses
  - `RESEND_API_KEY`
  - `FROM_EMAIL`

### PWA Push Notifications ✅
- **Service Worker**: `/public/sw.js`
- **Endpoint**: `POST /api/notifications/push`
- **Library**: `/lib/push-notifications.ts`
- **Features**:
  - VAPID key authentication
  - Device token management
  - Offline support with background sync
  - Click tracking and analytics
- **Environment Variables**:
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
  - `PUSH_NOTIFICATIONS` - Feature flag

### Admin Controls ✅
- **Page**: `/admin/notifications`
- **Components**:
  - `NotificationControls` - Manual triggers and testing
  - `HypePreview` - Preview AI-generated copy across channels
  - `NotificationBatches` - Monitor batch job status
  - `NotificationStats` - Usage statistics and metrics
- **Features**:
  - Manual recommendation triggers
  - Email/push batch delivery
  - Hype copy regeneration with style selection
  - Dry run testing mode

### User Settings ✅
- **Page**: `/settings/notifications`
- **Components**:
  - `NotificationPreferences` - Email/push/SMS toggles, quiet hours
  - `InterestTags` - Manage interest categories for recommendations
  - `PushNotificationSettings` - Device management and testing
  - `NotificationHistory` - View recent notifications
- **Features**:
  - Granular notification controls
  - Interest weight management
  - Push subscription management

## Environment Variables Required

### AI & Copywriting
```env
COPYWRITER_PROVIDER=openai  # openai|groq|together
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
TOGETHER_API_KEY=...
```

### Email Delivery
```env
EMAIL_PROVIDER=resend  # resend|ses
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@imaginethisauction.com
```

### Push Notifications
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@imaginethisauction.com
```

### Feature Flags
```env
USE_EMBEDDINGS=false
SMS_ENABLED=false
PUSH_NOTIFICATIONS=true
COPYWRITER_ENABLED=true
```

### URLs
```env
NEXT_PUBLIC_SITE_URL=https://imaginethisauction.com
SITE_URL=https://imaginethisauction.com
```

## CRON Schedule

### Daily Recommendations
```bash
# Run daily at 9 AM UTC
0 9 * * * curl -X POST https://your-project.supabase.co/functions/v1/recommend-daily
```

### Email Batch Delivery
```bash
# Process email queue every 15 minutes
*/15 * * * * curl -X POST https://imaginethisauction.com/api/notifications/deliver-email-batch
```

### Push Batch Delivery
```bash
# Process push queue every 5 minutes
*/5 * * * * curl -X POST https://imaginethisauction.com/api/notifications/push
```

## API Endpoints

### AI Copywriter
- `POST /api/ai/copywriter` - Generate hype copy for lots
- `GET /api/ai/copywriter` - Health check

### Notifications
- `POST /api/notifications/deliver-email-batch` - Process email queue
- `POST /api/notifications/push` - Process push notification queue
- `POST /api/notifications/push/subscribe` - Register push subscription
- `POST /api/notifications/track` - Track notification interactions

### Edge Functions
- `POST /functions/v1/recommend-daily` - Generate daily recommendations
- `POST /functions/v1/on-lot-publish` - Handle lot publishing events

## Database Triggers

### Lot Publishing
```sql
CREATE TRIGGER on_lot_status_change
AFTER UPDATE OF status ON lots
FOR EACH ROW
WHEN (NEW.status IN ('published', 'live') AND OLD.status != NEW.status)
EXECUTE FUNCTION trigger_lot_publish_webhook();
```

## Cost Estimates (per 1k lots)

### AI Copywriting
- **OpenAI GPT-4o-mini**: ~$0.50-1.00
- **Groq Llama-3.1-8B**: ~$0.05-0.10
- **Together AI**: ~$0.10-0.20

### Email Delivery
- **Resend**: ~$1.00 (1k emails)
- **AWS SES**: ~$0.10 (1k emails)

### Push Notifications
- **Web Push**: Free (self-hosted)
- **Bandwidth**: Minimal cost

### **Total estimated cost per 1k lots: $0.65 - $2.10**
(Using Groq + AWS SES for optimal cost)

## Testing Strategy

### Unit Tests
- Copywriter API validation and fallbacks
- Notification queue processing
- User interest scoring algorithm

### Integration Tests
- End-to-end: Lot publish → Hype generation → Notification delivery
- Email template rendering and delivery
- Push notification subscription and delivery

### Manual Testing
- Admin controls dry run mode
- User notification preferences
- Cross-browser push notification support

## Security Considerations

- API keys stored as environment variables
- Rate limiting on AI endpoints
- Content filtering for generated copy
- User data isolation via RLS policies
- VAPID key rotation for push notifications
- Unsubscribe mechanism compliance

## Monitoring & Analytics

### Key Metrics
- Recommendation click-through rates
- Email open/click rates
- Push notification engagement
- AI copy toxicity scores
- System error rates

### Logging
- Batch job completion status
- AI generation failures and fallbacks
- Notification delivery failures
- User interaction tracking

## Future Enhancements

### Phase 2 Features
- SMS notifications via Twilio
- Vector embeddings for improved recommendations
- A/B testing for copy styles
- Advanced analytics dashboard
- User feedback on recommendations

### Scalability Improvements
- Redis for rate limiting and caching
- CDN for static notification assets
- Database read replicas for analytics
- Horizontal scaling for batch processing