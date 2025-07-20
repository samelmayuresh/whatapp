// Vercel API endpoint for status
export default function handler(req, res) {
  res.status(200).json({
    status: 'online',
    message: 'WhatsApp Auto-Reply Dashboard (Vercel)',
    timestamp: new Date().toISOString(),
    note: 'WhatsApp bot functionality not available on Vercel - use Render instead'
  });
}