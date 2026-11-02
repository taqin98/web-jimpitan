/**
 * api.js - Network layer communicating with Google Apps Script Web App.
 * Includes local mock simulation when CONFIG.API_URL is not yet configured.
 */

import { CONFIG } from "./config.js";

const TOKEN_KEY = "jimpitan_auth_token";
const USER_KEY = "jimpitan_user_data";
const MOCK_DATABASE_KEY = "jimpitan_mock_db";

export function getSavedAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  if (!token || !userJson) {
    return null;
  }
  try {
    return { token, ...JSON.parse(userJson) };
  } catch {
    return null;
  }
}

export function saveAuth(authData) {
  localStorage.setItem(TOKEN_KEY, authData.token);
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      user: authData.user,
      role: authData.role,
      wajibGantiPassword: authData.wajibGantiPassword,
    }),
  );
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Local mock data store for previewing when API_URL is empty
function getMockDatabase() {
  const stored = localStorage.getItem(MOCK_DATABASE_KEY);
  if (stored) {
    try {
      const database = JSON.parse(stored);
      database.monthlySchedules = database.monthlySchedules || {};
      return database;
    } catch {
      // Fallback to fresh mock
    }
  }

  // Generate 30 houses A6..A35
  const houses = [];
  for (let i = 6; i <= 35; i += 1) {
    houses.push({
      no_rumah: `A${i}`,
      nama: `Warga A${i}`,
      aktif: true,
      role: "warga",
      password: "123",
      wajibGantiPassword: false,
    });
  }

  const initialMock = {
    houses,
    swaps: [],
    jimpitan: {},
    setoran: [],
    anchorDate: "2026-10-01",
    anchorPetugas: "A6",
    monthlySchedules: {},
  };

  saveMockDatabase(initialMock);
  return initialMock;
}

function saveMockDatabase(database) {
  localStorage.setItem(MOCK_DATABASE_KEY, JSON.stringify(database));
}

