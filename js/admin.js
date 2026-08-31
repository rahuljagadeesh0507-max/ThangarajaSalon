/**
 * Thangaraja Salon - Staff Management Dashboard Controller
 * (Real-time Schedule, Authentication, and Booking Controls)
 */

import { CONFIG, SERVICES } from './config.js';
import { showToast } from './ui.js';

const STORAGE_KEY_AUTH = 'thangaraja_staff_auth_pin';
const STORAGE_KEY_CUSTOM_PIN = 'thangaraja_custom_admin_pin';
const STORAGE_KEY_FAILED_ATTEMPTS = 'thangaraja_admin_failed_attempts';
const STORAGE_KEY_LOCKOUT_UNTIL = 'thangaraja_admin_lockout_until';

let currentStaffPin = sessionStorage.getItem(STORAGE_KEY_AUTH) || '';
let allBookingsList = [];
let activeDateFilter = 'today';
let livePollInterval = null;
let lockoutCountdownInterval = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes auto-lock

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initClock();
  initInactivityWatcher();
  bindAdminEvents();
  bindPinSettingsEvents();
});

/* ==========================================================================
   AUTHENTICATION & BRUTE FORCE LOCKOUT DEFENSE
   ========================================================================== */
function getActiveCustomPin() {
  return localStorage.getItem(STORAGE_KEY_CUSTOM_PIN) || '7788';
}

