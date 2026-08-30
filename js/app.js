/**
 * Thangaraja Salon - Application Bootstrap & Event Controller
 * (Robust Lifecycle & Minimalist Shop-Based Architecture)
 */

import { CONFIG, SERVICES } from './config.js';
import {
  bookingState,
  selectPayment as stateSelectPayment,
  resetBookingState,
  saveConfirmedBooking
} from './state.js';
import {
  fetchServerBookedSlots,
  submitBooking,
  lookupRemoteBooking
} from './api.js';
import {
  renderTreatments,
  renderDatePills,
  renderTimeSlots,
  updateSummary,
  goToBookingStep,
  displayBookingConfirmation,
  displayBookingDetails,
  showToast,
  onManualDateChange,
  onDatePillClick,
  promptCancelBooking
} from './ui.js';

/**
 * Initializes the salon application immediately or on DOM ready.
 */
function boot() {
  initApp();
  bindEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

async function initApp() {
  const today = new Date();
  let targetDate = new Date(today);

  // If today is Tuesday (closed), advance to Wednesday
  if (targetDate.getDay() === 2) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const isoStr = `${year}-${month}-${day}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const displayStr = `${targetDate.getDate()} ${months[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  // Initialize booking date to today
  bookingState.date = isoStr;
  bookingState.displayDate = (targetDate.getDay() === today.getDay()) ? "Today" : displayStr;

  // Sync native date input bounds and value
  const nativeInput = document.getElementById("native-date-input");
  if (nativeInput) {
    const tYear = today.getFullYear();
    const tMonth = String(today.getMonth() + 1).padStart(2, '0');
    const tDay = String(today.getDate()).padStart(2, '0');
    nativeInput.min = `${tYear}-${tMonth}-${tDay}`;

    const maxDay = new Date(today);
    maxDay.setDate(today.getDate() + (CONFIG.MAX_BOOKING_DAYS_AHEAD - 1));
    const mYear = maxDay.getFullYear();
    const mMonth = String(maxDay.getMonth() + 1).padStart(2, '0');
    const mDay = String(maxDay.getDate()).padStart(2, '0');
    nativeInput.max = `${mYear}-${mMonth}-${mDay}`;

    nativeInput.value = isoStr;
  }

  // Render UI elements
  renderTreatments();
  renderDatePills(today);
  renderTimeSlots();
  updateSummary();

  // Sync real-time booked appointments from server
  try {
    await fetchServerBookedSlots(isoStr);
    renderTimeSlots();
  } catch (e) {
    console.warn("Could not load server slots:", e);
  }
}

function bindEvents() {
  // Navigation stepper tabs
  for (let i = 1; i <= 4; i++) {
    const tab = document.getElementById(`tab-step-${i}`);
    if (tab) {
      tab.addEventListener("click", () => goToBookingStep(i));
    }
  }

  // Stepper Step 1 -> 2
  const btnStep1Next = document.getElementById("btn-step-1-next");
  if (btnStep1Next) {
    btnStep1Next.addEventListener("click", () => {
      if (!bookingState.time) {
        showToast("Please choose an available time slot before proceeding", "error");
        return;
      }
      goToBookingStep(2);
    });
  }

  // Stepper Step 2 -> 3
  const btnStep2Next = document.getElementById("btn-step-2-next");
  if (btnStep2Next) {
    btnStep2Next.addEventListener("click", () => {
      updateSummary();
      if (!bookingState.name || !bookingState.email || !bookingState.phone) {
        showToast("Please fill in your name, email, and mobile number", "error");
        return;
      }
      const cleanPhone = bookingState.phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        showToast("Please enter a valid 10-digit mobile number", "error");
        return;
      }
      goToBookingStep(3);
    });
  }

  // Stepper Step 2 Back -> 1
  const btnStep2Back = document.getElementById("btn-step-2-back");
  if (btnStep2Back) {
    btnStep2Back.addEventListener("click", () => goToBookingStep(1));
  }

  // Stepper Step 3 Back -> 2
  const btnStep3Back = document.getElementById("btn-step-3-back");
  if (btnStep3Back) {
    btnStep3Back.addEventListener("click", () => goToBookingStep(2));
  }

  // Payment Selection Cards
  const payCardOnline = document.getElementById("pay-card-online");
  const payCardSalon = document.getElementById("pay-card-salon");

  if (payCardOnline) {
    payCardOnline.addEventListener("click", () => {
      stateSelectPayment("UPI / Online Payment");
      payCardOnline.classList.add("selected");
      if (payCardSalon) payCardSalon.classList.remove("selected");
      updateSummary();
    });
  }

  if (payCardSalon) {
    payCardSalon.addEventListener("click", () => {
      stateSelectPayment("Pay at Salon");
      payCardSalon.classList.add("selected");
      if (payCardOnline) payCardOnline.classList.remove("selected");
      updateSummary();
    });
  }

  // Final Submit Button
  const btnSubmit = document.getElementById("btn-submit-booking");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", handleFinalSubmit);
  }

  // Book Another Appointment Button
  const btnBookAnother = document.getElementById("btn-book-another");
  if (btnBookAnother) {
    btnBookAnother.addEventListener("click", () => {
      resetBookingState();
      goToBookingStep(1);
      renderTimeSlots();
      updateSummary();
    });
  }

  // Customer Form Inputs live summary sync
  ["cust-name", "cust-email", "cust-phone"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateSummary);
    }
  });

  // Manual Date Input change handler
  const nativeDateInput = document.getElementById("native-date-input");
  if (nativeDateInput) {
    nativeDateInput.addEventListener("change", (e) => onManualDateChange(e.target.value));
  }

  // Track Status Search Button
  const btnLookup = document.getElementById("btn-track-status");
  if (btnLookup) {
    btnLookup.addEventListener("click", handleTrackStatusLookup);
  }

  // Track Status input Enter key
  const inputLookup = document.getElementById("lookup-booking-id");
  if (inputLookup) {
    inputLookup.addEventListener("keyup", (e) => {
      if (e.key === "Enter") handleTrackStatusLookup();
    });
  }
}

