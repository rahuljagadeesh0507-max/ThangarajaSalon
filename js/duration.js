/**
 * Thangaraja Salon - Duration & Collision Math Engine
 */

import { CONFIG, SERVICES } from './config.js';

/**
 * Converts "08:30 AM" or "1:30 PM" to minutes from midnight (0 to 1439).
 */
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

/**
 * Converts minutes from midnight (e.g. 510) to formatted string "08:30 AM".
 */
export function formatMinutesToTime(totalMins) {
  let h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const meridian = h >= 12 ? "PM" : "AM";

  if (h > 12) h -= 12;
  if (h === 0) h = 12;

  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  return `${hStr}:${mStr} ${meridian}`;
}

/**
 * Finds the duration in minutes for a given service name.
 */
export function getTreatmentDuration(treatmentName) {
  if (!treatmentName) return 30;
  const normalized = String(treatmentName).trim().toLowerCase();
  const service = SERVICES.find(s => s.name.toLowerCase() === normalized);
  return service ? service.durationMins : 30;
}

/**
 * Checks if two half-open intervals [startA, startA + durA) and [startB, startB + durB) overlap.
 */
export function isIntervalOverlapping(startA, durA, startB, durB) {
  const endA = startA + durA;
  const endB = startB + durB;
  return Math.max(startA, startB) < Math.min(endA, endB);
}

/**
 * Checks if candidate appointment [slotMins, slotMins + durationMins)
 * respects Afternoon Break and Closing Time rules.
 */
export function isSlotWithinOperatingHours(slotMins, durationMins) {
  const endMins = slotMins + durationMins;
  const {
    MORNING_OPEN_MINS,
    MORNING_CLOSE_MINS,
    BREAK_START_MINS,
    BREAK_END_MINS,
    EVENING_OPEN_MINS,
    EVENING_CLOSE_MINS
  } = CONFIG.SCHEDULE;

  // 1. Morning slot check
  if (slotMins >= MORNING_OPEN_MINS && slotMins < MORNING_CLOSE_MINS) {
    // Must finish at or before Break Start
    if (endMins > MORNING_CLOSE_MINS) {
      return { valid: false, reason: "BREAK_CONFLICT", label: "Overlaps Break" };
    }
    return { valid: true };
  }

  // 2. Break time check (cannot start inside break)
  if (slotMins >= BREAK_START_MINS && slotMins < BREAK_END_MINS) {
    return { valid: false, reason: "INSIDE_BREAK", label: "Break Time" };
  }

  // 3. Evening slot check
  if (slotMins >= EVENING_OPEN_MINS && slotMins < EVENING_CLOSE_MINS) {
    // Must finish at or before Salon Closing Time
    if (endMins > EVENING_CLOSE_MINS) {
      return { valid: false, reason: "CLOSING_CONFLICT", label: "Past Closing" };
    }
    return { valid: true };
  }

  return { valid: false, reason: "OUTSIDE_HOURS", label: "Closed" };
}

/**
 * Determines if a slot is already in the past for today's date.
 */
export function isSlotExpired(slotStr, selectedDateStr) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (selectedDateStr > todayStr) return false;
  if (selectedDateStr < todayStr) return true;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = parseTimeToMinutes(slotStr);
  return slotMinutes <= currentMinutes;
}

/**
 * Checks if candidate appointment [slotMins, slotMins + durationMins)
 * collides with any existing confirmed booking on that date.
 */
export function isCollidingWithBookings(slotMins, durationMins, bookedList) {
  if (!Array.isArray(bookedList) || bookedList.length === 0) return false;

  for (const booking of bookedList) {
    let bStart = 0;
    let bDur = 30;

    if (typeof booking === 'string') {
      bStart = parseTimeToMinutes(booking);
      bDur = 30; // default 30 mins if raw string
    } else if (typeof booking === 'object' && booking !== null) {
      bStart = parseTimeToMinutes(booking.time || booking.start || "");
      bDur = booking.durationMins || getTreatmentDuration(booking.treatment || "");
    }

    if (isIntervalOverlapping(slotMins, durationMins, bStart, bDur)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates the full availability status of a candidate slot.
 * Returns: { available: boolean, reason: string, label: string }
 */
export function getSlotAvailabilityStatus(slotStr, treatmentName, selectedDateStr, allBookings) {
  // 1. Tuesday check
  if (selectedDateStr) {
    const d = new Date(selectedDateStr + "T00:00:00");
    if (d.getDay() === 2) {
      return { available: false, reason: "TUESDAY_CLOSED", label: "Tue Closed" };
    }
  }

  // 2. Expired check
  if (isSlotExpired(slotStr, selectedDateStr)) {
    return { available: false, reason: "EXPIRED", label: "Expired" };
  }

  const slotMins = parseTimeToMinutes(slotStr);
  const durationMins = getTreatmentDuration(treatmentName);

  // 3. Operating Boundary check (Break & Closing)
  const boundaryCheck = isSlotWithinOperatingHours(slotMins, durationMins);
  if (!boundaryCheck.valid) {
    return { available: false, reason: boundaryCheck.reason, label: boundaryCheck.label };
  }

  // 4. Collision with existing confirmed bookings
  if (isCollidingWithBookings(slotMins, durationMins, allBookings)) {
    return { available: false, reason: "OCCUPIED", label: "Booked" };
  }

  return { available: true, reason: "AVAILABLE", label: "Available" };
}
