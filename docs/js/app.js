/**
 * app.js - Main frontend application coordinator, router, and state manager.
 */

import { callApi, getSavedAuth, saveAuth, clearAuth } from "./api.js";
import { formatFullIndonesianDate, formatRupiah, projectScheduleMonth } from "./schedule.js";
import { renderCalendar, formatMonthHeader } from "./calendar.js";
import { renderInputList, collectInputValues } from "./input.js";

// Global Application State
const state = {
  user: null,
  role: null,
  token: null,
  wajibGantiPassword: false,
  today: new Date().toISOString().substring(0, 10),
  currentYm: new Date().toISOString().substring(0, 7),
  selectedDate: new Date().toISOString().substring(0, 10),
  bootstrap: null,
  dayDetail: null,
  monthCache: {},
  baseAnchor: null,
};

// UI Element Selectors
const screens = {
  login: document.getElementById("screen-login"),
  changePassword: document.getElementById("screen-change-password"),
  calendar: document.getElementById("screen-calendar"),
  input: document.getElementById("screen-input"),
  rekap: document.getElementById("screen-rekap"),
  admin: document.getElementById("screen-admin"),
};

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const toastContainer = document.getElementById("toast-container");

export function showLoading(msg = "Memuat...") {
  if (loadingText) {
    loadingText.textContent = msg;
  }
  if (loadingOverlay) {
    loadingOverlay.classList.add("active");
  }
}

export function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove("active");
  }
}

export function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function switchScreen(screenName) {
  Object.keys(screens).forEach((key) => {
    if (screens[key]) {
      if (key === screenName) {
        screens[key].classList.add("active");
      } else {
        screens[key].classList.remove("active");
      }
    }
  });

  // Toggle user header visibility
  const userBadge = document.getElementById("header-user-badge");
  const btnLogout = document.getElementById("btn-logout");
  const btnAdmin = document.getElementById("btn-admin-nav");

  if (state.user) {
    if (userBadge) {
      userBadge.textContent = state.user;
      userBadge.style.display = "inline-flex";
    }
    if (btnLogout) {
      btnLogout.style.display = "inline-flex";
    }
    if (btnAdmin) {
      btnAdmin.style.display = state.role === "admin" ? "inline-flex" : "none";
    }
  } else {
    if (userBadge) {
      userBadge.style.display = "none";
    }
    if (btnLogout) {
      btnLogout.style.display = "none";
    }
    if (btnAdmin) {
      btnAdmin.style.display = "none";
    }
  }
}

// ==========================================
// Calendar & Home Logic
// ==========================================

