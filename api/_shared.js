// In-memory sliding-window IP rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

export function isRateLimited(req, maxRequests = 10) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const clientIp = Array.isArray(ip) ? ip[0] : String(ip).split(',')[0].trim();
  const now = Date.now();

  const record = rateLimitMap.get(clientIp);
  if (!record || (now - record.timestamp) > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { count: 1, timestamp: now });
    return false;
  }

  if (record.count >= maxRequests) {
    return true;
  }

  record.count += 1;
  return false;
}

export const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbzqF35_WZsrH5-bVPYWaPYP20DklEfmxLd8uc78BYtOS4UAFtjUrHE0nqFMLoIeB06W2Q/exec";
