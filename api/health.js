// Vercel health check endpoint
export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    service: 'WhatsApp Auto-Reply Dashboard',
    platform: 'Vercel',
    limitations: [
      'No WhatsApp bot functionality',
      'Dashboard only',
      'Use Render for full functionality'
    ],
    timestamp: new Date().toISOString()
  });
}