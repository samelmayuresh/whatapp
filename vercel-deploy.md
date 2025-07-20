# Deploy to Vercel (Dashboard Only)

## ⚠️ Important Limitations

**This Vercel deployment only provides:**
- ✅ Web dashboard interface
- ✅ Configuration management UI
- ✅ Activity log viewer
- ❌ **NO WhatsApp bot functionality**
- ❌ **NO auto-reply features**
- ❌ **NO message processing**

**For full WhatsApp bot functionality, use [Render deployment](./render-deploy.md) instead.**

## Quick Vercel Deployment

### 1. Deploy to Vercel

**Option A: One-Click Deploy**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/samelmayuresh/whatapp)

**Option B: Manual Deploy**
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repo: `samelmayuresh/whatapp`
4. Click "Deploy"

### 2. Configuration

**Build Settings:**
- Framework Preset: `Other`
- Build Command: `npm run build` (optional)
- Output Directory: `public`
- Install Command: `npm install`

**Environment Variables:**
```
NODE_ENV=production
```

### 3. Access Your Dashboard

After deployment, your dashboard will be available at:
`https://your-project-name.vercel.app`

**Available Endpoints:**
- `/` - Main dashboard
- `/api/status` - Service status
- `/api/health` - Health check

## What Works on Vercel

✅ **Web Interface**
- Configuration dashboard
- Message template editor
- Settings management
- Activity log viewer

✅ **API Endpoints**
- Status checking
- Health monitoring
- Configuration management

## What Doesn't Work on Vercel

❌ **WhatsApp Integration**
- No QR code generation
- No WhatsApp Web connection
- No message receiving/sending
- No auto-reply functionality

❌ **Background Services**
- No persistent connections
- No continuous monitoring
- No session management

## Why These Limitations Exist

**Vercel Serverless Constraints:**
- 10-second function timeout (60s on Pro)
- No persistent processes
- No WebSocket persistence
- Limited browser automation support

**WhatsApp Requirements:**
- Continuous WebSocket connection
- Persistent browser session
- Long-running processes
- Real-time message handling

## Recommended Solution

**For Full Functionality:** Use [Render deployment](./render-deploy.md)

**Render provides:**
- ✅ Persistent processes
- ✅ Full WhatsApp integration
- ✅ Continuous operation
- ✅ WebSocket support
- ✅ Browser automation
- ✅ Session persistence

## Vercel Use Cases

**Good for:**
- Testing the web interface
- Demonstrating the dashboard
- Configuration management
- Static content serving

**Not good for:**
- Production WhatsApp bots
- Auto-reply functionality
- Message processing
- Continuous operation

## Next Steps

1. **Try the Dashboard**: Deploy to Vercel to see the interface
2. **For Production**: Deploy to Render for full functionality
3. **Hybrid Approach**: Use Vercel for dashboard + Render for bot

Choose the deployment method that matches your needs!