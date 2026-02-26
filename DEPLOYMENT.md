# OpenCode Cloud Deployment Guide

## Overview
Deploy OpenCode as a cloud service (like Lovable) with frontend, backend API, and database.

## Architecture
```
Web UI (Solid.js)     → Frontend Host (Vercel/Netlify)
API Server (Hono)     → App Server (Railway/Render/Fly.io)
PostgreSQL DB         → Database Host (Supabase/Railway/PlanetScale)
```

## Recommended Stack

### **Frontend**
- **Host**: Vercel, Netlify, or Cloudflare Pages
- **Build**: `bun run build:web`
- **Framework**: Solid.js
- **Package**: `packages/app`

### **Backend API**
- **Host**: Railway, Render, Fly.io, or AWS
- **Runtime**: Bun on Node.js
- **Framework**: Hono
- **Package**: `packages/opencode`
- **Port**: 3000 (or configurable)

### **Database**
- **Type**: PostgreSQL
- **Host**: Supabase, Railway, PlanetScale, or AWS RDS
- **Connection**: Via `DATABASE_URL` env var

## Deployment Steps

### Step 1: Frontend Deployment (Vercel)

```bash
# Build the web app
cd packages/app
bun run build

# Deploy to Vercel
vercel deploy
```

### Step 2: Backend Deployment (Railway)

```bash
# Build the backend
cd packages/opencode
bun run build

# Set environment variables:
DATABASE_URL=postgresql://user:pass@host/db
NODE_ENV=production
API_KEY=your-secret-key
```

### Step 3: Database Setup (Supabase)

1. Create Supabase project
2. Get `DATABASE_URL`
3. Run migrations: `bun run db:migrate`
4. Set up authentication (optional)

## Environment Variables

Required for production:
```env
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-domain.com
API_KEY=secret-key
LLM_API_KEY=your-llm-key
```

## Docker Build (for any platform)

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install
EXPOSE 3000
CMD ["bun", "run", "dev"]
```

## Production Checklist

- [ ] Database backups enabled
- [ ] CORS configured for frontend domain
- [ ] Environment variables secured (no secrets in repo)
- [ ] API rate limiting enabled
- [ ] HTTPS/TLS configured
- [ ] Health check endpoint created
- [ ] Monitoring/logging set up
- [ ] Error tracking (Sentry)
- [ ] CDN for static assets
- [ ] Database connection pooling
- [ ] Auto-scaling configured

## Cost Estimation (Monthly)

- **Frontend** (Vercel): $0-20
- **Backend** (Railway): $5-50
- **Database** (Supabase): $25-100
- **Storage/CDN**: $5-20
- **Total**: $35-190/month (startup tier)

## Next Steps

1. Choose hosting providers
2. Set up database
3. Configure environment variables
4. Deploy frontend
5. Deploy backend
6. Test integrations
7. Set up monitoring
8. Configure billing alerts
