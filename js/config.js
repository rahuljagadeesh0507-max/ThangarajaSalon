/**
 * Thangaraja Salon - Global Configuration & Services Catalog
 */

export const CONFIG = {
  SALON_NAME: "Thangaraja Men's Salon",
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzqF35_WZsrH5-bVPYWaPYP20DklEfmxLd8uc78BYtOS4UAFtjUrHE0nqFMLoIeB06W2Q/exec",
  CASHFREE_PAYMENT_URL: "https://payments.cashfree.com/forms/getaudit",
  STORAGE_KEY_BOOKINGS: "thangaraja_salon_confirmed_bookings",

  // Operating Schedule Constants (in minutes from midnight)
  SCHEDULE: {
    MORNING_OPEN_MINS: 480,    // 08:00 AM
    MORNING_CLOSE_MINS: 810,   // 01:30 PM (Break starts)
    BREAK_START_MINS: 810,     // 01:30 PM
    BREAK_END_MINS: 900,       // 03:00 PM (Evening resumes)
    EVENING_OPEN_MINS: 900,    // 03:00 PM
    EVENING_CLOSE_MINS: 1320,  // 10:00 PM (Salon closes, last 30m slot is 9:30 PM)
    SLOT_STEP_MINS: 30,
    TUESDAY_CLOSED: true
  }
};

// Base operating slots for selection
export const OPERATING_SLOTS = [
  "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM",
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM",
  // 01:30 PM - 03:00 PM Afternoon Break
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM",
  "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
  "09:00 PM", "09:30 PM"
];

// Full 11 Salon Services Catalog with Duration in Minutes
export const SERVICES = [
  {
    id: "haircut",
    name: "Hair Cut",
    price: 130,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Classic precision haircut & styling finish",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line></svg>`
  },
  {
    id: "trim",
    name: "Trim",
    price: 80,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Quick hair or beard trimming & sharp lines",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`
  },
  {
    id: "shaving",
    name: "Shaving",
    price: 60,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Traditional hot towel razor shave & soothing balm",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`
  },
  {
    id: "haircut_shaving",
    name: "Normal Hair Cut + Shaving",
    price: 200,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Precision haircut paired with fresh clean shave",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><path d="M16 16l4 4"></path></svg>`
  },
  {
    id: "detan",
    name: "Detan",
    price: 200,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Skin tan removal, deep cleanse & instant glow",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
  },
  {
    id: "bleach",
    name: "Bleach",
    price: 200,
    durationMins: 30,
    durationLabel: "30 mins",
    isStarting: false,
    desc: "Facial brightening & skin lightening treatment",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`
  },
  {
    id: "facial",
    name: "Facial",
    price: 350,
    durationMins: 60,
    durationLabel: "45 mins – 1 hr",
    isStarting: true,
    desc: "Rejuvenating cleansing, exfoliation & glow",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`
  },
  {
    id: "hair_spa",
    name: "Hair Spa",
    price: 400,
    durationMins: 90,
    durationLabel: "1.5 hrs",
    isStarting: true,
    desc: "Deep conditioning, steam therapy & scalp massage",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`
  },
  {
    id: "straightening",
    name: "Straightening",
    price: 700,
    durationMins: 120,
    durationLabel: "2 hrs",
    isStarting: true,
    desc: "Permanent sleek, ultra-straight hair transformation",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="2" x2="8" y2="22"></line><line x1="12" y1="2" x2="12" y2="22"></line><line x1="16" y1="2" x2="16" y2="22"></line></svg>`
  },
  {
    id: "smoothing",
    name: "Smoothing",
    price: 800,
    durationMins: 90,
    durationLabel: "1.5 hrs",
    isStarting: true,
    desc: "Frizz-free silky smooth keratin texture treatment",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M2 6h20M2 18h20"></path></svg>`
  },
  {
    id: "curling",
    name: "Curling",
    price: 800,
    durationMins: 150,
    durationLabel: "2.5 hrs",
    isStarting: true,
    desc: "Professional volume bounce & defined wave curling",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 15.36L12 21"></path><path d="M12 7a5 5 0 0 1 5 5 5 5 0 0 1-3.54 4.78"></path></svg>`
  }
];
