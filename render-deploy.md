# Deploy WhatsApp Auto-Reply to Render

## Quick Setup Guide

### 1. Prepare Your Repository
Your code is already on GitHub at: `https://github.com/samelmayuresh/whatapp.git`

### 2. Deploy to Render

1. **Go to Render**: Visit [render.com](https://render.com) and sign up/login
2. **Connect GitHub**: Link your GitHub account
3. **Create New Web Service**: 
   - Click "New +" → "Web Service"
   - Connect your repository: `samelmayuresh/whatapp`
   - Choose branch: `master`

### 3. Configure Deployment Settings

**Build & Deploy Settings:**
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Instance Type**: `Free` (for testing)

**Environment Variables:**
```
NODE_ENV=production
PORT=10000
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

### 4. Advanced Settings (Optional)

**Health Check:**
- **Health Check Path**: `/health`

**Auto-Deploy:**
- ✅ Enable "Auto-Deploy" for automatic updates when you push to GitHub

### 5. Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes)
3. Your app will be available at: `https://your-app-name.onrender.com`

## Post-Deployment

### Access Your App
- **Web Dashboard**: `https://your-app-name.onrender.com`
- **Health Check**: `https://your-app-name.onrender.com/health`
- **API**: `https://your-app-name.onrender.com/api/status`

### WhatsApp Setup
1. Visit your app URL
2. Scan the QR code with WhatsApp
3. Your bot will be connected and ready!

### Monitor Your App
- **Render Dashboard**: View logs and metrics
- **Built-in Monitoring**: Your app includes health checks and error logging

## Important Notes

### Free Tier Limitations
- **Sleep Mode**: Free apps sleep after 15 minutes of inactivity
- **Monthly Hours**: 750 hours/month limit
- **Cold Starts**: May take 30+ seconds to wake up

### Upgrade Recommendations
For production use, consider upgrading to:
- **Starter Plan ($7/month)**: No sleep, faster performance
- **Standard Plan ($25/month)**: More resources, better reliability

### Persistent Storage
- WhatsApp session data is stored in memory
- Sessions may reset when the app restarts
- For persistent sessions, upgrade to a paid plan with disk storage

## Troubleshooting

### Common Issues
1. **Build Fails**: Check Node.js version compatibility
2. **WhatsApp Won't Connect**: Verify Puppeteer configuration
3. **App Sleeps**: Upgrade to paid plan or use external monitoring

### Getting Help
- Check Render logs in the dashboard
- Review your app's health check endpoint
- Monitor error logs in the web interface

## Success! 🎉

Your WhatsApp Auto-Reply system is now live on Render!

**Next Steps:**
1. Test the QR code scanning
2. Send test messages
3. Configure your auto-reply templates
4. Monitor performance and logs