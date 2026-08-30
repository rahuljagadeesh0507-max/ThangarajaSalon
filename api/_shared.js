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

// Service Duration mapping in minutes
export const SERVICE_DURATIONS = {
  "hair cut": 30,
  "trim": 30,
  "shaving": 30,
  "normal hair cut + shaving": 30,
  "detan": 30,
  "bleach": 30,
  "facial": 60,
  "hair spa": 90,
  "straightening": 120,
  "smoothing": 90,
  "curling": 150
};

export function getServiceDuration(treatmentName) {
  if (!treatmentName) return 30;
  const key = String(treatmentName).trim().toLowerCase();
  return SERVICE_DURATIONS[key] || 30;
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridian = match[3].toUpperCase();

  if (meridian === "PM" && h < 12) h += 12;
  if (meridian === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export function isIntervalOverlapping(startA, durA, startB, durB) {
  const endA = startA + durA;
  const endB = startB + durB;
  return Math.max(startA, startB) < Math.min(endA, endB);
}

export function checkScheduleBoundaries(slotMins, durationMins) {
  const endMins = slotMins + durationMins;

  // Morning: 08:00 AM (480) - 01:30 PM (810)
  if (slotMins >= 480 && slotMins < 810) {
    if (endMins > 810) {
      return { valid: false, error: "BREAK_CONFLICT", message: "Treatment duration overlaps with Afternoon Break (1:30 PM - 3:00 PM)." };
    }
    return { valid: true };
  }

  // Inside Break: 01:30 PM (810) - 03:00 PM (900)
  if (slotMins >= 810 && slotMins < 900) {
    return { valid: false, error: "INSIDE_BREAK", message: "Cannot book appointments during Afternoon Break (1:30 PM - 3:00 PM)." };
  }

  // Evening: 03:00 PM (900) - 10:00 PM (1320)
  if (slotMins >= 900 && slotMins < 1320) {
    if (endMins > 1320) {
      return { valid: false, error: "CLOSING_CONFLICT", message: "Treatment duration extends past Salon Closing Time (10:00 PM)." };
    }
    return { valid: true };
  }

  return { valid: false, error: "OUTSIDE_HOURS", message: "Selected time is outside salon operating hours." };
}
