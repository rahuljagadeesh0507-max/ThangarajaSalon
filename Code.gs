/**
 * Thangaraja Salon - Google Apps Script Backend (Phase 1 Hardened)
 * 
 * Features:
 * - Anti-Formula Injection (CSV/Spreadsheet injection defense)
 * - Atomic Concurrency Locking (LockService) to prevent slot collision
 * - Complete 12-Column Schema with zero data loss
 * - Dynamic Booked Slots querying and Real Booking Lookup
 */

const HEADERS = [
  "Timestamp",
  "Booking ID",
  "Name",
  "Email",
  "Phone",
  "Treatment",
  "Price",
  "Date",
  "Time",
  "Payment Method",
  "Payment Status",
  "Booking Status"
];

function getResponsesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Responses");

  if (!sheet) {
    sheet = ss.insertSheet("Responses");
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  } else if (sheet.getLastColumn() < HEADERS.length) {
    // If existing sheet has older 4-column schema, upgrade header row
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }

  return sheet;
}

/**
 * Sanitizes input to prevent spreadsheet formula injection attacks (=, +, -, @, tab, cr).
 */
function sanitizeSpreadsheetInput_(val) {
  const str = String(val === undefined || val === null ? "" : val).trim();
  if (/^[=\+\-\@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function formatCellString_(val, isDate = false) {
  if (val instanceof Date) {
    if (isDate) {
      return Utilities.formatDate(val, "Asia/Kolkata", "yyyy-MM-dd");
    }
    return Utilities.formatDate(val, "Asia/Kolkata", "hh:mm a");
  }
  return String(val || "").trim();
}

function isSlotAvailable_(sheet, dateStr, timeStr) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return true;

  const targetDate = String(dateStr || "").trim();
  const targetTime = String(timeStr || "").trim().toUpperCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = formatCellString_(row[7], true);
    const rowTime = formatCellString_(row[8], false).toUpperCase();
    const rowStatus = String(row[11] || "").trim().toLowerCase();

    if (rowDate === targetDate && rowTime === targetTime && rowStatus !== "cancelled") {
      return false; // Slot already taken
    }
  }
  return true;
}

function getBookedSlotsForDate_(sheet, dateStr) {
  const data = sheet.getDataRange().getValues();
  const booked = [];
  if (data.length <= 1) return booked;

  const targetDate = String(dateStr || "").trim();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = formatCellString_(row[7], true);
    const rowTime = formatCellString_(row[8], false);
    const rowStatus = String(row[11] || "").trim().toLowerCase();

    if (rowDate === targetDate && rowStatus !== "cancelled" && rowTime) {
      booked.push(rowTime);
    }
  }
  return booked;
}

function lookupBooking_(sheet, bookingId) {
  const searchId = String(bookingId || "").trim().toUpperCase();
  if (!searchId) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowId = String(row[1] || "").trim().toUpperCase();
    if (rowId === searchId) {
      return {
        timestamp: row[0],
        bookingId: row[1],
        name: row[2],
        email: row[3],
        phone: row[4],
        treatment: row[5],
        price: row[6],
        date: row[7],
        time: row[8],
        paymentMethod: row[9],
        paymentStatus: row[10],
        bookingStatus: row[11]
      };
    }
  }
  return null;
}

function saveBooking_(params) {
  const name = sanitizeSpreadsheetInput_(params.name);
  const email = sanitizeSpreadsheetInput_(params.email);
  const phone = sanitizeSpreadsheetInput_(params.phone);
  const treatment = sanitizeSpreadsheetInput_(params.treatment || "Hair Cut");
  const price = sanitizeSpreadsheetInput_(params.price || "130");
  const date = sanitizeSpreadsheetInput_(params.date);
  const time = sanitizeSpreadsheetInput_(params.time);
  const paymentMethod = sanitizeSpreadsheetInput_(params.paymentMethod || "Online Payment");
  const paymentStatus = sanitizeSpreadsheetInput_(
    params.paymentStatus || (paymentMethod === "Online Payment" ? "Pending Verification" : "Pay at Salon")
  );
  const bookingId = sanitizeSpreadsheetInput_(
    params.bookingId || ("TRS" + Math.floor(10000 + Math.random() * 90000))
  );
  const bookingStatus = "Confirmed";

  if (!name || !email || !phone || !date || !time) {
    return {
      success: false,
      error: "MISSING_FIELDS",
      message: "Name, email, phone, date, and time are required."
    };
  }

  // Atomic Lock to prevent concurrent double-bookings
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10 second timeout
  } catch (e) {
    return {
      success: false,
      error: "LOCK_TIMEOUT",
      message: "Server is busy processing other appointments. Please try again."
    };
  }

  try {
    const sheet = getResponsesSheet_();

    if (!isSlotAvailable_(sheet, date, time)) {
      return {
        success: false,
        error: "SLOT_TAKEN",
        message: "This slot is already booked. Please choose another time slot."
      };
    }

    sheet.appendRow([
      new Date(),
      bookingId,
      name,
      email,
      phone,
      treatment,
      price,
      date,
      time,
      paymentMethod,
      paymentStatus,
      bookingStatus
    ]);

    return {
      success: true,
      bookingId: bookingId,
      treatment: treatment,
      price: price,
      date: date,
      time: time,
      paymentStatus: paymentStatus,
      bookingStatus: bookingStatus
    };
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest_(e) {
  try {
    let params = {};
    if (e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        params = e.parameter || {};
      }
    } else if (e && e.parameter) {
      params = e.parameter;
    }

    const action = String(params.action || "book").toLowerCase();
    const sheet = getResponsesSheet_();

    if (action === "get_booked_slots") {
      const dateStr = String(params.date || "").trim();
      const slots = getBookedSlotsForDate_(sheet, dateStr);
      return jsonOutput_({ success: true, date: dateStr, bookedSlots: slots });
    }

    if (action === "lookup") {
      const booking = lookupBooking_(sheet, params.bookingId);
      if (booking) {
        return jsonOutput_({ success: true, booking: booking });
      } else {
        return jsonOutput_({ success: false, error: "NOT_FOUND", message: "Booking ID not found." });
      }
    }

    const result = saveBooking_(params);
    return jsonOutput_(result);
  } catch (error) {
    return jsonOutput_({ success: false, error: "SERVER_ERROR", message: error.toString() });
  }
}

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}
