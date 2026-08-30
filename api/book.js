import { isRateLimited, APPS_SCRIPT_URL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are allowed.'
    });
  }

  // Rate limit: max 5 bookings per minute per IP
  if (isRateLimited(req, 5)) {
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many booking attempts. Please wait a moment and try again.'
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

    const {
      name,
      email,
      phone,
      date,
      time,
      treatment,
      price,
      paymentMethod,
      paymentStatus,
      bookingId
    } = body || {};

    if (!name || !email || !phone || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Name, email, phone, date, and time are required.'
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PHONE',
        message: 'Please provide a valid 10-digit mobile number.'
      });
    }

    const payload = {
      action: 'book',
      bookingId: bookingId || ('TRS' + Math.floor(10000 + Math.random() * 90000)),
      name: String(name).trim(),
      email: String(email).trim(),
      phone: cleanPhone,
      treatment: String(treatment || 'Basic Hair Cut').trim(),
      price: String(price || '150').trim(),
      date: String(date).trim(),
      time: String(time).trim(),
      paymentMethod: String(paymentMethod || 'Online Payment').trim(),
      paymentStatus: String(paymentStatus || 'Pending Verification').trim()
    };

    const queryParams = new URLSearchParams(payload);
    const gasResponse = await fetch(`${APPS_SCRIPT_URL}?${queryParams.toString()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await gasResponse.json();

    if (data && data.success === false) {
      if (data.error === 'SLOT_TAKEN') {
        return res.status(409).json(data);
      }
      return res.status(400).json(data);
    }

    return res.status(200).json(data || { success: true, bookingId: payload.bookingId });
  } catch (error) {
    console.error('API /api/book error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to process booking on server.'
    });
  }
}