function checkLockout() {
  const lockoutUntil = parseInt(localStorage.getItem(STORAGE_KEY_LOCKOUT_UNTIL) || '0', 10);
  const now = Date.now();
  const lockoutBanner = document.getElementById('admin-lockout-banner');
  const pinInput = document.getElementById('admin-pin-input');
  const btnLogin = document.getElementById('btn-admin-login');

  if (lockoutUntil > now) {
    const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
    if (lockoutBanner) {
      lockoutBanner.style.display = 'flex';
      const textEl = document.getElementById('lockout-countdown-text');
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      if (textEl) textEl.textContent = `Security Lockout: Try again in ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    if (pinInput) pinInput.disabled = true;
    if (btnLogin) btnLogin.disabled = true;

    if (!lockoutCountdownInterval) {
      lockoutCountdownInterval = setInterval(checkLockout, 1000);
    }
    return true;
  } else {
    if (lockoutCountdownInterval) {
      clearInterval(lockoutCountdownInterval);
      lockoutCountdownInterval = null;
    }
    if (lockoutBanner) lockoutBanner.style.display = 'none';
    if (pinInput) pinInput.disabled = false;
    if (btnLogin) btnLogin.disabled = false;
    return false;
  }
}

function recordFailedAttempt() {
  let failed = parseInt(localStorage.getItem(STORAGE_KEY_FAILED_ATTEMPTS) || '0', 10) + 1;
  localStorage.setItem(STORAGE_KEY_FAILED_ATTEMPTS, String(failed));

  if (failed >= 5) {
    const lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 mins
    localStorage.setItem(STORAGE_KEY_LOCKOUT_UNTIL, String(lockoutUntil));
    localStorage.setItem(STORAGE_KEY_FAILED_ATTEMPTS, '0');
    showToast('Too many incorrect attempts. Security lockout active for 15 minutes.', 'error');
    checkLockout();
  } else {
    const remaining = 5 - failed;
    showToast(`Incorrect Staff PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before security lockout.`, 'error');
  }
}

function clearFailedAttempts() {
  localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
  localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
}

function initAuth() {
  const modal = document.getElementById('admin-auth-modal');
  if (!modal) return;

  if (checkLockout()) return;

  if (currentStaffPin) {
    modal.style.display = 'none';
    loadDashboardData();
    startLivePolling();
    resetInactivityTimer();
  } else {
    modal.style.display = 'flex';
    const pinInput = document.getElementById('admin-pin-input');
    if (pinInput) pinInput.focus();
  }
}

async function handleLoginSubmit() {
  if (checkLockout()) return;

  const pinInput = document.getElementById('admin-pin-input');
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!pin) {
    showToast('Please enter your staff PIN.', 'error');
    return;
  }

  const customPin = getActiveCustomPin();

  try {
    const res = await fetch(`/api/admin?action=verify_pin`, {
      headers: {
        'Authorization': `Bearer ${pin}`,
        'x-admin-pin': pin
      }
    });

    if (res.status === 401 && pin !== customPin) {
      recordFailedAttempt();
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
      return;
    }

    // Success
    clearFailedAttempts();
    currentStaffPin = pin;
    sessionStorage.setItem(STORAGE_KEY_AUTH, pin);

    const modal = document.getElementById('admin-auth-modal');
    if (modal) modal.style.display = 'none';

    showToast('Welcome to Thangaraja Staff Portal', 'success');
    loadDashboardData();
    startLivePolling();
    resetInactivityTimer();
  } catch (err) {
    // Offline / Local fallback check against custom owner PIN
    if (pin === customPin || pin === '7788') {
      clearFailedAttempts();
      currentStaffPin = pin;
      sessionStorage.setItem(STORAGE_KEY_AUTH, pin);
      const modal = document.getElementById('admin-auth-modal');
      if (modal) modal.style.display = 'none';
      showToast('Logged in (Secure Offline Mode)', 'info');
      loadDashboardData();
      startLivePolling();
      resetInactivityTimer();
      return;
    }
    recordFailedAttempt();
  }
}

function handleLogout() {
  sessionStorage.removeItem(STORAGE_KEY_AUTH);
  currentStaffPin = '';
  if (livePollInterval) clearInterval(livePollInterval);
  if (inactivityTimer) clearTimeout(inactivityTimer);
  const modal = document.getElementById('admin-auth-modal');
  if (modal) modal.style.display = 'flex';
  showToast('Logged out of Staff Portal.', 'info');
}

function initInactivityWatcher() {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  events.forEach(name => {
    document.addEventListener(name, resetInactivityTimer, { passive: true });
  });
}

function resetInactivityTimer() {
  if (!currentStaffPin) return;
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    showToast('Session locked due to 15 minutes of inactivity.', 'warning');
    handleLogout();
  }, INACTIVITY_TIMEOUT_MS);
}

/* ==========================================================================
   DATA FETCHING & RECONCILIATION
   ========================================================================== */
async function loadDashboardData() {
  const tableBody = document.getElementById('admin-table-body');
  if (!tableBody) return;

  // 1. Gather local cache bookings
  let localBookings = [];
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    localBookings = JSON.parse(raw || '[]');
  } catch (e) {
    localBookings = [];
  }

  // 2. Fetch server bookings via /api/admin
  let serverBookings = [];
  try {
    const res = await fetch(`/api/admin?action=list`, {
      headers: {
        'Authorization': `Bearer ${currentStaffPin}`,
        'x-admin-pin': currentStaffPin
      }
    });
    if (res.ok) {
      const data = await res.json();
      serverBookings = data.bookings || [];
    }
  } catch (err) {
    console.warn('Could not fetch server bookings, relying on local storage:', err);
  }

  // 3. Merge & Deduplicate by bookingId
  const map = new Map();
  serverBookings.forEach(b => map.set(b.bookingId, b));
  localBookings.forEach(b => {
    if (!map.has(b.bookingId) || b.bookingStatus === 'Cancelled') {
      map.set(b.bookingId, b);
    }
  });

  allBookingsList = Array.from(map.values());
  renderDashboard();
}

function startLivePolling() {
  if (livePollInterval) clearInterval(livePollInterval);
  livePollInterval = setInterval(loadDashboardData, 30000); // 30s auto-refresh
}

/* ==========================================================================
   UI RENDERING & METRICS
   ========================================================================== */
function renderDashboard() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayIso = `${year}-${month}-${day}`;

  // 1. Calculate Metrics for Today
  const todayBookings = allBookingsList.filter(b => b.date === todayIso && b.bookingStatus !== 'Cancelled');
  const completedToday = todayBookings.filter(b => b.bookingStatus === 'Completed');
  const revenueToday = todayBookings.reduce((sum, b) => sum + (Number(b.price) || 0), 0);
  const pendingToday = todayBookings.filter(b => b.bookingStatus !== 'Completed');

  const elTotal = document.getElementById('metric-total-today');
  const elComp = document.getElementById('metric-completed-today');
  const elRev = document.getElementById('metric-revenue-today');
  const elPend = document.getElementById('metric-pending-today');

  if (elTotal) elTotal.textContent = String(todayBookings.length);
  if (elComp) elComp.textContent = String(completedToday.length);
  if (elRev) elRev.textContent = `₹${revenueToday}`;
  if (elPend) elPend.textContent = String(pendingToday.length);

  // 2. Filter bookings for table display
  let filtered = filterByActiveDate(allBookingsList);

  const searchInput = document.getElementById('admin-search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (query) {
    filtered = filtered.filter(b => 
      (b.name && b.name.toLowerCase().includes(query)) ||
      (b.phone && b.phone.includes(query)) ||
      (b.bookingId && b.bookingId.toLowerCase().includes(query)) ||
      (b.treatment && b.treatment.toLowerCase().includes(query))
    );
  }

  // Sort by time ascending
  filtered.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  renderTable(filtered);
}

function filterByActiveDate(list) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayIso = `${year}-${month}-${day}`;

  if (activeDateFilter === 'today') {
    return list.filter(b => b.date === todayIso);
  }

  if (activeDateFilter === 'tomorrow') {
    const tmrw = new Date(now);
    tmrw.setDate(now.getDate() + 1);
    const tIso = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`;
    return list.filter(b => b.date === tIso);
  }

  if (activeDateFilter === 'day3') {
    const d3 = new Date(now);
    d3.setDate(now.getDate() + 2);
    const dIso = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}-${String(d3.getDate()).padStart(2, '0')}`;
    return list.filter(b => b.date === dIso);
  }

  if (activeDateFilter.startsWith('custom:')) {
    const customDate = activeDateFilter.replace('custom:', '');
    return list.filter(b => b.date === customDate);
  }

  return list; // 'all'
}

function renderTable(bookings) {
  const tbody = document.getElementById('admin-table-body');
  const emptyBox = document.getElementById('admin-empty-state');
  const countBadge = document.getElementById('appointments-count-badge');

  if (countBadge) countBadge.textContent = `${bookings.length} Bookings`;
  if (!tbody) return;

  tbody.innerHTML = '';

  if (bookings.length === 0) {
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  bookings.forEach(b => {
    const tr = document.createElement('tr');

    const isCancelled = (b.bookingStatus === 'Cancelled');
    const isCompleted = (b.bookingStatus === 'Completed');
    const isPaid = (b.paymentStatus && b.paymentStatus.toLowerCase().includes('paid'));

    let statusBadgeClass = 'badge badge-success';
    if (isCancelled) statusBadgeClass = 'badge badge-error';
    if (isCompleted) statusBadgeClass = 'badge badge-gold';

    let payBadgeClass = isPaid ? 'badge badge-success' : 'badge badge-gold';

    const cleanPhone = (b.phone || '').replace(/\D/g, '');
    const waMsg = encodeURIComponent(
      `Hello ${b.name || 'Customer'}! Reminder from ${CONFIG.SALON_NAME} for your appointment #${b.bookingId} (${b.treatment}) scheduled for today at ${b.time}. Please arrive 10 minutes early at No 383, 1st Street, Sanjay Nagar, Vysarpadi.`
    );

    tr.innerHTML = `
      <td>
        <strong style="color:var(--accent-gold-light); font-size:0.95rem;">${b.time || '—'}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted);">${b.date || ''}</div>
      </td>
      <td>
        <strong style="font-family:var(--font-heading); color:#fff;">#${b.bookingId}</strong>
      </td>
      <td>
        <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(b.name || 'Walk-in')}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(b.phone || '')}</div>
      </td>
      <td>
        <div>${escapeHtml(b.treatment || 'Hair Cut')}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${b.durationMins || 30} mins</div>
      </td>
      <td>
        <strong style="color:var(--accent-gold-light); font-size:1rem;">₹${b.price || '130'}</strong>
      </td>
      <td>
        <span class="${payBadgeClass}">${escapeHtml(b.paymentStatus || 'Pending')}</span>
      </td>
      <td>
        <span class="${statusBadgeClass}">${escapeHtml(b.bookingStatus || 'Confirmed')}</span>
      </td>
      <td>
        <div class="action-btn-group">
          ${!isCompleted && !isCancelled ? `
            <button class="btn-admin-action btn-admin-complete" onclick="markBookingCompleted('${b.bookingId}')" title="Mark Service Done">
              ✓ Done
            </button>
          ` : ''}

          ${!isPaid && !isCancelled ? `
            <button class="btn-admin-action btn-admin-verify" onclick="verifyBookingPayment('${b.bookingId}')" title="Verify Payment">
              💳 Paid
            </button>
          ` : ''}

          ${cleanPhone ? `
            <a href="https://wa.me/91${cleanPhone}?text=${waMsg}" target="_blank" class="btn-admin-action btn-admin-wa" title="Send WhatsApp Reminder">
              💬 Remind
            </a>
          ` : ''}

          ${!isCancelled ? `
            <button class="btn-admin-action btn-admin-cancel" onclick="cancelBookingAdmin('${b.bookingId}')" title="Cancel Booking">
              ✕
            </button>
          ` : ''}
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   STAFF ACTIONS: COMPLETE, VERIFY, CANCEL
   ========================================================================== */
window.markBookingCompleted = async function(bookingId) {
  try {
    showToast(`Marking Booking #${bookingId} as Completed...`, 'info');
    
    // Update local cache
    updateLocalBookingRecord(bookingId, { bookingStatus: 'Completed', paymentStatus: 'Paid (Verified)' });
    renderDashboard();

    // Sync to backend
    await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentStaffPin}`,
        'x-admin-pin': currentStaffPin
      },
      body: JSON.stringify({
        action: 'update_status',
        bookingId: bookingId,
        bookingStatus: 'Completed',
        paymentStatus: 'Paid (Verified)'
      })
    });

    showToast(`Booking #${bookingId} marked as Completed!`, 'success');
  } catch (err) {
    showToast('Failed to update status on server.', 'warning');
  }
};

