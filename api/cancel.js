import { isRateLimited, APPS_SCRIPT_URL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are allowed.'
    });
  }

  // Rate limit: max 10 cancel attempts per minute per IP
  if (isRateLimited(req, 10)) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many cancellation attempts. Please wait a moment and try again.'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // use raw body
      }
    }

    const { bookingId } = body || {};

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_BOOKING_ID',
        message: 'Booking ID is required to cancel an appointment.'
      });
    }

    const cleanId = String(bookingId).trim().toUpperCase();

    const payload = {
      action: 'cancel',
      bookingId: cleanId
    };

    const queryParams = new URLSearchParams(payload);
    const gasResponse = await fetch(`${APPS_SCRIPT_URL}?${queryParams.toString()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await gasResponse.json();

    if (data && data.success === false) {
      return res.status(400).json(data);
    }

    return res.status(200).json(data || { success: true, bookingId: cleanId, message: 'Appointment cancelled successfully.' });
  } catch (error) {
    console.error('API /api/cancel error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to cancel appointment on server.'
    });
  }
}
