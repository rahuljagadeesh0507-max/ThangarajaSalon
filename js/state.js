/**
 * Thangaraja Salon - Booking State Management
 */

import { CONFIG, SERVICES, STYLISTS } from './config.js';
import { getSlotAvailabilityStatus } from './duration.js';

export const bookingState = {
  treatment: "Hair Cut",
  price: 130,
  durationMins: 30,
  durationLabel: "30 mins",
  stylist: "First Available Pro",
  date: "",           // YYYY-MM-DD
  displayDate: "",    // e.g. "28 Aug 2026"
  time: "",           // e.g. "09:30 AM"
  name: "",
  email: "",
  phone: "",
  paymentMethod: "Online Payment",
  paymentStatus: "Pending Verification",
  bookingStatus: "Confirmed",
  bookingId: "",
  currentStep: 1
};

export let serverBookedList = [];

export function setServerBookedList(list) {
  serverBookedList = Array.isArray(list) ? list : [];
}

export function getLocalBookings(dateStr) {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    const stored = JSON.parse(raw || "[]");
    return stored.filter(b => b.date === dateStr && b.bookingStatus !== "Cancelled");
  } catch (e) {
    return [];
  }
}

export function getAllBookingsForDate(dateStr) {
  const localList = getLocalBookings(dateStr);
  return [...localList, ...serverBookedList];
}

export function saveConfirmedBooking(booking) {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    const stored = JSON.parse(raw || "[]");
    // Remove if already exists to overwrite
    const filtered = stored.filter(b => b.bookingId !== booking.bookingId);
    filtered.push(booking);
    localStorage.setItem(CONFIG.STORAGE_KEY_BOOKINGS, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to save booking in local storage", e);
  }
}

export function cancelLocalBooking(bookingId) {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    const stored = JSON.parse(raw || "[]");
    const target = stored.find(b => b.bookingId && b.bookingId.toUpperCase() === String(bookingId).toUpperCase());
    if (target) {
      target.bookingStatus = "Cancelled";
      localStorage.setItem(CONFIG.STORAGE_KEY_BOOKINGS, JSON.stringify(stored));
    }
  } catch (e) {
    console.error("Failed to cancel booking in local storage", e);
  }
}

/**
 * Updates selected treatment and re-validates the active time slot.
 */
export function selectTreatment(treatmentName, price) {
  const service = SERVICES.find(s => s.name === treatmentName) || {
    name: treatmentName,
    price: price,
    durationMins: 30,
    durationLabel: "30 mins"
  };

  bookingState.treatment = service.name;
  bookingState.price = price !== undefined ? price : service.price;
  bookingState.durationMins = service.durationMins;
  bookingState.durationLabel = service.durationLabel;

  let slotInvalidated = false;
  const previousTime = bookingState.time;

  if (bookingState.time && bookingState.date) {
    const allBookings = getAllBookingsForDate(bookingState.date);
    const status = getSlotAvailabilityStatus(
      bookingState.time,
      bookingState.treatment,
      bookingState.date,
      allBookings
    );

    if (!status.available) {
      bookingState.time = "";
      slotInvalidated = true;
    }
  }

  return { slotInvalidated, previousTime, newDurationLabel: service.durationLabel };
}

export function selectStylist(stylistName) {
  bookingState.stylist = String(stylistName || "First Available Pro").trim();
}

export function selectDate(isoStr, displayStr) {
  bookingState.date = isoStr;
  bookingState.displayDate = displayStr;
  bookingState.time = ""; // reset selected time
}

export function selectTime(timeStr) {
  bookingState.time = timeStr;
}

export function setCustomer(name, email, phone) {
  bookingState.name = String(name || "").trim();
  bookingState.email = String(email || "").trim();
  bookingState.phone = String(phone || "").trim();
}

export function setPayment(method) {
  bookingState.paymentMethod = method;
  bookingState.paymentStatus = (method === "Online Payment")
    ? "Pending Verification"
    : "Pay at Salon";
}

export function resetBookingState() {
  bookingState.time = "";
  bookingState.currentStep = 1;
}
