// Minimal in-memory sliding-window rate limiter for admin-key attempts.
// Single-process/in-memory by design (Render runs one instance on the current plan) —
// counters reset on redeploy/restart, which is fine for its purpose: slowing down
// brute-force guessing of ADMIN_SECRET_KEY, not distributed rate limiting.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 20;

const attemptsByIp = new Map(); // ip -> array of timestamps (ms)

function pruneOld(timestamps, now) {
  while (timestamps.length && now - timestamps[0] > WINDOW_MS) timestamps.shift();
}

// Call BEFORE checking the admin key. Returns true (and sends 429) if the caller
// should be blocked. Only failed attempts count against the limit — a correct key
// never adds to the counter, so a legitimate admin is never locked out by their own use.
function adminRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let timestamps = attemptsByIp.get(ip);
  if (!timestamps) {
    timestamps = [];
    attemptsByIp.set(ip, timestamps);
  }
  pruneOld(timestamps, now);

  if (timestamps.length >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts, please try again later.' });
  }

  // Record this attempt only if it turns out to be wrong — patch the admin-key
  // check to call `recordFailedAttempt(req)` on rejection.
  req._rateLimitRecord = () => {
    const arr = attemptsByIp.get(ip) || [];
    arr.push(Date.now());
    attemptsByIp.set(ip, arr);
  };
  next();
}

module.exports = { adminRateLimit };
