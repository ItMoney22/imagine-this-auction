# Admin Panel Documentation

## Overview

The ImagineThisAuction admin panel provides comprehensive platform oversight, user management, financial monitoring, and compliance tools. This document outlines all administrative features, permissions, and workflows.

## Access and Authentication

### Admin Access Requirements
- **Role**: `admin` in the users table
- **URL**: `/admin`
- **Authentication**: Supabase Auth + middleware validation
- **Security**: Row Level Security (RLS) policies enforce admin-only access

### Permission Matrix

| Feature | Admin | Auctioneer | Bidder |
|---------|-------|------------|--------|
| View Admin Dashboard | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ |
| Approve Auctioneers | ✅ | ❌ | ❌ |
| View Financial Reports | ✅ | ❌ | ❌ |
| Compliance Management | ✅ | ❌ | ❌ |
| System Announcements | ✅ | ❌ | ❌ |
| Invoice Oversight | ✅ | Own only | Own only |
| Payout Management | ✅ | View own | ❌ |

## Dashboard Overview

### Navigation Tabs
The admin panel is organized into 8 main sections:

1. **Overview** - System statistics and recent activity
2. **Users** - User management and role controls
3. **Auctioneers** - Application approvals and management
4. **Financials** - Revenue tracking and financial reports
5. **Compliance** - Fraud prevention and KYC management
6. **Notifications** - System announcements and alerts
7. **Invoices** - Invoice and escrow oversight
8. **Payouts** - Auctioneer payout processing

### Key Metrics Displayed
- Total users by role (bidders, auctioneers, admins)
- Active vs suspended accounts
- Pending auctioneer applications
- Financial summary (credits minted, escrowed, released)
- Platform commission earned
- Compliance flags and suspicious users

## User Management

### User Overview
- **Location**: Admin Dashboard → Users tab
- **Features**: Search, filter, role management, status control

### User Actions

#### Change User Role
```typescript
// Available roles: bidder, auctioneer, admin
PUT /api/admin/users/{userId}/role
{
  "new_role": "auctioneer",
  "notes": "Promoted due to business verification"
}
```

**Process**:
1. Select new role from dropdown
2. Confirm action in modal
3. Add optional notes for audit trail
4. System creates audit log entry
5. User role updated instantly

#### Suspend/Activate User
```typescript
PUT /api/admin/users/{userId}/status
{
  "is_approved": false,
  "notes": "Suspended due to policy violation"
}
```

**Effects of Suspension**:
- User cannot log in
- Cannot place bids or create auctions
- Cannot purchase credits
- Existing auctions/bids remain active

### Search and Filtering
- **By Role**: All, Bidders, Auctioneers, Admins
- **By Status**: All, Active, Suspended
- **By Search**: Email, first name, last name
- **Real-time**: Filters update results immediately

## Auctioneer Management

### Application Review Process
1. **Application Submission**: User registers as auctioneer
2. **Document Upload**: Business license, tax ID, etc.
3. **Admin Review**: Verify information and documents
4. **Approval/Rejection**: Update status with notes
5. **User Notification**: Email sent to applicant

### Auctioneer Details View
- Company information and contact details
- Business license and tax ID
- Complete address information
- Website and branding details
- Performance statistics:
  - Total auctions created
  - Completed auctions
  - Commission owed/paid

### Approval Actions
```typescript
PUT /api/admin/auctioneers/{auctioneerId}/status
{
  "is_approved": true,
  "notes": "Application approved - all documents verified"
}
```

**Approval Effects**:
- User gains auctioneer privileges
- Can create and manage auctions
- Access to auctioneer dashboard
- Automatic user account activation

## Financial Reports

### Revenue Tracking
- **Credits Minted**: Total ITC purchased via Stripe
- **Credits in Escrow**: Held pending shipment
- **Credits Released**: Completed transactions
- **Platform Commission**: 1.2% of hammer prices
- **Pending Payouts**: Owed to auctioneers
- **Paid Payouts**: Historical payouts completed

### Export Functionality
- **Format**: CSV download
- **Content**: Financial summary with all key metrics
- **Filename**: `financial-report-YYYY-MM-DD.csv`
- **Usage**: Accounting integration, reporting

### Recent Activity Monitoring
- **Transactions**: Latest wallet operations
- **Invoices**: Recent winner invoices created
- **Payouts**: Auctioneer payout activities
- **Filters**: Last 20 items per category

## Compliance Management

### Risk Detection System