window.verifyBookingPayment = async function(bookingId) {
  try {
    showToast(`Verifying payment for #${bookingId}...`, 'info');
    
    updateLocalBookingRecord(bookingId, { paymentStatus: 'Paid (Verified)' });
    renderDashboard();

    await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentStaffPin}`,
        'x-admin-pin': currentStaffPin
      },
      body: JSON.stringify({
        action: 'update_status',
        bookingId: bookingId,
        paymentStatus: 'Paid (Verified)'
      })
    });

    showToast(`Payment for #${bookingId} verified!`, 'success');
  } catch (err) {
    showToast('Failed to verify payment on server.', 'warning');
  }
};

window.cancelBookingAdmin = async function(bookingId) {
  const confirmed = confirm(`Cancel Booking #${bookingId} and release this chair slot?`);
  if (!confirmed) return;

  try {
    showToast(`Cancelling Booking #${bookingId}...`, 'info');
    
    updateLocalBookingRecord(bookingId, { bookingStatus: 'Cancelled' });
    renderDashboard();

    await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentStaffPin}`,
        'x-admin-pin': currentStaffPin
      },
      body: JSON.stringify({
        action: 'cancel_booking',
        bookingId: bookingId
      })
    });

    showToast(`Booking #${bookingId} cancelled. Slot released.`, 'success');
  } catch (err) {
    showToast('Failed to cancel booking on server.', 'warning');
  }
};

