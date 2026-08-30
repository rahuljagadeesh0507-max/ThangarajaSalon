/**
 * Thangaraja Salon - UI Rendering & View Controller
 * (Minimal Luxury Shop-Based Aesthetic)
 */

import { CONFIG, SERVICES, OPERATING_SLOTS } from './config.js';
import { getSlotAvailabilityStatus, parseTimeToMinutes, getTreatmentDuration } from './duration.js';
import {
  bookingState,
  selectTreatment as stateSelectTreatment,
  selectDate as stateSelectDate,
  selectTime as stateSelectTime,
  setCustomer,
  setPayment,
  getAllBookingsForDate
} from './state.js';
import { fetchServerBookedSlots, cancelRemoteBooking } from './api.js';

let countdownInterval = null;

/**
 * Renders all 11 treatment cards dynamically into #treatments-grid-container.
 */
export function renderTreatments() {
  const container = document.getElementById("treatments-grid-container");
  if (!container) return;

  container.innerHTML = "";

  SERVICES.forEach(service => {
    const isSelected = (bookingState.treatment === service.name);
    const card = document.createElement("div");
    card.className = `treatment-card ${isSelected ? "selected" : ""}`;
    card.dataset.serviceId = service.id;

    const startingHtml = service.isStarting
      ? `<span class="price-onwards">onwards</span>`
      : "";

    card.innerHTML = `
      <div class="treatment-info">
        <div class="treatment-icon">
          ${service.icon}
        </div>
        <div>
          <h4 class="treatment-name">${service.name}</h4>
          <p class="treatment-meta">${service.desc} • ${service.durationLabel}</p>
        </div>
      </div>
      <div class="treatment-right">
        <div class="treatment-price-wrap">
          <span class="treatment-price">₹${service.price} ${startingHtml}</span>
        </div>
        <div class="select-radio">
          <span class="select-radio-inner"></span>
        </div>
      </div>
    `;

    card.onclick = () => onTreatmentCardClick(service.name, service.price, card);
    container.appendChild(card);
  });
}

/**
 * Handles treatment card selection and reactive slot validation.
 */
export function onTreatmentCardClick(name, price, cardElement) {
  const result = stateSelectTreatment(name, price);

  document.querySelectorAll(".treatment-card").forEach(c => c.classList.remove("selected"));
  if (cardElement) cardElement.classList.add("selected");

  if (result.slotInvalidated) {
    showToast(
      `Selected time (${result.previousTime}) was cleared because ${name} requires ${result.newDurationLabel} and overlaps break or closing time.`,
      "warning"
    );
  }

  renderTimeSlots();
  updateSummary();
}

/**
 * Renders EXACTLY 3 rolling date selector cards (Today, Tomorrow, Day 3).
 */
