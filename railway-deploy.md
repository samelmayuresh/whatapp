# Railway Deployment Guide

## Quick Deploy Steps

### 1. Sign Up for Railway
- Go to [railway.app](https://railway.app)
- Sign up with your GitHub account (free)
- You get $5/month free credits

### 2. Deploy from GitHub
1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose your repository: `samelmayuresh/whatapp`
4. Railway will automatically detect it's a Node.js project

### 3. Environment Variables (Important!)
Add these in Railway dashboard under "Variables":
```
NODE_ENV=production
PORT=3000
```

### 4. Domain Setup
- Railway provides a free domain: `yourapp.railway.app`
- Custom domains available on paid plans

## What Railway Provides (Free Tier)
- ✅ $5/month credits (enough for small apps)
- ✅ Persistent storage for WhatsApp sessions
- ✅ 24/7 uptime
- ✅ Automatic HTTPS
- ✅ Easy deployments from GitHub
- ✅ Built-in monitoring

## Alternative Free Options

### Render.com
- 750 hours/month free
- Automatic deploys from GitHub
- Good for WhatsApp bots

### Heroku (Limited Free)
- 550 hours/month free
- Sleeps after 30 minutes of inactivity
- Not ideal for WhatsApp (needs to stay awake)

## Deployment Commands
```bash
# Commit your Railway config
git add railway.json Procfile .railwayignore railway-deploy.md
git commit -m "Add Railway deployment config"
git push origin master
```

## Post-Deployment
1. Check Railway logs for any errors
2. Visit your app URL to see the web dashboard
3. WhatsApp will generate QR code in logs
4. Scan QR code with your phone to connect

## Troubleshooting
- Check Railway logs if deployment fails
- Ensure all dependencies are in package.json
- WhatsApp session data persists between deployments