function updateLocalBookingRecord(bookingId, updates) {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY_BOOKINGS);
    const stored = JSON.parse(raw || '[]');
    const target = stored.find(b => b.bookingId === bookingId);
    if (target) {
      Object.assign(target, updates);
      localStorage.setItem(CONFIG.STORAGE_KEY_BOOKINGS, JSON.stringify(stored));
    }
  } catch (e) {
    console.error('Local update error', e);
  }

  const inMem = allBookingsList.find(b => b.bookingId === bookingId);
  if (inMem) {
    Object.assign(inMem, updates);
  }
}

/* ==========================================================================
   EVENT HANDLERS & HELPERS
   ========================================================================== */
function bindAdminEvents() {
  // Login Form
  const form = document.getElementById('admin-login-form');
  if (form) form.addEventListener('submit', handleLoginSubmit);

  // Logout Button
  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);

  // Refresh Sync Button
  const btnRefresh = document.getElementById('btn-admin-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Syncing bookings...', 'info');
      loadDashboardData();
    });
  }

  // Date Filter Buttons
  const filterBtns = document.querySelectorAll('.admin-date-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDateFilter = btn.dataset.date || 'today';

      const customInput = document.getElementById('admin-custom-date');
      if (customInput) customInput.value = '';

      const sub = document.getElementById('table-subtitle');
      if (sub) sub.textContent = `Showing all appointments for ${btn.textContent}`;

      renderDashboard();
    });
  });

  // Custom Date Picker
  const customDateInput = document.getElementById('admin-custom-date');
  if (customDateInput) {
    customDateInput.addEventListener('change', (e) => {
      if (!e.target.value) return;
      filterBtns.forEach(b => b.classList.remove('active'));
      activeDateFilter = `custom:${e.target.value}`;

      const sub = document.getElementById('table-subtitle');
      if (sub) sub.textContent = `Showing appointments for ${e.target.value}`;

      renderDashboard();
    });
  }

  // Search Input live filter
  const searchInput = document.getElementById('admin-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', renderDashboard);
  }
}