#### Automatic Flags
The system automatically flags users based on:
- **High Refund Ratio**: >80% of bids refunded
- **Multiple Unpaid Invoices**: >2 outstanding invoices
- **Excessive Bidding**: >50 bids with no wins

#### Risk Scoring
- **Low (1-9)**: Minor behavioral anomalies
- **Medium (10-19)**: Pattern concerns requiring review
- **High (20-29)**: Suspicious activity, manual review needed
- **Critical (30+)**: Immediate intervention required

### Compliance Flags Management
- **View All Flags**: Active and resolved compliance issues
- **Filter by Severity**: Critical, high, medium, low
- **Resolution Workflow**: Mark resolved with notes
- **Audit Trail**: Complete history of flag lifecycle

### KYC Document Review
- **Document Types**: ID, business license, tax documents
- **Verification Status**: Pending, approved, rejected
- **Admin Actions**: Approve/reject with notes
- **File Access**: Secure document viewing

## System Notifications

### Announcement Types
- **Info**: General platform updates
- **Warning**: Important notices requiring attention
- **Urgent**: Critical issues requiring immediate action

### Targeting Options
- **All Users**: Platform-wide announcements
- **Role-Specific**: Target bidders, auctioneers, or admins
- **Expiration**: Optional auto-expiry dates

### Announcement Lifecycle
1. **Create**: Title, message, severity, target roles
2. **Activate**: Make visible to users
3. **Monitor**: Track visibility and engagement
4. **Deactivate**: Remove from user interfaces
5. **Archive**: Delete when no longer needed

### Example Announcement
```json
{
  "title": "Planned Maintenance Window",
  "message": "The platform will be unavailable for maintenance on Sunday, Dec 15 from 2-4 AM EST.",
  "severity": "warning",
  "target_roles": ["bidder", "auctioneer"],
  "expires_at": "2024-12-16T00:00:00Z"
}
```

## Audit Logging

### Tracked Actions
All admin actions are logged with:
- **Timestamp**: UTC timestamp
- **Admin User**: Who performed the action
- **Action Type**: Specific operation performed
- **Target**: What was modified (user, auctioneer, etc.)
- **Before/After Values**: Complete change tracking
- **Notes**: Admin-provided context

### Audit Log Categories
- **User Management**: Role changes, suspensions
- **Auctioneer Actions**: Approvals, rejections
- **Compliance**: Flag creation, resolution
- **System Changes**: Announcements, settings
- **Financial Actions**: Payout processing

### Compliance Benefits
- **Accountability**: Track all administrative decisions
- **Compliance**: Meet regulatory audit requirements
- **Debugging**: Trace issues to specific actions
- **Reporting**: Generate compliance reports

## Security Features

### Access Controls
- **Role-Based**: Admin role required for all features
- **Session Management**: Secure authentication tokens
- **IP Logging**: Track admin access locations
- **User Agent**: Device/browser identification

### Data Protection
- **Encryption**: All sensitive data encrypted at rest
- **Audit Trails**: Immutable action logging
- **Backup Strategy**: Regular automated backups
- **Access Monitoring**: Log all admin panel access

### Fraud Prevention
- **Automated Detection**: AI-powered risk scoring
- **Manual Review**: Admin oversight capabilities
- **Account Controls**: Suspension and restriction tools
- **Transaction Monitoring**: Real-time fraud detection

## Operational Procedures

### Daily Tasks
1. **Review Compliance Flags**: Check for new high-risk users
2. **Process Auctioneer Applications**: Approve/reject within 24 hours
3. **Monitor Financial Metrics**: Verify transaction accuracy
4. **Check System Health**: Review error logs and performance

### Weekly Tasks
1. **Generate Financial Reports**: Export for accounting
2. **Review Audit Logs**: Check for suspicious admin activity
3. **Update System Announcements**: Refresh user communications
4. **Compliance Review**: Resolve outstanding flags

### Monthly Tasks
1. **User Growth Analysis**: Review registration trends
2. **Revenue Assessment**: Analyze platform commission
3. **Policy Updates**: Review and update platform policies
4. **Security Review**: Assess system security measures

## Troubleshooting

### Common Issues

#### Admin Access Denied
**Symptoms**: 403 Forbidden on admin routes
**Causes**:
- User role not set to 'admin'
- RLS policies blocking access
- Session expired

**Resolution**:
1. Verify user role in database
2. Check authentication status
3. Clear browser cache/cookies
4. Re-authenticate if needed

