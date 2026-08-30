/**
 * Thangaraja Salon - API Client & Backend Proxy
 */

import { CONFIG } from './config.js';
import { setServerBookedList, cancelLocalBooking } from './state.js';

export const IS_HTTP_HOSTED = typeof window !== "undefined" && window.location.protocol.startsWith("http");

/**
 * Fetches booked slots/appointments for a given date.
 */
export async function fetchServerBookedSlots(dateStr) {
  if (!dateStr) return [];
  try {
    const slotsUrl = IS_HTTP_HOSTED
      ? `/api/slots?date=${encodeURIComponent(dateStr)}`
      : `${CONFIG.SCRIPT_URL}?action=get_booked_slots&date=${encodeURIComponent(dateStr)}`;

    const response = await fetch(slotsUrl);
    const data = await response.json();

    if (data && data.success && Array.isArray(data.bookedSlots)) {
      setServerBookedList(data.bookedSlots);
      return data.bookedSlots;
    }
  } catch (e) {
    console.warn("Could not sync server slots in real-time:", e);
  }
  return [];
}

/**
 * Submits a new booking to the serverless proxy / Google Sheets backend.
 */
export async function submitBooking(bookingPayload) {
  const bookUrl = IS_HTTP_HOSTED
    ? "/api/book"
    : `${CONFIG.SCRIPT_URL}?${new URLSearchParams(bookingPayload).toString()}`;

  const response = await fetch(bookUrl, {
    method: "POST",
    body: JSON.stringify(bookingPayload),
    headers: { "Content-Type": "application/json" }
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  const data = await response.json().catch(() => null);

  if (data && data.success === false) {
    if (data.error === "SLOT_TAKEN" || response.status === 409) {
      throw new Error("SLOT_TAKEN");
    }
    throw new Error(data.message || data.error || "BOOKING_FAILED");
  }

  return data || { success: true, bookingId: bookingPayload.bookingId };
}

/**
 * Looks up an authentic booking record by Booking ID.
 */
export async function lookupRemoteBooking(bookingId) {
  const cleanId = String(bookingId || "").trim().toUpperCase();
  const lookupUrl = IS_HTTP_HOSTED
    ? `/api/lookup?id=${encodeURIComponent(cleanId)}`
    : `${CONFIG.SCRIPT_URL}?action=lookup&bookingId=${encodeURIComponent(cleanId)}`;

  const response = await fetch(lookupUrl);
  if (!response.ok) {
    throw new Error(`LOOKUP_HTTP_${response.status}`);
  }

  const data = await response.json();
  if (data && data.success && data.booking) {
    return data.booking;
  }

  return null;
}

/**
 * Cancels a booking in the backend and marks local cache as cancelled.
 */
export async function cancelRemoteBooking(bookingId) {
  const cleanId = String(bookingId || "").trim().toUpperCase();
  const cancelUrl = IS_HTTP_HOSTED
    ? "/api/cancel"
    : `${CONFIG.SCRIPT_URL}?action=cancel&bookingId=${encodeURIComponent(cleanId)}`;

  const response = await fetch(cancelUrl, {
    method: "POST",
    body: JSON.stringify({ action: "cancel", bookingId: cleanId }),
    headers: { "Content-Type": "application/json" }
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  const data = await response.json().catch(() => null);

  if (data && data.success === false) {
    throw new Error(data.message || data.error || "CANCEL_FAILED");
  }

  cancelLocalBooking(cleanId);
  return data || { success: true, bookingId: cleanId };
}
