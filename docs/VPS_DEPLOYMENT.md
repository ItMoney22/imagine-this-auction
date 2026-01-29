# VPS Deployment Guide - ImagineThisAuction

## Live Demo Site

🚀 **The site is now live and accessible at:**

- **Main Site**: [http://168.231.69.85/](http://168.231.69.85/)
- **Login Page**: [http://168.231.69.85/login](http://168.231.69.85/login)
- **Admin Panel**: [http://168.231.69.85/admin](http://168.231.69.85/admin)
- **Auctioneer Dashboard**: [http://168.231.69.85/org](http://168.231.69.85/org)
- **Browse Auctions**: [http://168.231.69.85/auctions](http://168.231.69.85/auctions)

## Demo Credentials

⚠️ **FOR DEMO PURPOSES ONLY - CHANGE IN PRODUCTION**

- **Email**: admin@example.com
- **Password**: TempAdmin!234
- **Role**: admin

## Deployment Details

### Architecture
- **Application**: Next.js 15.5.4 (Production Build)
- **Process Manager**: PM2 (Auto-restart, Process Supervision)
- **Reverse Proxy**: Nginx (Load Balancing, SSL-ready, Caching)
- **Port Configuration**: App runs on 127.0.0.1:8080, proxied through Nginx on port 80

### Process Management

#### Start/Stop Commands
```bash
# Start the application
pm2 start imagine-web

# Stop the application
pm2 stop imagine-web

# Restart the application
pm2 restart imagine-web

# View status
pm2 status

# View logs
pm2 logs imagine-web
```

#### PM2 Configuration
- **Config File**: `/root/imagine-this-auction/apps/web/ecosystem.config.js`
- **Working Directory**: `/root/imagine-this-auction/apps/web`
- **Auto-restart**: Enabled
- **Memory Limit**: 1GB

### Nginx Configuration

#### Configuration File Location
- **Main Config**: `/etc/nginx/sites-available/imagine-this-auction`
- **Enabled Link**: `/etc/nginx/sites-enabled/000-imagine-this-auction`

#### Key Features
- ✅ Reverse proxy to Next.js app on port 8080
- ✅ Large file upload support (50MB) for CSV imports
- ✅ Static asset caching and optimization
- ✅ Security headers (XSS, CSRF protection)
- ✅ Gzip compression for better performance
- ✅ Proper proxy headers for real IP forwarding

#### Nginx Commands
```bash
# Test configuration
nginx -t

# Reload configuration
systemctl reload nginx

# Restart Nginx
systemctl restart nginx

# Check status
systemctl status nginx
```

### Firewall & Security

#### Open Ports
- **Port 80**: HTTP traffic (✅ Enabled)
- **Port 443**: HTTPS traffic (✅ Enabled)
- **Port 22**: SSH access (✅ Enabled)
- **Port 8080**: Direct app access (🔒 Internal only)

#### Security Headers
- X-Frame-Options: SAMEORIGIN
- X-XSS-Protection: 1; mode=block
- X-Content-Type-Options: nosniff
- Content-Security-Policy: Applied

### Authentication & Access

#### Email + Password Authentication
The login system supports both:
- **Email/Password**: Immediate login for demo purposes
- **Magic Links**: Email-based authentication (requires email setup)

#### Admin Panel Features
- User management and role controls
- Auctioneer approval workflow
- Financial reporting and CSV exports
- Compliance management and fraud detection
- System announcements and notifications

### File Locations

#### Application Files
```
/root/imagine-this-auction/apps/web/
├── app/                    # Next.js App Router
├── components/            # React components
├── lib/                   # Utility libraries
├── public/               # Static assets
├── .env.local           # Environment variables
├── ecosystem.config.js  # PM2 configuration
└── package.json         # Dependencies
```

#### Configuration Files
```
/etc/nginx/sites-available/imagine-this-auction    # Nginx config
/root/.pm2/dump.pm2                               # PM2 saved processes
/var/log/nginx/imagine-this-auction.*.log         # Nginx logs
/root/.pm2/logs/imagine-web-*.log                 # PM2 app logs
```

### Environment Variables

Current configuration in `/root/imagine-this-auction/apps/web/.env.local`:
```bash
# Supabase (placeholder values - replace with real credentials)
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:8080
NEXT_PUBLIC_APP_NAME="ImagineThisAuction"

# Platform Settings
NEXT_PUBLIC_BUYER_PREMIUM_PERCENT=10
NEXT_PUBLIC_PLATFORM_COMMISSION_PERCENT=1.2
NEXT_PUBLIC_ANTI_SNIPE_SECONDS=60
```

### Production Checklist

To make this production-ready:

1. **⚠️ Update Supabase Credentials**: Replace placeholder values with real Supabase project credentials
2. **⚠️ Change Demo Password**: Update or remove the demo admin account
3. **🔒 Enable HTTPS**: Configure SSL certificates (Let's Encrypt recommended)
4. **📧 Configure Email**: Set up SMTP for magic link authentication
5. **💳 Add Stripe Keys**: Configure real Stripe API keys for payments
6. **🗄️ Database Setup**: Run migrations and seed data in Supabase
7. **📊 Monitoring**: Set up application monitoring and error tracking
8. **🔐 Security Review**: Audit security headers and access controls

### Troubleshooting

#### Common Issues

**App Not Starting**
```bash
# Check PM2 status
pm2 status

# View error logs
pm2 logs imagine-web --err

# Restart the app
pm2 restart imagine-web
```

**502 Bad Gateway**
```bash
# Check if app is running
curl http://127.0.0.1:8080/

# Check Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

**Port Already in Use**
```bash
# Find process using port 8080
lsof -i :8080

# Kill process if needed
pm2 stop imagine-web
```

#### Log Locations
- **Application Logs**: `pm2 logs imagine-web`
- **Nginx Access Logs**: `/var/log/nginx/imagine-this-auction.access.log`
- **Nginx Error Logs**: `/var/log/nginx/imagine-this-auction.error.log`
- **System Logs**: `journalctl -u nginx`

### Performance Optimization

Current optimizations:
- ✅ Next.js production build with static optimization
- ✅ Nginx gzip compression
- ✅ Static asset caching (30 days)
- ✅ Font preloading
- ✅ Image optimization ready

### Support & Maintenance

#### Regular Maintenance
```bash
# Update PM2 process list
pm2 save

# Backup PM2 configuration
cp /root/.pm2/dump.pm2 /backup/

# Check disk space
df -h

# Monitor resource usage
pm2 monit
```

#### Updates
```bash
# Update application code
cd /root/imagine-this-auction/apps/web
git pull origin main

# Install dependencies
npm install

# Rebuild application
npm run build

# Restart services
pm2 restart imagine-web
```

---

**Deployment completed**: September 24, 2025
**Server IP**: 168.231.69.85
**Next.js Version**: 15.5.4
**PM2 Version**: 6.0.8
**Nginx Version**: 1.24.0