import { isRateLimited, APPS_SCRIPT_URL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only GET requests are allowed.'
    });
  }

  // Rate limit: max 20 lookups per minute per IP
  if (isRateLimited(req, 20)) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Rate limit exceeded. Please wait a moment.'
    });
  }

  const { id } = req.query || {};
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_ID',
      message: 'Booking ID is required.'
    });
  }

  try {
    const gasResponse = await fetch(
      `${APPS_SCRIPT_URL}?action=lookup&bookingId=${encodeURIComponent(String(id).trim().toUpperCase())}`
    );
    const data = await gasResponse.json();

    if (data && data.success && data.booking) {
      return res.status(200).json(data);
    } else {
      return res.status(404).json(
        data || { success: false, error: 'NOT_FOUND', message: 'Booking ID not found.' }
      );
    }
  } catch (error) {
    console.error('API /api/lookup error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to query booking record.'
    });
  }
}
