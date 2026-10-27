/**
 * schedule.js - Client-side payment calculation and Indonesian date formatters.
 */

export const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
export const MONTHS_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export function calculatePayment(rawNominal) {
  const nominal = Math.max(0, parseInt(rawNominal, 10) || 0);
  if (nominal < 500) {
    return {
      nominal,
      hari: 0,
      sumbangan: 0,
      status: "ZONK",
      previewText: "Zonk (Rp 0)",
    };
  }

  const hari = Math.max(1, Math.floor(nominal / 1000));
  const sumbangan = nominal - (nominal >= 1000 ? hari * 1000 : 500);

  let previewText = `${hari} hari`;
  if (sumbangan > 0) {
    previewText += `, sumbangan Rp ${sumbangan.toLocaleString("id-ID")}`;
  }

  return {
    nominal,
    hari,
    sumbangan,
    status: "SETOR",
    previewText,
  };
}

export function formatRupiah(amount) {
  return "Rp " + Number(amount || 0).toLocaleString("id-ID");
}

export function parseDateString(dateStr) {
  if (!dateStr) {
    return new Date();
  }
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day, 12, 0, 0);
}

export function formatFullIndonesianDate(dateStr) {
  const d = parseDateString(dateStr);
  const dayName = DAYS_ID[d.getDay()];
  const dayNum = d.getDate();
  const monthName = MONTHS_SHORT_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

export function formatShortDateRange(startDateStr, numDays) {
  if (numDays <= 1) {
    const d = parseDateString(startDateStr);
    return `${d.getDate()} ${MONTHS_SHORT_ID[d.getMonth()]}`;
  }
  const dStart = parseDateString(startDateStr);
  const dEnd = new Date(dStart.getTime());
  dEnd.setDate(dEnd.getDate() + (numDays - 1));

  const startText = `${dStart.getDate()} ${MONTHS_SHORT_ID[dStart.getMonth()]}`;
  const endText = `${dEnd.getDate()} ${MONTHS_SHORT_ID[dEnd.getMonth()]}`;
  return `${startText} - ${endText}`;
}

export function addDays(dateStr, days) {
  const d = parseDateString(dateStr);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