async function handleFinalSubmit() {
  const btn = document.getElementById("btn-submit-booking");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle></svg> Processing Booking...`;
  }

  const generatedBookingId = "TRS" + Math.floor(10000 + Math.random() * 90000);
  bookingState.bookingId = generatedBookingId;

  const bookingPayload = {
    action: "book",
    bookingId: generatedBookingId,
    name: bookingState.name,
    email: bookingState.email,
    phone: bookingState.phone.replace(/\D/g, ''),
    treatment: bookingState.treatment,
    durationMins: String(bookingState.durationMins),
    price: String(bookingState.price),
    date: bookingState.date,
    time: bookingState.time,
    paymentMethod: bookingState.paymentMethod,
    paymentStatus: bookingState.paymentStatus
  };

  try {
    await submitBooking(bookingPayload);

    saveConfirmedBooking({
      bookingId: generatedBookingId,
      date: bookingState.date,
      time: bookingState.time,
      treatment: bookingState.treatment,
      durationMins: bookingState.durationMins,
      price: bookingState.price,
      name: bookingState.name,
      email: bookingState.email,
      phone: bookingState.phone,
      paymentMethod: bookingState.paymentMethod,
      paymentStatus: bookingState.paymentStatus,
      bookingStatus: "Confirmed",
      createdAt: new Date().toISOString()
    });

    displayBookingConfirmation(generatedBookingId);
    showToast("Appointment Successfully Booked!", "success");
    await fetchServerBookedSlots(bookingState.date);
    renderTimeSlots();
  } catch (err) {
    if (err.message === "SLOT_TAKEN") {
      showToast("This slot or one of its required duration intervals is already taken. Please choose another time slot.", "error");
      goToBookingStep(1);
      await fetchServerBookedSlots(bookingState.date);
      renderTimeSlots();
    } else if (err.message === "RATE_LIMITED") {
      showToast("Too many booking attempts. Please wait a minute and retry.", "error");
    } else {
      showToast(err.message || "Failed to submit booking. Please try again.", "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Confirm Appointment Booking";
    }
  }
}

async function handleTrackStatusLookup() {
  const input = document.getElementById("lookup-booking-id");
  const id = input ? input.value.trim().replace("#", "").toUpperCase() : "";

  if (!id) {
    showToast("Please enter a Booking ID (e.g. TRS10245)", "error");
    return;
  }

  // 1. Check local cache
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    const stored = JSON.parse(raw || "[]");
    const found = stored.find(b => b.bookingId && b.bookingId.toUpperCase() === id);
    if (found) {
      displayBookingDetails(found);
      showToast(`Found Booking #${found.bookingId}`, "success");
      return;
    }
  } catch (e) {
    console.warn("Local cache lookup error", e);
  }

  // 2. Query remote backend
  try {
    showToast("Searching for booking...", "info");
    const booking = await lookupRemoteBooking(id);
    if (booking) {
      displayBookingDetails(booking);
      showToast(`Found Booking #${booking.bookingId}`, "success");
      return;
    }
  } catch (err) {
    console.warn("Remote lookup error", err);
  }

  showToast(`Booking #${id} was not found. Please verify your Booking ID.`, "error");
}

// Expose globals for external calls
window.goToBookingStep = goToBookingStep;
window.onManualDateChange = onManualDateChange;
window.promptCancelBooking = promptCancelBooking;