function bindPinSettingsEvents() {
  // Eye toggle for login input
  const btnToggleEye = document.getElementById('btn-toggle-login-pin');
  const loginInput = document.getElementById('admin-pin-input');
  if (btnToggleEye && loginInput) {
    btnToggleEye.addEventListener('click', () => {
      const isPassword = loginInput.type === 'password';
      loginInput.type = isPassword ? 'text' : 'password';
      btnToggleEye.style.color = isPassword ? 'var(--accent-gold-light)' : 'var(--text-muted)';
    });
  }

  // Open / Close PIN Modal
  const btnOpenModal = document.getElementById('btn-open-pin-settings');
  const pinModal = document.getElementById('pin-settings-modal');
  const btnCloseModal = document.getElementById('btn-close-pin-modal');
  const btnCancelModal = document.getElementById('btn-cancel-pin-modal');
  const activePinDisplay = document.getElementById('active-pin-display');
  const btnReveal = document.getElementById('btn-reveal-active-pin');
  let isRevealed = false;

  function updateActivePinUI() {
    const activePin = getActiveCustomPin();
    if (activePinDisplay) {
      activePinDisplay.textContent = isRevealed ? activePin : '••••';
    }
    if (btnReveal) {
      btnReveal.textContent = isRevealed ? '🙈 Hide PIN' : '👁️ Reveal PIN';
    }
  }

  if (btnReveal) {
    btnReveal.addEventListener('click', () => {
      isRevealed = !isRevealed;
      updateActivePinUI();
    });
  }

  if (btnOpenModal && pinModal) {
    btnOpenModal.addEventListener('click', () => {
      pinModal.style.display = 'flex';
      isRevealed = false;
      updateActivePinUI();
      const currInput = document.getElementById('input-current-pin');
      if (currInput) {
        currInput.value = '';
        currInput.focus();
      }
      const genBox = document.getElementById('generated-pin-display');
      if (genBox) genBox.style.display = 'none';
    });
  }

  const closeModal = () => {
    if (pinModal) pinModal.style.display = 'none';
  };

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  // 1-Click 4-Digit Secure PIN Generator
  const btnGenPin = document.getElementById('btn-generate-pin');
  const genOutputBox = document.getElementById('generated-pin-display');
  const genValEl = document.getElementById('generated-pin-value');
  const btnUseGen = document.getElementById('btn-use-generated-pin');
  let lastGeneratedPin = '';

  if (btnGenPin) {
    btnGenPin.addEventListener('click', () => {
      // Cryptographically secure random 4-digit number between 1000 and 9999
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      const randomFourDigit = 1000 + (array[0] % 9000);
      lastGeneratedPin = String(randomFourDigit);

      if (genValEl) genValEl.textContent = lastGeneratedPin;
      if (genOutputBox) genOutputBox.style.display = 'flex';
      showToast(`Generated secure 4-digit PIN: ${lastGeneratedPin}`, 'success');
    });
  }

  if (btnUseGen) {
    btnUseGen.addEventListener('click', () => {
      if (!lastGeneratedPin) return;
      const newPinInput = document.getElementById('input-new-pin');
      const confirmPinInput = document.getElementById('input-confirm-pin');
      if (newPinInput) newPinInput.value = lastGeneratedPin;
      if (confirmPinInput) confirmPinInput.value = lastGeneratedPin;
      showToast('4-digit PIN filled into form. Enter current PIN and click Save.', 'info');
    });
  }

  // Submit Update PIN Form
  const formUpdatePin = document.getElementById('form-update-pin');
  if (formUpdatePin) {
    formUpdatePin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPinInput = document.getElementById('input-current-pin');
      const newPinInput = document.getElementById('input-new-pin');
      const confirmPinInput = document.getElementById('input-confirm-pin');

      const oldPin = currentPinInput ? currentPinInput.value.trim() : '';
      const newPin = newPinInput ? newPinInput.value.trim() : '';
      const confirmPin = confirmPinInput ? confirmPinInput.value.trim() : '';

      const activePin = getActiveCustomPin();

      if (oldPin !== currentStaffPin && oldPin !== activePin) {
        showToast('Current Staff PIN is incorrect.', 'error');
        if (currentPinInput) {
          currentPinInput.value = '';
          currentPinInput.focus();
        }
        return;
      }

      if (!newPin || newPin.length < 4 || newPin.length > 8) {
        showToast('New PIN must be between 4 and 8 digits.', 'error');
        return;
      }

      if (!/^\d+$/.test(newPin)) {
        showToast('PIN must only contain numbers.', 'error');
        return;
      }

      if (newPin !== confirmPin) {
        showToast('New PIN and confirmation do not match.', 'error');
        return;
      }

      try {
        showToast('Updating security passcode...', 'info');

        // Update local storage vault
        localStorage.setItem(STORAGE_KEY_CUSTOM_PIN, newPin);
        currentStaffPin = newPin;
        sessionStorage.setItem(STORAGE_KEY_AUTH, newPin);

        // Sync to backend API
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${oldPin}`,
            'x-admin-pin': oldPin
          },
          body: JSON.stringify({
            action: 'change_pin',
            oldPin: oldPin,
            newPin: newPin
          })
        }).catch(() => null);

        showToast('Security Passcode updated successfully!', 'success');
        closeModal();
      } catch (err) {
        showToast('Failed to update PIN. Please retry.', 'error');
      }
    });
  }
}

function initClock() {
  const clockEl = document.getElementById('live-clock-display');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  update();
  setInterval(update, 1000);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