export function renderDatePills(baseDate = new Date()) {
  const tabsContainer = document.getElementById("quick-date-tabs");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";

  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Configure native date picker bounds (Today to Today + 2 days)
  const nativeInput = document.getElementById("native-date-input");
  const today = new Date(baseDate);
  const maxDay = new Date(baseDate);
  maxDay.setDate(baseDate.getDate() + (CONFIG.MAX_BOOKING_DAYS_AHEAD - 1));

  const tYear = today.getFullYear();
  const tMonth = String(today.getMonth() + 1).padStart(2, '0');
  const tDay = String(today.getDate()).padStart(2, '0');
  const minIsoStr = `${tYear}-${tMonth}-${tDay}`;

  const mYear = maxDay.getFullYear();
  const mMonth = String(maxDay.getMonth() + 1).padStart(2, '0');
  const mDay = String(maxDay.getDate()).padStart(2, '0');
  const maxIsoStr = `${mYear}-${mMonth}-${mDay}`;

  if (nativeInput) {
    nativeInput.min = minIsoStr;
    nativeInput.max = maxIsoStr;
    if (bookingState.date) {
      nativeInput.value = bookingState.date;
    }
  }

  // Generate strictly 3 rolling days
  for (let i = 0; i < CONFIG.MAX_BOOKING_DAYS_AHEAD; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoStr = `${year}-${month}-${day}`;
    const displayStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

    const isTuesday = (d.getDay() === 2);
    const isSelected = (isoStr === bookingState.date);

    const pill = document.createElement("div");

    let dayLabel = "TODAY";
    if (i === 1) dayLabel = "TOMORROW";
    if (i === 2) dayLabel = daysOfWeek[d.getDay()];

    if (isTuesday) {
      pill.className = "date-pill holiday-pill";
      pill.innerHTML = `
        <div class="date-weekday" style="color:var(--error); font-weight:700;">TUE (${dayLabel})</div>
        <div class="date-day" style="color:var(--text-muted);">${d.getDate()}</div>
        <div class="date-month" style="color:var(--error); font-size:0.7rem; font-weight:800;">CLOSED</div>
      `;
      pill.onclick = () => showToast("Tuesday is our weekly holiday (Closed). Please choose another day.", "warning");
    } else {
      pill.className = `date-pill ${isSelected ? "selected" : ""}`;
      pill.innerHTML = `
        <div class="date-weekday">${dayLabel}</div>
        <div class="date-day">${d.getDate()}</div>
        <div class="date-month">${months[d.getMonth()]}</div>
      `;
      pill.onclick = () => onDatePillClick(isoStr, displayStr);
    }

    tabsContainer.appendChild(pill);
  }
}

/**
 * Handles date pill selection.
 */
export async function onDatePillClick(isoStr, displayStr) {
  const chosen = new Date(isoStr + "T00:00:00");
  if (chosen.getDay() === 2) {
    showToast("Tuesday is our weekly holiday (Closed). Please select another day.", "warning");
    return;
  }

  stateSelectDate(isoStr, displayStr);

  const nativeInput = document.getElementById("native-date-input");
  if (nativeInput) nativeInput.value = isoStr;

  renderDatePills(new Date());
  renderTimeSlots();
  updateSummary();

  await fetchServerBookedSlots(isoStr);
  renderTimeSlots();
}

/**
 * Handles manual native date picker change with 3-day window validation.
 */