#### Financial Discrepancies
**Symptoms**: Metrics don't match expected values
**Causes**:
- Timing differences in calculations
- Incomplete transaction processing
- Database synchronization issues

**Resolution**:
1. Refresh financial dashboard
2. Check recent transaction logs
3. Verify escrow release completion
4. Contact technical support if persisting

#### Compliance Flag Errors
**Symptoms**: False positive risk detection
**Causes**:
- Algorithm threshold too sensitive
- Incomplete user behavior data
- System timing issues

**Resolution**:
1. Review user's complete transaction history
2. Add manual notes to flag
3. Adjust risk thresholds if needed
4. Resolve flag with explanation

### Emergency Procedures

#### Platform-Wide Issues
1. **Create Urgent Announcement**: Inform users immediately
2. **Suspend Problem Features**: Disable affected functionality
3. **Document Issue**: Create detailed incident report
4. **Escalate to Development**: Contact technical team

#### Security Incidents
1. **Immediate Assessment**: Determine scope and impact
2. **User Protection**: Suspend affected accounts
3. **Evidence Preservation**: Save all relevant logs
4. **Incident Response**: Follow security protocols

## Performance Optimization

### Database Queries
- **Indexing**: Optimized indexes for admin queries
- **Caching**: Redis caching for frequent lookups
- **Pagination**: Limit large result sets
- **Connection Pooling**: Efficient database connections

### User Interface
- **Lazy Loading**: Load data on demand
- **Debounced Search**: Reduce API calls
- **Error Boundaries**: Graceful error handling
- **Loading States**: Clear user feedback

## API Reference

### Admin User Management
```typescript
// Get all users with filtering
GET /api/admin/users?role=bidder&status=active&search=john

// Change user role
PUT /api/admin/users/{id}/role
Body: { new_role: "auctioneer", notes: "string" }

// Change user status
PUT /api/admin/users/{id}/status
Body: { is_approved: boolean, notes: "string" }
```

### Auctioneer Management
```typescript
// Get all auctioneers
GET /api/admin/auctioneers?status=pending

// Approve/reject auctioneer
PUT /api/admin/auctioneers/{id}/status
Body: { is_approved: boolean, notes: "string" }
```

### Financial Reports
```typescript
// Get financial summary
GET /api/admin/financials
Returns: {
  summary: FinancialSummary,
  metrics: MonthlyMetrics,
  recent_activity: RecentActivity
}
```

### Compliance Management
```typescript
// Get compliance overview
GET /api/admin/compliance
Returns: { summary: ComplianceSummary }

// Get suspicious users
GET /api/admin/compliance?action=suspicious-users

// Get compliance flags
GET /api/admin/compliance?action=compliance-flags

// Get KYC documents
GET /api/admin/compliance?action=kyc-documents
```

### System Announcements
```typescript
// Get all announcements
GET /api/admin/announcements?status=active

// Create announcement
POST /api/admin/announcements
Body: {
  title: string,
  message: string,
  severity: "info" | "warning" | "urgent",
  target_roles: string[],
  expires_at?: string
}

// Update announcement
PUT /api/admin/announcements/{id}
Body: { is_active?: boolean, expires_at?: string }

// Delete announcement
DELETE /api/admin/announcements/{id}
```

## Future Enhancements

### Planned Features
1. **Advanced Analytics**: Detailed user behavior analysis
2. **Automated Actions**: Rule-based compliance responses
3. **Integration APIs**: Connect with external systems
4. **Mobile Admin App**: Native iOS/Android administration
5. **AI Fraud Detection**: Machine learning risk models

### Scalability Improvements
1. **Database Sharding**: Handle larger user bases
2. **Microservices**: Separate admin services
3. **CDN Integration**: Faster global performance
4. **Real-time Updates**: WebSocket-based live data

---

## Quick Reference

### Emergency Contacts
- **Technical Support**: tech-support@imaginethisauction.com
- **Security Team**: security@imaginethisauction.com
- **Platform Admin**: admin@imaginethisauction.com

### Key Shortcuts
- **Admin Dashboard**: `/admin`
- **User Search**: Use email or name fragments
- **Quick Actions**: Right-click context menus
- **Bulk Operations**: Select multiple items

### Important Notes
- All admin actions are logged for compliance
- User suspensions take effect immediately
- Financial reports update in real-time
- Compliance flags require manual resolution
- System announcements support markdown formatting

**Last Updated**: December 2024
**Version**: 1.0
**Document Owner**: Platform Administration Team