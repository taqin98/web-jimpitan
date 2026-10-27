/**
 * calendar.js - Monthly calendar grid rendering and day selection.
 */

import { MONTHS_ID } from "./schedule.js";

const WEEKDAYS = ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"];

export function renderCalendar(
  containerElement,
  yearMonthStr,
  scheduleList,
  selectedDateStr,
  currentUser,
  onSelectDate,
) {
  // Clear existing content safely
  while (containerElement.firstChild) {
    containerElement.removeChild(containerElement.firstChild);
  }

  // Weekday Headers
  WEEKDAYS.forEach((name) => {
    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-weekday";
    dayHeader.textContent = name;
    containerElement.appendChild(dayHeader);
  });

  const [year, month] = yearMonthStr.split("-").map((v) => parseInt(v, 10));
  const firstDayObj = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();

  // Determine day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
  // We want Monday=0, Tuesday=1, ..., Sunday=6
  const jsDay = firstDayObj.getDay();
  const startOffset = (jsDay + 6) % 7;

  // Add empty filler cells before first day
  for (let i = 0; i < startOffset; i += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day-cell other-month";
    containerElement.appendChild(emptyCell);
  }

  // Build lookup from scheduleList
  const scheduleMap = {};
  if (Array.isArray(scheduleList)) {
    scheduleList.forEach((item) => {
      scheduleMap[item.tanggal] = item;
    });
  }

  // Create date cells
  for (let day = 1; day <= totalDays; day += 1) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${yearMonthStr}-${dayStr}`;
    const info = scheduleMap[dateStr] || {};

    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";
    cell.setAttribute("data-date", dateStr);

    if (info.isToday) {
      cell.classList.add("today");
    }
    if (dateStr === selectedDateStr) {
      cell.classList.add("selected");
    }

    const numberSpan = document.createElement("span");
    numberSpan.className = "day-number";
    numberSpan.textContent = String(day);
    cell.appendChild(numberSpan);

    // Indicator dot
    if (info.petugasAktual) {
      const dot = document.createElement("span");
      dot.className = "day-dot";
      const isUser = String(info.petugasAktual).toUpperCase() === String(currentUser).toUpperCase();

      if (isUser) {
        dot.classList.add("user-turn");
      } else {
        dot.classList.add("other-turn");
      }
      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => {
      onSelectDate(dateStr);
    });

    containerElement.appendChild(cell);
  }
}

export function formatMonthHeader(yearMonthStr) {
  const [year, month] = yearMonthStr.split("-").map((v) => parseInt(v, 10));
  const monthName = MONTHS_ID[month - 1];
  return `${monthName} ${year}`;
}