export async function onManualDateChange(selectedIso) {
  if (!selectedIso) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxAllowed = new Date(today);
  maxAllowed.setDate(today.getDate() + (CONFIG.MAX_BOOKING_DAYS_AHEAD - 1));

  const chosen = new Date(selectedIso + "T00:00:00");

  if (chosen < today) {
    showToast("Cannot select past dates.", "error");
    const nativeInput = document.getElementById("native-date-input");
    if (nativeInput) nativeInput.value = bookingState.date;
    return;
  }

  if (chosen > maxAllowed) {
    showToast("Bookings are only accepted up to 3 days in advance.", "warning");
    const nativeInput = document.getElementById("native-date-input");
    if (nativeInput) nativeInput.value = bookingState.date;
    return;
  }

  if (chosen.getDay() === 2) {
    showToast("Tuesday is our weekly holiday (Closed). Please choose any day from Wednesday to Monday.", "warning");
    const nativeInput = document.getElementById("native-date-input");
    if (nativeInput) nativeInput.value = bookingState.date;
    return;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const displayStr = `${chosen.getDate()} ${months[chosen.getMonth()]} ${chosen.getFullYear()}`;

  await onDatePillClick(selectedIso, displayStr);
}

/**
 * Renders all time slots with duration-aware collision and boundary detection.
 */
export function renderTimeSlots() {
  const container = document.getElementById("slots-container");
  const dateSubtitle = document.getElementById("slot-subtitle-date");
  if (!container) return;

  container.innerHTML = "";
  if (dateSubtitle) {
    dateSubtitle.textContent = `Showing slots for: ${bookingState.displayDate || bookingState.date || 'Today'} (${bookingState.treatment} • ${bookingState.durationLabel})`;
  }

  // Check Tuesday closure
  if (bookingState.date) {
    const chosen = new Date(bookingState.date + "T00:00:00");
    if (chosen.getDay() === 2) {
      container.innerHTML = `
        <div class="holiday-closed-banner">
          <div class="closed-icon">🔒</div>
          <h4 class="closed-title">Salon Closed on Tuesdays</h4>
          <p class="closed-desc">Tuesday is our scheduled weekly holiday. Please choose any other day in our 3-day window.</p>
        </div>
      `;
      return;
    }
  }

  const allBookings = getAllBookingsForDate(bookingState.date);

  OPERATING_SLOTS.forEach(slot => {
    const status = getSlotAvailabilityStatus(
      slot,
      bookingState.treatment,
      bookingState.date,
      allBookings
    );

    const isSelected = (bookingState.time === slot && status.available);

    const slotBtn = document.createElement("button");
    slotBtn.type = "button";

    const btnClasses = ["time-slot-btn"];

    if (!status.available) {
      slotBtn.disabled = true;
      if (status.reason === "EXPIRED") {
        btnClasses.push("expired");
      } else if (status.reason === "OCCUPIED") {
        btnClasses.push("booked");
      } else if (status.reason === "BREAK_CONFLICT" || status.reason === "INSIDE_BREAK") {
        btnClasses.push("break-conflict");
      } else if (status.reason === "CLOSING_CONFLICT" || status.reason === "OUTSIDE_HOURS") {
        btnClasses.push("closing-conflict");
      } else {
        btnClasses.push("disabled");
      }
    } else if (isSelected) {
      btnClasses.push("selected");
    }

    slotBtn.className = btnClasses.join(" ");

    slotBtn.innerHTML = `
      <span class="slot-time">${slot}</span>
      <span class="slot-status-label">${isSelected ? "Selected" : status.label}</span>
    `;

    if (status.available) {
      slotBtn.onclick = () => {
        stateSelectTime(slot);
        renderTimeSlots();
        updateSummary();
      };
    }

    container.appendChild(slotBtn);
  });
}

/**
 * Updates the summary sidebar and prices.
 */
export function updateSummary() {
  const nameInput = document.getElementById("cust-name");
  const emailInput = document.getElementById("cust-email");
  const phoneInput = document.getElementById("cust-phone");

  if (nameInput || emailInput || phoneInput) {
    setCustomer(
      nameInput ? nameInput.value : bookingState.name,
      emailInput ? emailInput.value : bookingState.email,
      phoneInput ? phoneInput.value : bookingState.phone
    );
  }

  const elTreatment = document.getElementById("sum-treatment");
  const elDate = document.getElementById("sum-date");
  const elTime = document.getElementById("sum-time");
  const elCustomer = document.getElementById("sum-customer");
  const elPayment = document.getElementById("sum-payment");
  const elPaymentStatus = document.getElementById("sum-payment-status");
  const elTotal = document.getElementById("sum-total");

  if (elTreatment) elTreatment.textContent = `${bookingState.treatment} (${bookingState.durationLabel})`;
  if (elDate) elDate.textContent = bookingState.displayDate || bookingState.date || "Today";
  if (elTime) {
    elTime.textContent = bookingState.time ? bookingState.time : "Please select slot";
    elTime.style.color = bookingState.time ? "var(--text-gold)" : "var(--accent-gold-light)";
  }

  if (elCustomer) {
    elCustomer.textContent = bookingState.name
      ? `${bookingState.name} (${bookingState.phone || 'No phone'})`
      : "—";
  }

  if (elPayment) elPayment.textContent = bookingState.paymentMethod;
  if (elPaymentStatus) elPaymentStatus.textContent = bookingState.paymentStatus;
  if (elTotal) elTotal.textContent = `₹${bookingState.price}`;
}

/**
 * Wizard stepper navigation with validation.
 */
export function goToBookingStep(stepNumber) {
  if (bookingState.date) {
    const chosen = new Date(bookingState.date + "T00:00:00");
    if (chosen.getDay() === 2) {
      showToast("Cannot book on Tuesdays (Weekly Holiday). Please select another date.", "warning");
      return;
    }
  }

  if (stepNumber >= 2 && !bookingState.time) {
    showToast("Please choose an available time slot first", "error");
    return;
  }

  if (stepNumber >= 3 && (!bookingState.name || !bookingState.email || !bookingState.phone)) {
    showToast("Please complete your name, email, and 10-digit mobile number", "error");
    return;
  }

  bookingState.currentStep = stepNumber;

  for (let i = 1; i <= 4; i++) {
    const tab = document.getElementById(`tab-step-${i}`);
    const view = document.getElementById(`view-step-${i}`);

    if (tab && view) {
      tab.classList.remove("active", "completed");
      view.classList.remove("active");

      if (i === stepNumber) {
        tab.classList.add("active");
        view.classList.add("active");
      } else if (i < stepNumber) {
        tab.classList.add("completed");
      }
    }
  }

  const appWrap = document.querySelector(".booking-app-wrapper") || document.getElementById("booking-app");
  if (appWrap) {
    appWrap.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * Generates UPI Deep Link URI.
 */
export function getUpiDeepLink(booking) {
  const vpa = CONFIG.UPI_VPA;
  const name = encodeURIComponent(CONFIG.SALON_NAME);
  const amount = booking.price || 130;
  const tr = booking.bookingId || "TRS";
  const note = encodeURIComponent(`Booking ${tr}`);
  return `upi://pay?pa=${vpa}&pn=${name}&am=${amount}&tr=${tr}&tn=${note}&cu=INR`;
}

/**
 * Helper to generate Google Calendar Event URL.
 */
export function getGoogleCalendarUrl(booking) {
  if (!booking.date || !booking.time) return "#";

  const slotMins = parseTimeToMinutes(booking.time);
  const durMins = booking.durationMins || getTreatmentDuration(booking.treatment);
  const endMins = slotMins + durMins;

  const dateClean = booking.date.replace(/-/g, "");

  const startH = String(Math.floor(slotMins / 60)).padStart(2, '0');
  const startM = String(slotMins % 60).padStart(2, '0');
  const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
  const endM = String(endMins % 60).padStart(2, '0');

  const startIso = `${dateClean}T${startH}${startM}00`;
  const endIso = `${dateClean}T${endH}${endM}00`;

  const title = encodeURIComponent(`${CONFIG.SALON_NAME}: ${booking.treatment}`);
  const details = encodeURIComponent(
    `Confirmed Appointment at ${CONFIG.SALON_NAME}\n` +
    `Booking ID: #${booking.bookingId}\n` +
    `Treatment: ${booking.treatment} (${booking.durationLabel || '30 mins'})\n` +
    `Total: ₹${booking.price}\n\n` +
    `📌 Important: Please arrive 10 minutes early at the salon!`
  );
  const location = encodeURIComponent(`${CONFIG.SALON_ADDRESS}`);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
}

/**
 * Helper to generate Apple Calendar / Outlook iCal (.ics) file.
 */
export function downloadIcsFile(booking) {
  if (!booking.date || !booking.time) return;

  const slotMins = parseTimeToMinutes(booking.time);
  const durMins = booking.durationMins || getTreatmentDuration(booking.treatment);
  const endMins = slotMins + durMins;

  const dateClean = booking.date.replace(/-/g, "");
  const startH = String(Math.floor(slotMins / 60)).padStart(2, '0');
  const startM = String(slotMins % 60).padStart(2, '0');
  const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
  const endM = String(endMins % 60).padStart(2, '0');

  const icsData = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Thangaraja Salon//Appointment Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.bookingId || 'booking'}@thangarajasalon.com`,
    `DTSTAMP:${dateClean}T000000Z`,
    `DTSTART:${dateClean}T${startH}${startM}00`,
    `DTEND:${dateClean}T${endH}${endM}00`,
    `SUMMARY:${CONFIG.SALON_NAME} - ${booking.treatment}`,
    `DESCRIPTION:Confirmed Booking #${booking.bookingId}\\nTreatment: ${booking.treatment}\\nPlease arrive 10 mins early!`,
    `LOCATION:${CONFIG.SALON_ADDRESS}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment Reminder (Arrive 10m early)",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Thangaraja_Salon_${booking.bookingId || 'Appointment'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Starts live countdown to appointment.
 */
export function startLiveCountdown(dateStr, timeStr) {
  if (countdownInterval) clearInterval(countdownInterval);

  const countdownBox = document.getElementById("live-chair-countdown");
  if (!countdownBox) return;

  function update() {
    if (!dateStr || !timeStr) {
      countdownBox.style.display = "none";
      return;
    }

    const slotMins = parseTimeToMinutes(timeStr);
    const targetDate = new Date(`${dateStr}T00:00:00`);
    targetDate.setMinutes(slotMins);

    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
      countdownBox.innerHTML = `<strong>Status:</strong> Ready for Service / Active Now`;
      countdownBox.style.display = "block";
      return;
    }

    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    countdownBox.innerHTML = `⏳ <strong>Chair Opens In:</strong> ${hours > 0 ? `${hours}h ` : ""}${mins} mins (Arrive 10m early)`;
    countdownBox.style.display = "block";
  }

  update();
  countdownInterval = setInterval(update, 60000);
}

/**
 * Displays booking details in Step 4 confirmation screen.
 */
export function displayBookingConfirmation(bookingId) {
  const elConfirmId = document.getElementById("confirm-booking-id");
  const elSumStatus = document.getElementById("sum-booking-status");
  const elWhatsAppBtn = document.getElementById("btn-whatsapp-share");
  const elGCalBtn = document.getElementById("btn-gcal-sync");
  const elIcalBtn = document.getElementById("btn-ical-download");
  const elCancelBtn = document.getElementById("btn-cancel-this-booking");
  const elUpiQrWrap = document.getElementById("upi-qr-section");

  if (elConfirmId) elConfirmId.textContent = `#${bookingId}`;
  if (elSumStatus) {
    elSumStatus.textContent = bookingState.bookingStatus || "Confirmed";
    elSumStatus.className = (bookingState.bookingStatus === "Cancelled")
      ? "badge badge-error"
      : "badge badge-success";
  }

  // Google Calendar URL
  if (elGCalBtn) {
    elGCalBtn.href = getGoogleCalendarUrl(bookingState);
  }

  // iCal Download
  if (elIcalBtn) {
    elIcalBtn.onclick = () => downloadIcsFile(bookingState);
  }

  // Cancel Button
  if (elCancelBtn) {
    if (bookingState.bookingStatus === "Cancelled") {
      elCancelBtn.style.display = "none";
    } else {
      elCancelBtn.style.display = "inline-flex";
      elCancelBtn.onclick = () => promptCancelBooking(bookingId);
    }
  }

  // Dynamic UPI QR & Deep Link Section
  if (elUpiQrWrap) {
    if (bookingState.paymentMethod.includes("UPI") || bookingState.paymentMethod.includes("Online")) {
      const upiUrl = getUpiDeepLink(bookingState);
      const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;

      elUpiQrWrap.innerHTML = `
        <div class="upi-payment-box">
          <div class="upi-header">
            <span class="badge badge-gold">Direct UPI Payment</span>
            <h4 style="font-size:1.05rem; font-weight:700; margin-top:0.4rem;">Scan & Pay ₹${bookingState.price}</h4>
          </div>
          <div class="upi-qr-card">
            <img src="${qrImgUrl}" alt="UPI Payment QR" class="upi-qr-image" width="160" height="160" loading="lazy">
            <div class="upi-apps-row">
              <span>Google Pay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span>
            </div>
          </div>
          <div style="margin-top:0.85rem;">
            <a href="${upiUrl}" class="btn btn-primary" style="width:100%; font-size:0.9rem;">
              ⚡ Pay ₹${bookingState.price} via UPI App
            </a>
          </div>
        </div>
      `;
      elUpiQrWrap.style.display = "block";
    } else {
      elUpiQrWrap.style.display = "none";
    }
  }

  // WhatsApp Alert
  if (elWhatsAppBtn) {
    const msg = encodeURIComponent(
      `Hello ${CONFIG.SALON_NAME}! Here is my confirmed appointment:\n` +
      `Booking ID: #${bookingId}\n` +
      `Treatment: ${bookingState.treatment} (${bookingState.durationLabel})\n` +
      `Date: ${bookingState.displayDate || bookingState.date}\n` +
      `Time: ${bookingState.time}\n` +
      `Total: ₹${bookingState.price}\n` +
      `Payment: ${bookingState.paymentStatus}\n\n` +
      `⏰ Note: Please arrive 10 minutes early at the salon.`
    );
    elWhatsAppBtn.href = `https://wa.me/?text=${msg}`;
  }

  startLiveCountdown(bookingState.date, bookingState.time);
  goToBookingStep(4);
}

/**
 * Prompts customer before executing booking cancellation.
 */
export async function promptCancelBooking(bookingId) {
  const confirmed = confirm(
    `Are you sure you want to cancel appointment #${bookingId}?\n\nThis will immediately release your chair reservation.`
  );
  if (!confirmed) return;

  try {
    showToast("Cancelling appointment...", "info");
    await cancelRemoteBooking(bookingId);
    bookingState.bookingStatus = "Cancelled";

    const elSumStatus = document.getElementById("sum-booking-status");
    if (elSumStatus) {
      elSumStatus.textContent = "Cancelled";
      elSumStatus.className = "badge badge-error";
    }

    const elCancelBtn = document.getElementById("btn-cancel-this-booking");
    if (elCancelBtn) elCancelBtn.style.display = "none";

    const countdownBox = document.getElementById("live-chair-countdown");
    if (countdownBox) countdownBox.style.display = "none";

    showToast(`Appointment #${bookingId} has been successfully cancelled. Your time slot has been released.`, "success");
    await fetchServerBookedSlots(bookingState.date);
    renderTimeSlots();
  } catch (err) {
    showToast(err.message || "Failed to cancel booking. Please try again.", "error");
  }
}

/**
 * Displays booking record details for Status Tracker lookup.
 */
export function displayBookingDetails(booking) {
  bookingState.bookingId = booking.bookingId;
  bookingState.treatment = booking.treatment;
  bookingState.price = booking.price || 130;
  bookingState.date = booking.date;
  bookingState.displayDate = booking.date;
  bookingState.time = booking.time;
  bookingState.name = booking.name;
  bookingState.phone = booking.phone;
  bookingState.paymentMethod = booking.paymentMethod;
  bookingState.paymentStatus = booking.paymentStatus;
  bookingState.bookingStatus = booking.bookingStatus || "Confirmed";

  displayBookingConfirmation(booking.bookingId);
  updateSummary();
}

/**
 * DOM XSS Safe Toast Notification.
 */
export function showToast(message, type = "info") {
  const toastBox = document.getElementById("toast-box");
  if (!toastBox) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  iconSvg.setAttribute("width", "18");
  iconSvg.setAttribute("height", "18");
  iconSvg.setAttribute("viewBox", "0 0 24 24");
  iconSvg.setAttribute("fill", "none");
  iconSvg.setAttribute("stroke", "currentColor");
  iconSvg.setAttribute("stroke-width", "2");
  iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';

  const msgSpan = document.createElement("span");
  msgSpan.textContent = String(message || "");

  toast.appendChild(iconSvg);
  toast.appendChild(msgSpan);
  toastBox.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
