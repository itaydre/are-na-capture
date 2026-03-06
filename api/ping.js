// Vercel serverless function to track extension installs
// Uses Vercel KV or falls back to logging

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { event, extensionId } = req.body || {};
    console.log(`[ping] event=${event} id=${extensionId} time=${new Date().toISOString()}`);
    return res.status(200).json({ ok: true });
  }

  // GET returns install count from logs (manual check via Vercel dashboard)
  return res.status(200).json({ message: 'Check Vercel logs for install events' });
};
