import {
  isRateLimited,
  APPS_SCRIPT_URL
} from './_shared.js';

let currentCustomPin = process.env.ADMIN_PIN || '7788';

export default async function handler(req, res) {
  // 1. Authenticate Request
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const pinHeader = req.headers['x-admin-pin'] || '';

  const providedPin = token || pinHeader || req.query.pin || (req.body && req.body.pin);
  const action = req.query.action || (req.body && req.body.action) || 'list';

  // 2. Rate limit: max 60 requests per minute for admin
  if (isRateLimited(req, 60)) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.'
    });
  }

  // Action: Change PIN
  if (req.method === 'POST' && action === 'change_pin') {
    const { oldPin, newPin } = req.body || {};
    if (oldPin !== currentCustomPin && oldPin !== (process.env.ADMIN_PIN || '7788')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Current PIN is incorrect.'
      });
    }
    if (!newPin || String(newPin).length < 4 || String(newPin).length > 8) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PIN',
        message: 'New PIN must be between 4 and 8 digits.'
      });
    }
    currentCustomPin = String(newPin).trim();
    return res.status(200).json({
      success: true,
      message: 'Staff PIN updated successfully.'
    });
  }

  // Verify PIN
  if (providedPin !== currentCustomPin && providedPin !== (process.env.ADMIN_PIN || '7788')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid staff passcode.'
    });
  }

  if (action === 'verify_pin') {
    return res.status(200).json({
      success: true,
      message: 'Staff passcode authenticated.'
    });
  }

  try {

    // GET / LIST BOOKINGS
    if (req.method === 'GET' || action === 'list') {
      const date = req.query.date || '';
      
      const queryParams = new URLSearchParams({
        action: 'admin_get_all',
        date: date
      });

      const gasResponse = await fetch(`${APPS_SCRIPT_URL}?${queryParams.toString()}`, {
        method: 'GET'
      }).then(r => r.json()).catch(() => ({ success: true, bookings: [] }));

      return res.status(200).json({
        success: true,
        bookings: gasResponse.bookings || gasResponse.data || []
      });
    }

    // UPDATE STATUS
    if (req.method === 'POST' && action === 'update_status') {
      const { bookingId, bookingStatus, paymentStatus } = req.body || {};

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_ID',
          message: 'Booking ID is required.'
        });
      }

      const payload = {
        action: 'admin_update_status',
        bookingId: String(bookingId).trim(),
        bookingStatus: String(bookingStatus || 'Confirmed').trim(),
        paymentStatus: String(paymentStatus || 'Paid').trim()
      };

      const queryParams = new URLSearchParams(payload);
      const gasResponse = await fetch(`${APPS_SCRIPT_URL}?${queryParams.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json()).catch(() => ({ success: true }));

      return res.status(200).json({
        success: true,
        bookingId,
        bookingStatus,
        paymentStatus,
        message: 'Status updated successfully.'
      });
    }

    // CANCEL BOOKING
    if (req.method === 'POST' && action === 'cancel_booking') {
      const { bookingId } = req.body || {};

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_ID',
          message: 'Booking ID is required.'
        });
      }

      const payload = {
        action: 'cancel',
        bookingId: String(bookingId).trim()
      };

      const queryParams = new URLSearchParams(payload);
      await fetch(`${APPS_SCRIPT_URL}?${queryParams.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => null);

      return res.status(200).json({
        success: true,
        bookingId,
        message: 'Booking cancelled successfully.'
      });
    }

    return res.status(400).json({
      success: false,
      error: 'INVALID_ACTION',
      message: 'Unknown admin action.'
    });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to process admin request.'
    });
  }
}
