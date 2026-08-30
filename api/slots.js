import { isRateLimited, APPS_SCRIPT_URL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only GET requests are allowed.'
    });
  }

  // Rate limit: max 30 slot checks per minute per IP
  if (isRateLimited(req, 30)) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Rate limit exceeded. Please wait a moment.'
    });
  }

  const { date } = req.query || {};
  if (!date) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_DATE',
      message: 'Date parameter is required (YYYY-MM-DD).'
    });
  }

  try {
    const gasResponse = await fetch(
      `${APPS_SCRIPT_URL}?action=get_booked_slots&date=${encodeURIComponent(String(date).trim())}`
    );
    const data = await gasResponse.json();

    // Cache at edge for 10 seconds, stale-while-revalidate for 30 seconds
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json(data);
  } catch (error) {
    console.error('API /api/slots error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve booked slots.'
    });
  }
}