function handleMockApi(action, token, params) {
  const db = getMockDatabase();
  const today = new Date().toISOString().substring(0, 10);

  if (action === "login") {
    const username = String(params.user || "")
      .trim()
      .toUpperCase();
    const password = String(params.password || "").trim();

    if (username === "ADMIN" && password === "admin123") {
      return {
        token: "mock-token-admin",
        user: "ADMIN",
        role: "admin",
        wajibGantiPassword: false,
      };
    }

    const house = db.houses.find((h) => h.no_rumah.toUpperCase() === username);
    if (!house || password !== (house.password || "123")) {
      const err = new Error("Nomor rumah atau password salah.");
      err.code = "UNAUTHORIZED";
      throw err;
    }

    return {
      token: `mock-token-${house.no_rumah}`,
      user: house.no_rumah,
      role: house.role,
      wajibGantiPassword: Boolean(house.wajibGantiPassword),
    };
  }

  if (action === "adminSetJadwalBulan") {
    if (token !== "mock-token-admin") {
      const err = new Error("Hanya admin yang dapat menyetel jadwal bulanan.");
      err.code = "FORBIDDEN";
      throw err;
    }

    const yearMonth = String(params.bulan || "");
    const startingPetugas = String(params.petugasAwal || "")
      .trim()
      .toUpperCase();
    const activeHouses = db.houses.filter((house) => house.aktif);
    const houseExists = activeHouses.some((house) => house.no_rumah === startingPetugas);

    if (!/^\d{4}-\d{2}$/.test(yearMonth) || !houseExists) {
      const err = new Error("Bulan dan petugas awal wajib valid.");
      err.code = "VALIDATION";
      throw err;
    }

    db.monthlySchedules[yearMonth] = startingPetugas;
    saveMockDatabase(db);

    return {
      ok: true,
      bulan: yearMonth,
      petugasAwal: startingPetugas,
      message: `Jadwal bulan ${yearMonth} berhasil diset dengan petugas awal ${startingPetugas}.`,
    };
  }

  if (action === "getBootstrap") {
    const ym = params.bulan || today.substring(0, 7);
    const [year, month] = ym.split("-").map((v) => parseInt(v, 10));
    const lastDay = new Date(year, month, 0).getDate();
    const activeHouses = db.houses.filter((h) => h.aktif);
    const startingPetugas = db.monthlySchedules[ym];
    const startingIndex = activeHouses.findIndex((house) => house.no_rumah === startingPetugas);
    const isReleased = startingIndex !== -1;

    const schedule = [];

    for (let d = 1; isReleased && d <= lastDay; d += 1) {
      const dateStr = `${ym}-${String(d).padStart(2, "0")}`;
      const houseIndex = (startingIndex + d - 1) % activeHouses.length;
      const petugasJadwal = activeHouses[houseIndex].no_rumah;

      // check swaps
      const swap = db.swaps.find(
        (s) => s.status === "DISETUJUI" && (s.tanggal1 === dateStr || s.tanggal2 === dateStr),
      );

      let petugasAktual = petugasJadwal;
      let ditukar = false;
      if (swap) {
        ditukar = true;
        petugasAktual = swap.tanggal1 === dateStr ? swap.mitra : swap.pemohon;
      }

      schedule.push({
        tanggal: dateStr,
        petugasJadwal,
        petugasAktual,
        ditukar,
        isToday: dateStr === today,
        isUserTurn: false,
      });
    }

    return {
      today,
      user: "A6",
      role: "warga",
      houses: activeHouses.map((h) => ({
        no_rumah: h.no_rumah,
        nama: h.nama,
      })),
      schedule,
      isReleased,
      pendingSwaps: db.swaps.filter((s) => s.status === "PENDING"),
    };
  }

  if (action === "getDay") {
    return {
      tanggal: params.tanggal || today,
      petugasJadwal: "A6",
      petugasAktual: "A6",
      ditukar: false,
      petugasBerikutnya: "A7",
      titipanBerakhir: [],
      sudahInput: false,
      rekapRingkas: null,
    };
  }

  if (action === "getInputForm") {
    return {
      tanggal: today,
      petugasAktual: "A6",
      houses: db.houses.map((h) => ({
        no_rumah: h.no_rumah,
        nama: h.nama,
        status: "normal",
        titipInfo: null,
      })),
    };
  }

  if (action === "saveNight") {
    const rekapText = `Jimpitan ${params.tanggal}\nPetugas: A6\n\nTotal: Rp 35.000`;
    return {
      tanggal: params.tanggal,
      total: 35000,
      rekapText,
    };
  }

  if (action === "getRekap") {
    return {
      tanggal: params.tanggal || today,
      rekapText: `Jimpitan ${params.tanggal || today}\nPetugas: A6\n\nTotal uang terkumpul: Rp 0`,
    };
  }

  return { ok: true };
}

export async function callApi(action, params = {}) {
  const auth = getSavedAuth();
  const token = auth ? auth.token : "";

  // If API_URL is not set, use local mock for UI preview
  if (!CONFIG.API_URL || CONFIG.API_URL.trim() === "") {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return handleMockApi(action, token, params);
  }

  const payload = {
    action,
    token,
    params,
  };

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!response.ok) {
      const err = new Error(`Koneksi gagal dengan status HTTP ${response.status}`);
      err.code = "NETWORK";
      throw err;
    }

    const result = await response.json();
    if (!result.ok) {
      const err = new Error(result.error ? result.error.message : "Terjadi kesalahan pada server.");
      err.code = result.error ? result.error.code : "SERVER";
      throw err;
    }

    return result.data;
  } catch (err) {
    if (!err.code) {
      err.code = "NETWORK";
      err.message = "Tidak dapat terhubung ke server Google Apps Script. Periksa koneksi internet.";
    }
    throw err;
  }
}