function getAdjacentYearMonth(ymStr, offset) {
  const [year, month] = ymStr.split("-").map((v) => parseInt(v, 10));
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function prefetchAdjacentMonths(ymStr) {
  const prevYm = getAdjacentYearMonth(ymStr, -1);
  const nextYm = getAdjacentYearMonth(ymStr, 1);

  [prevYm, nextYm].forEach((target) => {
    if (!state.monthCache[target]) {
      callApi("getBootstrap", { bulan: target })
        .then((data) => {
          state.monthCache[target] = data;
        })
        .catch(() => {});
    }
  });
}

function renderInstantDayCard(dateStr) {
  const container = document.getElementById("day-detail-content");
  if (!container || !state.bootstrap || !state.bootstrap.schedule) {
    return;
  }

  const sched = state.bootstrap.schedule.find((s) => s.tanggal === dateStr);
  const headerDate = document.getElementById("selected-date-title");
  if (headerDate) {
    headerDate.textContent = formatFullIndonesianDate(dateStr);
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const rowPetugas = document.createElement("div");
  rowPetugas.className = "detail-row";
  const labelPetugas = document.createElement("span");
  labelPetugas.className = "detail-label";
  labelPetugas.textContent = "Petugas Malam Ini";
  const valPetugas = document.createElement("span");
  valPetugas.className = "detail-value";
  valPetugas.textContent = sched ? sched.petugasAktual : "-";

  if (sched && sched.ditukar) {
    const swapBadge = document.createElement("span");
    swapBadge.className = "badge badge-warning";
    swapBadge.style.marginLeft = "8px";
    swapBadge.textContent = "Tukar";
    valPetugas.appendChild(swapBadge);
  }
  rowPetugas.appendChild(labelPetugas);
  rowPetugas.appendChild(valPetugas);
  container.appendChild(rowPetugas);

  const isFuture = dateStr > state.today;
  const isUserScheduled =
    sched && String(sched.petugasJadwal).toUpperCase() === String(state.user).toUpperCase();

  if (isFuture && isUserScheduled && !sched.ditukar) {
    const btnSwap = document.createElement("button");
    btnSwap.className = "btn btn-primary btn-sm btn-block";
    btnSwap.style.marginTop = "10px";
    btnSwap.textContent = "Ajukan Tukar Jadwal";
    btnSwap.addEventListener("click", () => {
      openSwapModal(dateStr);
    });
    container.appendChild(btnSwap);
  }
}

function navigateMonth(targetYm) {
  state.currentYm = targetYm;

  // Set default selected date
  if (state.today.startsWith(targetYm)) {
    state.selectedDate = state.today;
  } else {
    state.selectedDate = `${targetYm}-01`;
  }

  // 1. Instant Switch: check cache or project immediately in 0ms!
  if (state.monthCache[targetYm]) {
    state.bootstrap.schedule = state.monthCache[targetYm].schedule;
    state.bootstrap.pendingSwaps = state.monthCache[targetYm].pendingSwaps;
  } else if (state.baseAnchor && state.bootstrap && state.bootstrap.houses) {
    const projected = projectScheduleMonth(
      targetYm,
      state.baseAnchor.date,
      state.baseAnchor.petugas,
      state.bootstrap.houses,
      state.today,
      state.user,
    );
    state.bootstrap.schedule = projected;
  }

  // Instant UI render (0ms delay, no blocking overlay)
  renderCalendarUI();
  renderInstantDayCard(state.selectedDate);

  // 2. Silent background sync to get server data & swaps without blocking the user
  callApi("getBootstrap", { bulan: targetYm })
    .then((data) => {
      state.monthCache[targetYm] = data;
      if (state.currentYm === targetYm) {
        state.bootstrap.schedule = data.schedule;
        state.bootstrap.pendingSwaps = data.pendingSwaps;
        renderCalendarUI();
      }
    })
    .catch(() => {});

  // Fetch full day details quietly
  loadSelectedDayDetail(state.selectedDate, false);

  // Prefetch neighbors in the background
  setTimeout(() => {
    prefetchAdjacentMonths(targetYm);
  }, 250);
}

async function loadCalendarBootstrap(ymStr, isInitial = false) {
  if (isInitial) {
    showLoading("Memuat data jadwal...");
  }
  try {
    const data = await callApi("getBootstrap", { bulan: ymStr });
    state.bootstrap = data;
    state.today = data.today || state.today;
    state.currentYm = ymStr;
    state.monthCache[ymStr] = data;

    if (data.schedule && data.schedule.length > 0) {
      state.baseAnchor = {
        date: data.schedule[0].tanggal,
        petugas: data.schedule[0].petugasJadwal,
      };
    }

    if (!state.selectedDate || !state.selectedDate.startsWith(ymStr)) {
      state.selectedDate = data.today.startsWith(ymStr) ? data.today : `${ymStr}-01`;
    }

    renderCalendarUI();
    renderInstantDayCard(state.selectedDate);
    await loadSelectedDayDetail(state.selectedDate, false);

    setTimeout(() => {
      prefetchAdjacentMonths(ymStr);
    }, 300);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (isInitial) {
      hideLoading();
    }
  }
}

function renderCalendarUI() {
  const monthHeader = document.getElementById("calendar-month-header");
  if (monthHeader) {
    monthHeader.textContent = formatMonthHeader(state.currentYm);
  }

  const gridContainer = document.getElementById("calendar-grid");
  if (gridContainer && state.bootstrap) {
    renderCalendar(
      gridContainer,
      state.currentYm,
      state.bootstrap.schedule,
      state.selectedDate,
      state.user,
      async (clickedDate) => {
        state.selectedDate = clickedDate;
        renderCalendarUI();
        renderInstantDayCard(clickedDate);
        await loadSelectedDayDetail(clickedDate, false);
      },
    );
  }

  renderPendingSwaps();
  updateStartButtonState();
}

function renderPendingSwaps() {
  const container = document.getElementById("pending-swaps-container");
  if (!container) {
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const pendingList = state.bootstrap ? state.bootstrap.pendingSwaps : [];
  if (!pendingList || pendingList.length === 0) {
    return;
  }

  pendingList.forEach((swap) => {
    const card = document.createElement("div");
    card.className = "card swap-card";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = "Permintaan Tukar Jadwal";
    card.appendChild(title);

    const desc = document.createElement("div");
    desc.style.fontSize = "14px";
    desc.style.color = "var(--text-main)";

    const isMitra = String(swap.mitra).toUpperCase() === String(state.user).toUpperCase();
    const isPemohon = String(swap.pemohon).toUpperCase() === String(state.user).toUpperCase();

    if (isMitra) {
      desc.textContent = `${swap.pemohon} mengajak tukar: giliran dia ${swap.tanggal1} ditukar dengan giliran Anda ${swap.tanggal2}.`;
    } else if (isPemohon) {
      desc.textContent = `Menunggu persetujuan ${swap.mitra} untuk tukar: giliran Anda ${swap.tanggal1} dengan giliran ${swap.mitra} ${swap.tanggal2}.`;
    } else {
      desc.textContent = `${swap.pemohon} mengajak tukar dengan ${swap.mitra} (${swap.tanggal1} <-> ${swap.tanggal2}).`;
    }
    card.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "swap-card-actions";

    if (isMitra || state.role === "admin") {
      const btnSetuju = document.createElement("button");
      btnSetuju.className = "btn btn-primary btn-sm";
      btnSetuju.textContent = "Setuju";
      btnSetuju.addEventListener("click", async () => {
        await handleRespondSwap(swap.id, true);
      });

      const btnTolak = document.createElement("button");
      btnTolak.className = "btn btn-outline-danger btn-sm";
      btnTolak.textContent = "Tolak";
      btnTolak.addEventListener("click", async () => {
        await handleRespondSwap(swap.id, false);
      });

      actions.appendChild(btnSetuju);
      actions.appendChild(btnTolak);
    }

    if (isPemohon || state.role === "admin") {
      const btnBatal = document.createElement("button");
      btnBatal.className = "btn btn-secondary btn-sm";
      btnBatal.textContent = "Batalkan";
      btnBatal.addEventListener("click", async () => {
        await handleCancelSwap(swap.id);
      });
      actions.appendChild(btnBatal);
    }

    card.appendChild(actions);
    container.appendChild(card);
  });
}

async function loadSelectedDayDetail(dateStr, showSpinner = false) {
  if (showSpinner) {
    showLoading("Memuat detail...");
  }
  try {
    const detail = await callApi("getDay", { tanggal: dateStr });
    state.dayDetail = detail;
    renderDayDetailCard();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (showSpinner) {
      hideLoading();
    }
  }
}

function renderDayDetailCard() {
  const container = document.getElementById("day-detail-content");
  if (!container || !state.dayDetail) {
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const d = state.dayDetail;

  // Header date label
  const headerDate = document.getElementById("selected-date-title");
  if (headerDate) {
    headerDate.textContent = formatFullIndonesianDate(d.tanggal);
  }

  // Row Petugas Aktual
  const rowPetugas = document.createElement("div");
  rowPetugas.className = "detail-row";

  const labelPetugas = document.createElement("span");
  labelPetugas.className = "detail-label";
  labelPetugas.textContent = "Petugas Malam Ini";

  const valPetugas = document.createElement("span");
  valPetugas.className = "detail-value";
  valPetugas.textContent = d.petugasAktual || "-";

  if (d.ditukar) {
    const swapBadge = document.createElement("span");
    swapBadge.className = "badge badge-warning";
    swapBadge.style.marginLeft = "8px";
    swapBadge.textContent = "Tukar";
    valPetugas.appendChild(swapBadge);
  }
  rowPetugas.appendChild(labelPetugas);
  rowPetugas.appendChild(valPetugas);
  container.appendChild(rowPetugas);

  // Row Petugas Berikutnya
  const rowNext = document.createElement("div");
  rowNext.className = "detail-row";
  const labelNext = document.createElement("span");
  labelNext.className = "detail-label";
  labelNext.textContent = "Petugas Besok Malam";
  const valNext = document.createElement("span");
  valNext.className = "detail-value";
  valNext.textContent = d.petugasBerikutnya || "-";
  rowNext.appendChild(labelNext);
  rowNext.appendChild(valNext);
  container.appendChild(rowNext);

  // Ending Titipan Notice
  if (d.titipanBerakhir && d.titipanBerakhir.length > 0) {
    const rowTitip = document.createElement("div");
    rowTitip.className = "detail-row";
    const labelTitip = document.createElement("span");
    labelTitip.className = "detail-label";
    labelTitip.textContent = "Titipan Berakhir";
    const valTitip = document.createElement("span");
    valTitip.className = "detail-value";
    valTitip.style.color = "var(--warning)";
    valTitip.textContent = d.titipanBerakhir.join(", ");
    rowTitip.appendChild(labelTitip);
    rowTitip.appendChild(valTitip);
    container.appendChild(rowTitip);
  }

  // Recap summary if exists
  if (d.rekapRingkas) {
    const rowRekap = document.createElement("div");
    rowRekap.className = "detail-row";
    const labelRekap = document.createElement("span");
    labelRekap.className = "detail-label";
    labelRekap.textContent = "Hasil Jimpitan";
    const valRekap = document.createElement("span");
    valRekap.className = "detail-value";
    valRekap.style.color = "var(--primary)";
    valRekap.textContent = `${formatRupiah(d.rekapRingkas.total)} (${d.rekapRingkas.jumlahZonk} Zonk)`;
    rowRekap.appendChild(labelRekap);
    rowRekap.appendChild(valRekap);
    container.appendChild(rowRekap);

    const btnLihatRekap = document.createElement("button");
    btnLihatRekap.className = "btn btn-secondary btn-sm btn-block";
    btnLihatRekap.style.marginTop = "10px";
    btnLihatRekap.textContent = "Lihat Rekap Lengkap";
    btnLihatRekap.addEventListener("click", async () => {
      await openRekapScreen(d.tanggal);
    });
    container.appendChild(btnLihatRekap);
  }

  // Button to request swap if this is user's scheduled turn in the future
  const isFuture = d.tanggal > state.today;
  const isUserScheduled =
    String(d.petugasJadwal).toUpperCase() === String(state.user).toUpperCase();

  if (isFuture && isUserScheduled && !d.ditukar) {
    const btnSwap = document.createElement("button");
    btnSwap.className = "btn btn-primary btn-sm btn-block";
    btnSwap.style.marginTop = "10px";
    btnSwap.textContent = "Ajukan Tukar Jadwal";
    btnSwap.addEventListener("click", () => {
      openSwapModal(d.tanggal);
    });
    container.appendChild(btnSwap);
  }

  // Admin button to cancel swap if approved
  if (state.role === "admin" && d.ditukar && isFuture) {
    const btnCancelSwapAdmin = document.createElement("button");
    btnCancelSwapAdmin.className = "btn btn-outline-danger btn-sm btn-block";
    btnCancelSwapAdmin.style.marginTop = "8px";
    btnCancelSwapAdmin.textContent = "Batalkan Tukar (Admin)";
    btnCancelSwapAdmin.addEventListener("click", async () => {
      if (confirm(`Batalkan tukar jadwal pada tanggal ${d.tanggal}?`)) {
        // Find swap id
        const swapObj = state.bootstrap.schedule.find((s) => s.tanggal === d.tanggal);
        if (swapObj && swapObj.swapInfo) {
          await handleCancelSwap(swapObj.swapInfo.id);
        } else {
          // Re-fetch swap
          await handleCancelSwapByDate(d.tanggal);
        }
      }
    });
    container.appendChild(btnCancelSwapAdmin);
  }

  updateStartButtonState();
}

function updateStartButtonState() {
  const btnStart = document.getElementById("btn-start-jimpitan");
  const turnLabel = document.getElementById("start-turn-label");
  if (!btnStart) {
    return;
  }

  // Find today's scheduled or actual petugas
  let todayPetugas = "-";
  if (state.bootstrap && state.bootstrap.schedule) {
    const todayItem = state.bootstrap.schedule.find((s) => s.tanggal === state.today);
    if (todayItem) {
      todayPetugas = todayItem.petugasAktual;
    }
  }

  const isTodayPetugas = String(todayPetugas).toUpperCase() === String(state.user).toUpperCase();
  const isAdmin = state.role === "admin";

  if (isTodayPetugas || isAdmin) {
    btnStart.disabled = false;
    btnStart.textContent = "Mulai Jimpitan Malam Ini";
    if (turnLabel) {
      turnLabel.textContent = `Giliran Anda malam ini (${todayPetugas})`;
    }
  } else {
    btnStart.disabled = true;
    btnStart.textContent = "Mulai Jimpitan Malam Ini";
    if (turnLabel) {
      turnLabel.textContent = `Giliran malam ini: ${todayPetugas}`;
    }
  }
}

// ==========================================
// Swap Management
// ==========================================

function openSwapModal(myScheduledDate) {
  const modal = document.getElementById("modal-swap");
  const dateInput = document.getElementById("swap-date-display");
  const mitraSelect = document.getElementById("swap-mitra-select");

  if (dateInput) {
    dateInput.value = myScheduledDate;
  }

  // Populate mitra dropdown with active houses except current user
  if (mitraSelect && state.bootstrap) {
    while (mitraSelect.firstChild) {
      mitraSelect.removeChild(mitraSelect.firstChild);
    }

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Pilih Rekan --";
    mitraSelect.appendChild(defaultOpt);

    state.bootstrap.houses.forEach((h) => {
      if (h.no_rumah.toUpperCase() !== state.user.toUpperCase()) {
        const opt = document.createElement("option");
        opt.value = h.no_rumah;
        opt.textContent = `${h.no_rumah} (${h.nama || "Warga"})`;
        mitraSelect.appendChild(opt);
      }
    });
  }

  if (modal) {
    modal.classList.add("active");
  }
}

function closeSwapModal() {
  const modal = document.getElementById("modal-swap");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function handleRespondSwap(swapId, setuju) {
  showLoading(setuju ? "Menyetujui tukar..." : "Menolak tukar...");
  try {
    await callApi("respondSwap", { id: swapId, setuju });
    showToast(setuju ? "Tukar jadwal disetujui!" : "Tukar jadwal ditolak.", "success");
    await loadCalendarBootstrap(state.currentYm);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

async function handleCancelSwap(swapId) {
  showLoading("Membatalkan permintaan...");
  try {
    await callApi("cancelSwap", { id: swapId });
    showToast("Permintaan tukar jadwal dibatalkan.", "info");
    await loadCalendarBootstrap(state.currentYm);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

async function handleCancelSwapByDate(targetDate) {
  showLoading("Mencari data tukar...");
  try {
    const swaps = await callApi("getBootstrap", {
      bulan: targetDate.substring(0, 7),
    });
    const found = swaps.pendingSwaps.find(
      (s) => s.tanggal1 === targetDate || s.tanggal2 === targetDate,
    );
    if (found) {
      await handleCancelSwap(found.id);
    } else {
      showToast("Data tukar tidak ditemukan.", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

// ==========================================
// Input Jimpitan Flow
// ==========================================

async function openInputScreen() {
  showLoading("Menyiapkan formulir input...");
  try {
    const formData = await callApi("getInputForm", {});
    const container = document.getElementById("input-house-list");
    const targetDateLabel = document.getElementById("input-target-date");

    if (targetDateLabel) {
      targetDateLabel.textContent = formatFullIndonesianDate(formData.tanggal);
    }

    if (container) {
      renderInputList(container, formData.houses, formData.tanggal);
    }

    switchScreen("input");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

async function handleSaveNightInput() {
  const container = document.getElementById("input-house-list");
  if (!container) {
    return;
  }

  const { items, missing } = collectInputValues(container);

  if (missing.length > 0) {
    showToast(`Masih ada rumah yang belum diisi: ${missing.join(", ")}`, "error");
    return;
  }

  showLoading("Menyimpan jimpitan ke server...");
  try {
    const result = await callApi("saveNight", {
      tanggal: state.today,
      items,
    });

    showToast("Data jimpitan berhasil disimpan!", "success");
    openRekapDirect(result.rekapText, state.today);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

// ==========================================
// Recap Flow
// ==========================================

async function openRekapScreen(targetDate) {
  showLoading("Mengambil rekap...");
  try {
    const data = await callApi("getRekap", { tanggal: targetDate });
    openRekapDirect(data.rekapText, targetDate);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

function openRekapDirect(rekapText, targetDate) {
  const textElem = document.getElementById("rekap-text");
  if (textElem) {
    textElem.textContent = rekapText;
  }

  const btnReinput = document.getElementById("btn-reinput");
  if (btnReinput) {
    const isToday = targetDate === state.today;
    btnReinput.style.display = isToday ? "inline-flex" : "none";
  }

  switchScreen("rekap");
}

// ==========================================
// Admin Master Data Screen
// ==========================================

async function openAdminScreen() {
  if (state.role !== "admin") {
    showToast("Akses hanya untuk admin.", "error");
    return;
  }

  showLoading("Memuat data master...");
  try {
    const bootstrap = await callApi("getBootstrap", { bulan: state.currentYm });
    renderAdminHouseList(bootstrap.houses);
    switchScreen("admin");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    hideLoading();
  }
}

function renderAdminHouseList(houses) {
  const container = document.getElementById("admin-house-list");
  if (!container) {
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  houses.forEach((h) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    card.style.padding = "12px";

    const left = document.createElement("div");
    const no = document.createElement("div");
    no.style.fontWeight = "700";
    no.textContent = h.no_rumah;

    const name = document.createElement("div");
    name.style.fontSize = "13px";
    name.style.color = "var(--text-muted)";
    name.textContent = h.nama || "-";

    left.appendChild(no);
    left.appendChild(name);
    card.appendChild(left);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "6px";

    const btnReset = document.createElement("button");
    btnReset.className = "btn btn-secondary btn-sm";
    btnReset.textContent = "Reset Pass";
    btnReset.addEventListener("click", async () => {
      if (confirm(`Reset password untuk ${h.no_rumah}?`)) {
        showLoading("Mereset password...");
        try {
          const res = await callApi("adminResetPassword", { no: h.no_rumah });
          showToast(res.message || "Password berhasil direset.", "success");
        } catch (err) {
          showToast(err.message, "error");
        } finally {
          hideLoading();
        }
      }
    });

    right.appendChild(btnReset);
    card.appendChild(right);
    container.appendChild(card);
  });
}

// ==========================================
// Event Listeners & App Lifecycle
// ==========================================

function attachEventListeners() {
  // Login Form
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userInput = document.getElementById("login-user");
      const passInput = document.getElementById("login-pass");

      const userVal = userInput ? userInput.value.trim() : "";
      const passVal = passInput ? passInput.value.trim() : "";

      if (!userVal || !passVal) {
        showToast("Nomor rumah dan password wajib diisi.", "error");
        return;
      }

      showLoading("Sedang masuk...");
      try {
        const authData = await callApi("login", {
          user: userVal,
          password: passVal,
        });

        saveAuth(authData);
        state.user = authData.user;
        state.role = authData.role;
        state.token = authData.token;
        state.wajibGantiPassword = authData.wajibGantiPassword;

        if (state.wajibGantiPassword) {
          showToast("Silakan buat password baru sebelum melanjutkan.", "warning");
          switchScreen("changePassword");
        } else {
          showToast(`Selamat datang, ${state.user}!`, "success");
          switchScreen("calendar");
          await loadCalendarBootstrap(state.currentYm, true);
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    });
  }

  // Change Password Form
  const formChangePwd = document.getElementById("form-change-password");
  if (formChangePwd) {
    formChangePwd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const oldPass = document.getElementById("pwd-old");
      const newPass = document.getElementById("pwd-new");
      const confirmPass = document.getElementById("pwd-confirm");

      const oldVal = oldPass ? oldPass.value.trim() : "";
      const newVal = newPass ? newPass.value.trim() : "";
      const confirmVal = confirmPass ? confirmPass.value.trim() : "";

      if (newVal !== confirmVal) {
        showToast("Konfirmasi password baru tidak cocok.", "error");
        return;
      }

      showLoading("Menyimpan password baru...");
      try {
        await callApi("changePassword", {
          passwordLama: oldVal,
          passwordBaru: newVal,
        });
        showToast("Password berhasil diganti!", "success");
        state.wajibGantiPassword = false;
        switchScreen("calendar");
        await loadCalendarBootstrap(state.currentYm);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    });
  }

  // Month Navigation Buttons (Instant 0ms Transition)
  const btnPrevMonth = document.getElementById("btn-prev-month");
  if (btnPrevMonth) {
    btnPrevMonth.addEventListener("click", () => {
      const prevYm = getAdjacentYearMonth(state.currentYm, -1);
      navigateMonth(prevYm);
    });
  }

  const btnNextMonth = document.getElementById("btn-next-month");
  if (btnNextMonth) {
    btnNextMonth.addEventListener("click", () => {
      const nextYm = getAdjacentYearMonth(state.currentYm, 1);
      navigateMonth(nextYm);
    });
  }

  // Start Jimpitan Tonight Button
  const btnStartJimpitan = document.getElementById("btn-start-jimpitan");
  if (btnStartJimpitan) {
    btnStartJimpitan.addEventListener("click", async () => {
      await openInputScreen();
    });
  }

  // Save Night Input Button
  const btnSaveNight = document.getElementById("btn-save-input");
  if (btnSaveNight) {
    btnSaveNight.addEventListener("click", async () => {
      await handleSaveNightInput();
    });
  }

  // Back from Input to Calendar
  const btnCancelInput = document.getElementById("btn-cancel-input");
  if (btnCancelInput) {
    btnCancelInput.addEventListener("click", () => {
      switchScreen("calendar");
    });
  }

  // Copy WhatsApp Recap Button
  const btnCopyRecap = document.getElementById("btn-copy-rekap");
  if (btnCopyRecap) {
    btnCopyRecap.addEventListener("click", async () => {
      const rekapBox = document.getElementById("rekap-text");
      if (!rekapBox) {
        return;
      }
      const textToCopy = rekapBox.textContent;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          showToast("Teks rekap berhasil disalin!", "success");
          return;
        } catch {
          // Fallback to execCommand
        }
      }

      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Teks rekap berhasil disalin!", "success");
    });
  }

  // Re-input from recap
  const btnReinput = document.getElementById("btn-reinput");
  if (btnReinput) {
    btnReinput.addEventListener("click", async () => {
      await openInputScreen();
    });
  }

  // Back from Recap to Calendar
  const btnBackCalendar = document.getElementById("btn-back-to-calendar");
  if (btnBackCalendar) {
    btnBackCalendar.addEventListener("click", async () => {
      switchScreen("calendar");
      await loadCalendarBootstrap(state.currentYm);
    });
  }

  // Swap Modal Form
  const formSwap = document.getElementById("form-swap");
  if (formSwap) {
    formSwap.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dateDisplay = document.getElementById("swap-date-display");
      const mitraSelect = document.getElementById("swap-mitra-select");

      const tgl1 = dateDisplay ? dateDisplay.value : "";
      const mitra = mitraSelect ? mitraSelect.value : "";

      if (!tgl1 || !mitra) {
        showToast("Pilih rekan yang diajak tukar.", "error");
        return;
      }

      showLoading("Mengajukan tukar jadwal...");
      try {
        await callApi("requestSwap", { tanggal1: tgl1, mitra });
        showToast("Permintaan tukar jadwal berhasil dikirim!", "success");
        closeSwapModal();
        await loadCalendarBootstrap(state.currentYm);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    });
  }

  const btnCloseSwap = document.getElementById("btn-close-swap-modal");
  if (btnCloseSwap) {
    btnCloseSwap.addEventListener("click", closeSwapModal);
  }

  // Admin Navigation
  const btnAdminNav = document.getElementById("btn-admin-nav");
  if (btnAdminNav) {
    btnAdminNav.addEventListener("click", async () => {
      await openAdminScreen();
    });
  }

  const btnBackFromAdmin = document.getElementById("btn-back-from-admin");
  if (btnBackFromAdmin) {
    btnBackFromAdmin.addEventListener("click", () => {
      switchScreen("calendar");
    });
  }

  // Admin Add House Form
  const formAddHouse = document.getElementById("form-add-house");
  if (formAddHouse) {
    formAddHouse.addEventListener("submit", async (e) => {
      e.preventDefault();
      const noInput = document.getElementById("new-house-no");
      const nameInput = document.getElementById("new-house-name");

      const noVal = noInput ? noInput.value.trim().toUpperCase() : "";
      const nameVal = nameInput ? nameInput.value.trim() : "";

      if (!noVal) {
        showToast("Nomor rumah wajib diisi.", "error");
        return;
      }

      showLoading("Menambahkan rumah...");
      try {
        await callApi("adminAddHouse", { no: noVal, nama: nameVal });
        showToast(`Rumah ${noVal} berhasil ditambahkan!`, "success");
        if (noInput) {
          noInput.value = "";
        }
        if (nameInput) {
          nameInput.value = "";
        }
        await openAdminScreen();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        hideLoading();
      }
    });
  }

  // Logout Button
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (confirm("Apakah Anda yakin ingin keluar?")) {
        clearAuth();
        state.user = null;
        state.role = null;
        state.token = null;
        switchScreen("login");
        showToast("Anda telah keluar.", "info");
      }
    });
  }
}

// Initial App Boot
document.addEventListener("DOMContentLoaded", async () => {
  attachEventListeners();

  const auth = getSavedAuth();
  if (auth && auth.token) {
    state.user = auth.user;
    state.role = auth.role;
    state.token = auth.token;
    state.wajibGantiPassword = auth.wajibGantiPassword;

    if (state.wajibGantiPassword) {
      switchScreen("changePassword");
    } else {
      switchScreen("calendar");
      await loadCalendarBootstrap(state.currentYm, true);
    }
  } else {
    switchScreen("login");
  }
});
