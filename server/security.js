// Zero-dependency production security headers & sliding-window rate limiters

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
  res.removeHeader('X-Powered-By');
  next();
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests. Please slow down.' } = {}) {
  const hits = new Map();

  // Periodic cleanup to keep memory flat on free-tier servers
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, Math.min(windowMs, 5 * 60 * 1000));
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    // Exempt local automated verification loops only if explicitly tested under same key? Keep strict by IP+path bucket
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || ''}`;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      return res.status(429).json({ error: message, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) });
    }
    next();
  };
}

module.exports = {
  securityHeaders,
  createRateLimiter
};
