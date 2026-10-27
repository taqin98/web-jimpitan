/**
 * input.js - Form rendering and quick-chip interaction for night collection.
 */

import { calculatePayment, formatShortDateRange, formatFullIndonesianDate } from "./schedule.js";

export function renderInputList(containerElement, housesList, targetDate) {
  while (containerElement.firstChild) {
    containerElement.removeChild(containerElement.firstChild);
  }

  housesList.forEach((house) => {
    const card = document.createElement("div");
    card.className = "house-item-card";
    card.setAttribute("data-no", house.no_rumah);

    const header = document.createElement("div");
    header.className = "house-header";

    const leftHeader = document.createElement("div");
    const noSpan = document.createElement("span");
    noSpan.className = "house-number";
    noSpan.textContent = house.no_rumah;

    const nameSpan = document.createElement("span");
    nameSpan.className = "house-owner";
    nameSpan.textContent = house.nama ? ` • ${house.nama}` : "";

    leftHeader.appendChild(noSpan);
    leftHeader.appendChild(nameSpan);
    header.appendChild(leftHeader);

    // If house has active titipan
    if (house.status === "titip" && house.titipInfo) {
      card.classList.add("is-titip");
      const badge = document.createElement("span");
      badge.className = "badge badge-success";
      badge.textContent = `Titip (sisa ${house.titipInfo.sisaHari} hari)`;
      header.appendChild(badge);
      card.appendChild(header);

      const notice = document.createElement("div");
      notice.className = "house-calc-preview";
      notice.textContent = `Sudah dibayar sampai ${formatFullIndonesianDate(house.titipInfo.tglAkhir)}`;
      card.appendChild(notice);

      containerElement.appendChild(card);
      return;
    }

    // Normal house input
    card.appendChild(header);

    const inputRow = document.createElement("div");
    inputRow.className = "house-input-row";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "house-nominal-input";
    input.placeholder = "0";
    input.min = "0";
    input.step = "500";
    input.setAttribute("data-role", "nominal-input");

    inputRow.appendChild(input);
    card.appendChild(inputRow);

    const chipsRow = document.createElement("div");
    chipsRow.className = "house-quick-chips";

    const chip500 = document.createElement("button");
    chip500.type = "button";
    chip500.className = "chip-btn";
    chip500.textContent = "500";

    const chip1000 = document.createElement("button");
    chip1000.type = "button";
    chip1000.className = "chip-btn";
    chip1000.textContent = "1.000";

    const chipZonk = document.createElement("button");
    chipZonk.type = "button";
    chipZonk.className = "chip-btn chip-zonk";
    chipZonk.textContent = "Zonk";

    chipsRow.appendChild(chip500);
    chipsRow.appendChild(chip1000);
    chipsRow.appendChild(chipZonk);
    card.appendChild(chipsRow);

    const calcPreview = document.createElement("div");
    calcPreview.className = "house-calc-preview";
    calcPreview.textContent = "Belum diisi";
    card.appendChild(calcPreview);

    const updatePreview = () => {
      const valStr = input.value.trim();
      if (valStr === "") {
        calcPreview.textContent = "Belum diisi";
        return;
      }
      const val = parseInt(valStr, 10) || 0;
      const calc = calculatePayment(val);
      if (calc.status === "ZONK") {
        calcPreview.textContent = "Zonk (Rp 0)";
      } else {
        const rangeText = formatShortDateRange(targetDate, calc.hari);
        calcPreview.textContent = `${calc.hari} hari (${rangeText}), sumbangan Rp ${calc.sumbangan.toLocaleString("id-ID")}`;
      }
    };

    input.addEventListener("input", updatePreview);

    chip500.addEventListener("click", () => {
      input.value = "500";
      updatePreview();
    });

    chip1000.addEventListener("click", () => {
      input.value = "1000";
      updatePreview();
    });

    chipZonk.addEventListener("click", () => {
      input.value = "0";
      updatePreview();
    });

    containerElement.appendChild(card);
  });
}

export function collectInputValues(containerElement) {
  const cards = containerElement.querySelectorAll(".house-item-card");
  const items = [];
  const missing = [];

  cards.forEach((card) => {
    const no = card.getAttribute("data-no");
    if (card.classList.contains("is-titip")) {
      return; // Titip house skipped
    }

    const input = card.querySelector("[data-role='nominal-input']");
    if (!input || input.value.trim() === "") {
      missing.push(no);
    } else {
      const nominal = parseInt(input.value.trim(), 10) || 0;
      items.push({ no, nominal });
    }
  });

  return { items, missing };
}
