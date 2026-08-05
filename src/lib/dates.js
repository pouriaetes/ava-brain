// Jalali (Persian) calendar conversion and utilities
// Required for accurate birthdays, events, and deadlines per spec

// Jalali to Gregorian conversion using standard algorithm
function jalaliToGregorian(jy, jm, jd) {
  // Algorithm from "Calendrical Calculations" by Dershowitz & Reingold
  const jy1 = jy - 979;
  const jm1 = jm - 1;
  const jd1 = jd - 1;

  const gy = 2820 * jy1 - 471;
  const gm = 10 * jm1 + 53;
  const gd = jd1 + 292;

  let g_day_no = gd - 1 + Math.floor((153 * gm - 183) / 5) + 1521 * gy + 373;
  const week_day_no = (g_day_no - 1) % 7;
  const n = g_day_no;

  const n1 = Math.floor((n - 1) / 1461);
  const n2 = n - 1461 * n1;
  const n3 = Math.floor((n2 - 1) / 365);
  const n4 = n2 - 365 * n3;
  const n5 = Math.floor((n4 - 1) / 116);
  const n6 = Math.floor((n4 - 116 * n5) / 30);
  const n7 = Math.floor((n4 - 30 * n6) / 13);

  const year = 4 * n1 + n3 - 4;
  const month = Math.floor((5 * n6 + 2) / 151);
  const day = n4 - Math.floor((153 * month - 483) / 5) + 1;

  return { year, month, day };
}

// Gregorian to Jalali conversion
function gregorianToJalali(gy, gm, gd) {
  const baseDate = new Date(Date.UTC(gy - 622, gm - 1, gd));
  const now = new Date();

  // Alternative algorithm from "Jalaali Calendar" by Khayyam
  const jy = 979 + Math.floor((gy - 2) / 33 * 32);
  const i1 = (gy - 1) % 33;
  const rem = gy - 1;

  let jalaliMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let yearDiff = gy - 622;

  if (yearDiff < 0) return null;

  // Calculate Jalali day of year
  let totalDays = (gy - 622) * 365 + Math.floor((gy - 1) / 4) - Math.floor((gy - 1) / 100) + Math.floor((gy - 1) / 400) + (gd - 1);
  for (let i = 0; i < (gm - 1); i++) {
    totalDays += jalaliMonths[i];
  }

  if ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) {
    totalDays += 1;
  }

  let jyResult = 979;
  while (totalDays > 0) {
    const daysInYear = 366; // Jalali year always has 366 days
    if (totalDays >= daysInYear) {
      totalDays -= daysInYear;
      jyResult += 33;
    } else {
      // Count months
      let daysInMonth = 31;
      for (let month = 0; month < 12; month++) {
        daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
        if (month === 1) daysInMonth = 29; // Farvardin (first month) is 31 days

        if (totalDays >= daysInMonth) {
          totalDays -= daysInMonth;
        } else {
          jyResult += Math.floor(month / 12);
          return {
            year: jyResult,
            month: month + 1,
            day: totalDays + 1,
          };
        }
      }
    }
  }

  return { year: jyResult, month: 1, day: 1 };
}

// Get current Jalali date
function getCurrentJalali() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  return gregorianToJalali(year, month, day);
}

// Convert date between formats
function convertDate(date, fromFormat, toFormat) {
  if (fromFormat === "gregorian" && toFormat === "jalali") {
    return gregorianToJalali(date.year, date.month, date.day);
  } else if (fromFormat === "jalali" && toFormat === "gregorian") {
    return jalaliToGregorian(date.year, date.month, date.day);
  }
  return date;
}

// Calculate next occurrence of a date within a year
function nextOccurrence(jalaliDate) {
  const now = new Date();
  const currentGreg = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const targetGreg = new Date(Date.UTC(jalaliDate.year, jalaliDate.month - 1, jalaliDate.day));

  let nextTarget = new Date(targetGreg);
  if (nextTarget < currentGreg) {
    nextTarget.setUTCFullYear(nextTarget.getUTCFullYear() + 1);
  }

  return nextTarget.toISOString();
}

// Validate Jalali date
function validateJalaliDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const monthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > monthDays[month - 1]) {
    return false;
  }

  return true;
}

// Format Jalali date for display
function formatJalaliDate(jalaliDate, format = "long") {
  const { year, month, day } = jalaliDate;

  const monthNames = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

  switch (format) {
    case "short":
      return `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
    case "long":
      return `${day} ${monthNames[month - 1]} ${year}`;
    case "weekday":
      // Calculate day of week (0 = Sunday, 6 = Saturday)
      const gregorian = jalaliToGregorian(year, month, day);
      const date = new Date(Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day));
      const weekdays = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
      const dayOfWeek = weekdays[date.getUTCDay()];
      return `${dayOfWeek} ${monthNames[month - 1]} ${year}`;
    default:
      return `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
  }
}

export { jalaliToGregorian, gregorianToJalali, getCurrentJalali, convertDate, nextOccurrence, validateJalaliDate, formatJalaliDate };