/**
 * Thangaraja Salon - UI Rendering & View Controller
 */

import { CONFIG, SERVICES, OPERATING_SLOTS } from './config.js';
import { getSlotAvailabilityStatus } from './duration.js';
import {
  bookingState,
  selectTreatment as stateSelectTreatment,
  selectDate as stateSelectDate,
  selectTime as stateSelectTime,
  setCustomer,
  setPayment,
  getAllBookingsForDate
} from './state.js';
import { fetchServerBookedSlots } from './api.js';

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
      `Selected time (${result.previousTime}) was cleared because ${name} requires ${result.newDurationLabel} and would overlap with break or closing time.`,
      "warning"
    );
  }

  renderTimeSlots();
  updateSummary();
}

/**
 * Renders 7 date selector pills (Today + 6 days).
 */
export function renderDatePills(baseDate) {
  const tabsContainer = document.getElementById("quick-date-tabs");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";

  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < 7; i++) {
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

    if (isTuesday) {
      pill.className = "date-pill holiday-pill";
      pill.innerHTML = `
        <div class="date-weekday" style="color:var(--error); font-weight:700;">TUE</div>
        <div class="date-day" style="color:var(--text-muted);">${d.getDate()}</div>
        <div class="date-month" style="color:var(--error); font-size:0.65rem; font-weight:800;">CLOSED</div>
      `;
      pill.onclick = () => showToast("Tuesday is our weekly holiday (Closed). Please select another day.", "warning");
    } else {
      pill.className = `date-pill ${isSelected ? "selected" : ""}`;
      pill.innerHTML = `
        <div class="date-weekday">${i === 0 ? "TODAY" : daysOfWeek[d.getDay()]}</div>
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
 * Handles manual native date picker change.
 */
export async function onManualDateChange(selectedIso) {
  if (!selectedIso) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const chosen = new Date(selectedIso + "T00:00:00");

  if (chosen < today) {
    showToast("Cannot select past dates", "error");
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
          <p class="closed-desc">Tuesday is our scheduled weekly holiday. Please choose any other day (Wednesday to Monday).</p>
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

  const appWrap = document.querySelector(".booking-app-wrapper");
  if (appWrap && window.innerWidth < 768) {
    appWrap.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * Displays booking details in Step 4 confirmation screen.
 */
export function displayBookingConfirmation(bookingId) {
  const elConfirmId = document.getElementById("confirm-booking-id");
  const elSumStatus = document.getElementById("sum-booking-status");
  const elWhatsAppBtn = document.getElementById("btn-whatsapp-share");

  if (elConfirmId) elConfirmId.textContent = `#${bookingId}`;
  if (elSumStatus) {
    elSumStatus.textContent = "Confirmed";
    elSumStatus.className = "badge badge-success";
  }

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

  goToBookingStep(4);
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
