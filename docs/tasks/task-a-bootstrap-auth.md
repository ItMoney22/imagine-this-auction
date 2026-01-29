# Task A - Bootstrap & Auth

## Purpose
Create project scaffolding with Next.js (app dir) and Supabase. Set up authentication (email + magic link), user roles (bidder, auctioneer, admin), and basic navigation with protected routes.

## Scope
- Next.js project setup with TypeScript and Tailwind CSS
- Supabase client configuration
- Authentication system with magic link
- Role-based access control (RBAC)
- Basic navigation and layout
- Protected route middleware
- Admin seed user creation
- Environment configuration and documentation

## Acceptance Criteria
- ✅ Next.js project with app directory structure
- ✅ Supabase auth integration with magic link
- ✅ User roles system (bidder, auctioneer, admin)
- ✅ Protected routes based on authentication and roles
- ✅ Basic responsive navigation component
- ✅ Landing page and authentication pages
- ✅ Environment configuration with .env.example
- ✅ Setup documentation in /docs/SETUP.md
- ✅ Admin seed user script

## Technical Details

### Authentication Flow
1. Email + magic link authentication via Supabase
2. User profile creation with default "bidder" role
3. Role-based redirects after login
4. Session management with middleware

### User Roles
- **Bidder**: Default role, can browse and bid on auctions
- **Auctioneer**: Can create and manage auctions, requires approval
- **Admin**: Full system access, can approve auctioneers and manage settings

### File Structure
```
/apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── onboarding/
│   ├── (dashboard)/
│   │   ├── admin/
│   │   ├── auctioneer/
│   │   └── bidder/
│   ├── auctions/
│   ├── lots/
│   └── layout.tsx
├── components/
│   ├── auth/
│   ├── navigation/
│   └── ui/
├── lib/
│   ├── supabase/
│   └── utils/
└── middleware.ts
```

## Dependencies
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Supabase JS client
- React Hook Form
- Zod for validation

## Status
**Current**: ✅ Completed
**Progress**: 100%

## Completed Tasks
1. ✅ Next.js project initialized with TypeScript and Tailwind CSS
2. ✅ Supabase client configuration (browser, server, middleware)
3. ✅ Authentication system with magic link
4. ✅ Role-based middleware for protected routes
5. ✅ Navigation component with user context
6. ✅ Authentication pages (login, signup, callback)
7. ✅ Basic dashboard structure
8. ✅ Landing page with features and CTAs
9. ✅ Environment configuration and documentation
10. ✅ Setup documentation created

## Files Created
- **Configuration**: `.env.example`, `middleware.ts`
- **Supabase**: `lib/supabase/{client,server,middleware}.ts`
- **Types**: `lib/types/database.ts`
- **Components**: `components/auth/auth-form.tsx`, `components/navigation/navbar.tsx`
- **Pages**: `app/{login,signup,dashboard}/page.tsx`, `app/auth/callback/route.ts`
- **Documentation**: `docs/SETUP.md`

## Dependencies Added
- `@supabase/supabase-js`
- `@supabase/ssr`
- `react-hook-form`
- `@hookform/resolvers`
- `zod`
- `lucide-react`

**Next**: Task B - Schema & Migrations
**Updated**: 2025-09-23