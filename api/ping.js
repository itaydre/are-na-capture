// Vercel serverless function to track extension installs and auth events
// Uses Upstash Redis for persistent storage

const { Redis } = require('@upstash/redis');

let redis;
try {
  redis = Redis.fromEnv();
} catch (e) {
  redis = null;
}

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

    if (redis) {
      try {
        if (event === 'auth') {
          await redis.sadd('auth:users', extensionId);
          await redis.incr('auth:count');
        } else if (event === 'install') {
          await redis.sadd('install:users', extensionId);
          await redis.incr('install:count');
        } else if (event === 'update') {
          await redis.sadd('update:users', extensionId);
          await redis.incr('update:count');
        }
      } catch (err) {
        console.error('[ping] Redis write failed:', err.message);
      }
    }

    return res.status(200).json({ ok: true });
  }

  // GET returns stats
  if (redis) {
    try {
      const [authUnique, authTotal, installUnique, installTotal, updateUnique, updateTotal] =
        await Promise.all([
          redis.scard('auth:users'),
          redis.get('auth:count'),
          redis.scard('install:users'),
          redis.get('install:count'),
          redis.scard('update:users'),
          redis.get('update:count'),
        ]);

      return res.status(200).json({
        auth: { unique: authUnique || 0, total: authTotal || 0 },
        install: { unique: installUnique || 0, total: installTotal || 0 },
        update: { unique: updateUnique || 0, total: updateTotal || 0 },
      });
    } catch (err) {
      console.error('[ping] Redis read failed:', err.message);
    }
  }

  return res.status(200).json({ message: 'Redis not configured — check Vercel logs for events' });
};
