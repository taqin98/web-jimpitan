/**
 * Schedule.gs - Rotation algorithm, schedule calculation, and swap management.
 */

function getActiveWargaHouses() {
  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  return houses.filter(
    (h) => Boolean(h.aktif) === true && String(h.role).toLowerCase() === "warga",
  );
}

function nextPetugas(activeHouses, currentHouseNo) {
  if (!activeHouses || activeHouses.length === 0) {
    return "";
  }
  const currentIndex = activeHouses.findIndex(
    (h) => String(h.no_rumah).trim().toUpperCase() === String(currentHouseNo).trim().toUpperCase(),
  );

  if (currentIndex === -1) {
    return activeHouses[0].no_rumah;
  }

  const nextIndex = (currentIndex + 1) % activeHouses.length;
  return activeHouses[nextIndex].no_rumah;
}

function getApprovedSwaps() {
  const swaps = readSheetAsObjects(SHEET_NAMES.TUKAR);
  return swaps.filter((s) => String(s.status).toUpperCase() === "DISETUJUI");
}

function getPetugasAktualFromSwaps(targetDate, scheduledPetugas, approvedSwaps) {
  const matchingSwap = approvedSwaps.find(
    (s) => s.tanggal1 === targetDate || s.tanggal2 === targetDate,
  );

  if (!matchingSwap) {
    return {
      aktual: scheduledPetugas,
      ditukar: false,
      swapInfo: null,
    };
  }

  if (matchingSwap.tanggal1 === targetDate) {
    return {
      aktual: matchingSwap.mitra,
      ditukar: true,
      swapInfo: matchingSwap,
    };
  }

  return {
    aktual: matchingSwap.pemohon,
    ditukar: true,
    swapInfo: matchingSwap,
  };
}

function getReleasedMonths() {
  const releasedStr = getSetting("bulan_rilis", "");
  if (!releasedStr) {
    const today = getTodayWib();
    const currentYm = today.substring(0, 7);
    return [currentYm];
  }
  return releasedStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(s));
}

function isMonthReleased(yearMonthStr) {
  const list = getReleasedMonths();
  return list.includes(yearMonthStr);
}

function adminSetJadwalBulanAction(token, yearMonthStr, petugasAwalNo) {
  const auth = verifyToken(token);
  if (auth.role !== "admin") {
    throw createAppError("FORBIDDEN", "Hanya admin yang dapat menyetel jadwal bulanan.");
  }

  if (!yearMonthStr || !/^\d{4}-\d{2}$/.test(yearMonthStr)) {
    throw createAppError("VALIDATION", "Format bulan harus yyyy-MM (contoh: 2026-11).");
  }

  const activeHouses = getActiveWargaHouses();
  if (activeHouses.length === 0) {
    throw createAppError("NOT_FOUND", "Tidak ada rumah warga yang aktif.");
  }

  let startingPetugas = petugasAwalNo ? String(petugasAwalNo).trim().toUpperCase() : "";

  // Auto-calculate from previous month if not explicitly specified
  if (!startingPetugas) {
    const [year, month] = yearMonthStr.split("-").map((v) => parseInt(v, 10));
    const prevDate = new Date(Date.UTC(year, month - 2, 1, 12, 0, 0));
    const prevYm = Utilities.formatDate(prevDate, "UTC", "yyyy-MM");
    const prevPetugasAwal = getSetting(`jadwal_${prevYm}_petugas_1`, "");

    if (prevPetugasAwal) {
      const prevTotalDays = new Date(year, month - 1, 0).getDate();
      const prevStartIndex = activeHouses.findIndex(
        (h) => h.no_rumah.toUpperCase() === prevPetugasAwal.toUpperCase(),
      );
      if (prevStartIndex !== -1) {
        const nextIdx = (prevStartIndex + prevTotalDays) % activeHouses.length;
        startingPetugas = activeHouses[nextIdx].no_rumah;
      }
    }

    if (!startingPetugas) {
      startingPetugas = getSetting("anchor_petugas", activeHouses[0].no_rumah);
    }
  }

  const houseFound = activeHouses.some(
    (h) => h.no_rumah.toUpperCase() === startingPetugas.toUpperCase(),
  );
  if (!houseFound) {
    throw createAppError(
      "VALIDATION",
      `Rumah ${startingPetugas} tidak ditemukan dalam daftar warga aktif.`,
    );
  }

  setSetting(`jadwal_${yearMonthStr}_petugas_1`, startingPetugas);

  const releasedList = getReleasedMonths();
  if (!releasedList.includes(yearMonthStr)) {
    releasedList.push(yearMonthStr);
    setSetting("bulan_rilis", releasedList.join(","));
  }

  return {
    ok: true,
    bulan: yearMonthStr,
    petugasAwal: startingPetugas,
    message: `Jadwal bulan ${yearMonthStr} berhasil diset dengan petugas awal ${startingPetugas}.`,
  };
}

function buildScheduleForMonth(yearMonthStr) {
  if (!isMonthReleased(yearMonthStr)) {
    return null;
  }

  const activeHouses = getActiveWargaHouses();
  if (activeHouses.length === 0) {
    return [];
  }

  const [year, month] = yearMonthStr.split("-").map((v) => parseInt(v, 10));
  const totalDays = new Date(year, month, 0).getDate();

  let startingPetugas = getSetting(`jadwal_${yearMonthStr}_petugas_1`, "");
  if (!startingPetugas) {
    startingPetugas = getSetting("anchor_petugas", activeHouses[0].no_rumah);
  }

  const startIndex = activeHouses.findIndex(
    (h) => h.no_rumah.toUpperCase() === startingPetugas.toUpperCase(),
  );
  const baseIdx = startIndex === -1 ? 0 : startIndex;

  const jimpitanRecords = readSheetAsObjects(SHEET_NAMES.JIMPITAN);
  const approvedSwaps = getApprovedSwaps();

  const jimpitanByDate = {};
  jimpitanRecords.forEach((r) => {
    if (r.tanggal && r.tanggal.startsWith(yearMonthStr)) {
      jimpitanByDate[r.tanggal] = r;
    }
  });

  const today = getTodayWib();
  const scheduleList = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${yearMonthStr}-${dayStr}`;

    let scheduledPetugas;
    if (jimpitanByDate[dateStr]) {
      scheduledPetugas = jimpitanByDate[dateStr].petugas_jadwal;
    } else {
      const houseIndex = (baseIdx + (day - 1)) % activeHouses.length;
      scheduledPetugas = activeHouses[houseIndex].no_rumah;
    }

    const swapResult = getPetugasAktualFromSwaps(dateStr, scheduledPetugas, approvedSwaps);

    scheduleList.push({
      tanggal: dateStr,
      petugasJadwal: scheduledPetugas,
      petugasAktual: swapResult.aktual,
      ditukar: swapResult.ditukar,
      swapInfo: swapResult.swapInfo,
      isToday: dateStr === today,
    });
  }

  return scheduleList;
}

function getPetugasForDate(targetDate) {
  const ym = targetDate.substring(0, 7);
  const scheduleList = buildScheduleForMonth(ym);
  if (!scheduleList) {
    return null;
  }
  return scheduleList.find((s) => s.tanggal === targetDate) || null;
}

function getBootstrapData(token, yearMonthStr) {
  const auth = verifyToken(token);
  const today = getTodayWib();
  const targetYm = yearMonthStr || today.substring(0, 7);

  const activeHouses = getActiveWargaHouses().map((h) => ({
    no_rumah: h.no_rumah,
    nama: h.nama,
  }));

  const scheduleList = buildScheduleForMonth(targetYm);
  const isReleased = Boolean(scheduleList);

  const scheduleWithUserTurn = isReleased
    ? scheduleList.map((item) => ({
        ...item,
        isUserTurn: String(item.petugasAktual).toUpperCase() === auth.user.toUpperCase(),
      }))
    : [];

  const allSwaps = readSheetAsObjects(SHEET_NAMES.TUKAR);
  const pendingSwaps = allSwaps
    .filter(
      (s) =>
        String(s.status).toUpperCase() === "PENDING" &&
        (String(s.pemohon).toUpperCase() === auth.user.toUpperCase() ||
          String(s.mitra).toUpperCase() === auth.user.toUpperCase() ||
          auth.role === "admin"),
    )
    .map((s) => ({
      id: s.id,
      tanggal1: s.tanggal1,
      tanggal2: s.tanggal2,
      pemohon: s.pemohon,
      mitra: s.mitra,
      status: s.status,
      dibuat: s.dibuat,
    }));

  return {
    today,
    user: auth.user,
    role: auth.role,
    houses: activeHouses,
    schedule: scheduleWithUserTurn,
    isReleased,
    pendingSwaps,
  };
}

function getDayDetail(token, targetDate) {
  verifyToken(token);
  const today = getTodayWib();
  const dateStr = targetDate || today;
  const ym = dateStr.substring(0, 7);

  const isReleased = isMonthReleased(ym);
  if (!isReleased) {
    return {
      tanggal: dateStr,
      isReleased: false,
      petugasJadwal: "",
      petugasAktual: "",
      ditukar: false,
      petugasBerikutnya: "",
      titipanBerakhir: [],
      sudahInput: false,
      rekapRingkas: null,
    };
  }

  const dayInfo = getPetugasForDate(dateStr);
  const nextDateStr = addDays(dateStr, 1);
  const nextDayInfo = getPetugasForDate(nextDateStr);

  // Check ending titipan on this date
  const setoranList = readSheetAsObjects(SHEET_NAMES.SETORAN);
  const titipanBerakhir = setoranList
    .filter((s) => s.tgl_akhir === dateStr && s.status === "SETOR" && parseInt(s.hari, 10) > 1)
    .map((s) => s.no_rumah);

  // Check if Jimpitan summary exists
  const jimpitanList = readSheetAsObjects(SHEET_NAMES.JIMPITAN);
  const existingJimpitan = jimpitanList.find((j) => j.tanggal === dateStr) || null;

  return {
    tanggal: dateStr,
    petugasJadwal: dayInfo ? dayInfo.petugasJadwal : "",
    petugasAktual: dayInfo ? dayInfo.petugasAktual : "",
    ditukar: dayInfo ? dayInfo.ditukar : false,
    petugasBerikutnya: nextDayInfo ? nextDayInfo.petugasAktual : "",
    titipanBerakhir,
    sudahInput: Boolean(existingJimpitan),
    rekapRingkas: existingJimpitan
      ? {
          total: existingJimpitan.total,
          jumlahZonk: existingJimpitan.jumlah_zonk,
          daftarZonk: existingJimpitan.daftar_zonk,
          dicatatOleh: existingJimpitan.dicatat_oleh,
        }
      : null,
  };
}

function requestSwapAction(token, tanggal1, mitra) {
  const auth = verifyToken(token);
  const today = getTodayWib();

  if (diffDays(today, tanggal1) <= 0) {
    throw createAppError("VALIDATION", "Tanggal tukar harus di masa depan (setelah hari ini).");
  }

  const normalizedMitra = String(mitra).trim().toUpperCase();
  if (normalizedMitra === auth.user.toUpperCase()) {
    throw createAppError("VALIDATION", "Tidak bisa menukar jadwal dengan diri sendiri.");
  }

  const activeHouses = getActiveWargaHouses();
  const mitraHouse = activeHouses.find((h) => h.no_rumah.toUpperCase() === normalizedMitra);
  if (!mitraHouse) {
    throw createAppError(
      "NOT_FOUND",
      "Rekan yang dipilih tidak aktif atau tidak terdaftar sebagai warga.",
    );
  }

  // Verify scheduled petugas on tanggal1 is pemohon
  const dayInfo = getPetugasForDate(tanggal1);
  if (!dayInfo || dayInfo.petugasJadwal.toUpperCase() !== auth.user.toUpperCase()) {
    throw createAppError("FORBIDDEN", `Anda bukan petugas dijadwalkan pada tanggal ${tanggal1}.`);
  }

  // Check if tanggal1 is already in an active swap
  const allSwaps = readSheetAsObjects(SHEET_NAMES.TUKAR);
  const activeSwapTanggal1 = allSwaps.find(
    (s) =>
      (s.status === "PENDING" || s.status === "DISETUJUI") &&
      (s.tanggal1 === tanggal1 || s.tanggal2 === tanggal1),
  );
  if (activeSwapTanggal1) {
    throw createAppError(
      "CONFLICT",
      `Tanggal ${tanggal1} sudah memiliki permintaan tukar jadwal (${activeSwapTanggal1.status}).`,
    );
  }

  // Search partner's nearest scheduled date after tanggal1 in released months
  let tanggal2 = null;
  const releasedMonths = getReleasedMonths().sort();
  const currentYm = tanggal1.substring(0, 7);

  for (let m = 0; m < releasedMonths.length; m += 1) {
    const ym = releasedMonths[m];
    if (ym < currentYm) {
      continue;
    }

    const monthSchedule = buildScheduleForMonth(ym) || [];
    for (let i = 0; i < monthSchedule.length; i += 1) {
      const item = monthSchedule[i];
      if (item.tanggal > tanggal1 && item.petugasJadwal.toUpperCase() === normalizedMitra) {
        const candidateSwap = allSwaps.find(
          (s) =>
            (s.status === "PENDING" || s.status === "DISETUJUI") &&
            (s.tanggal1 === item.tanggal || s.tanggal2 === item.tanggal),
        );
        if (!candidateSwap) {
          tanggal2 = item.tanggal;
          break;
        }
      }
    }
    if (tanggal2) {
      break;
    }
  }

  if (!tanggal2) {
    throw createAppError(
      "NOT_FOUND",
      `Tidak ditemukan giliran ${normalizedMitra} yang tersedia pada bulan yang sudah diset oleh Admin.`,
    );
  }

  const swapId = Utilities.getUuid();
  const timestamp = getCurrentTimestampWib();
  appendRows(SHEET_NAMES.TUKAR, [
    {
      id: swapId,
      tanggal1,
      tanggal2,
      pemohon: auth.user,
      mitra: normalizedMitra,
      status: "PENDING",
      dibuat: timestamp,
      diperbarui: timestamp,
    },
  ]);

  return {
    ok: true,
    data: {
      id: swapId,
      tanggal1,
      tanggal2,
      pemohon: auth.user,
      mitra: normalizedMitra,
      status: "PENDING",
    },
  };
}

function respondSwapAction(token, swapId, setujuBool) {
  const auth = verifyToken(token);
  const today = getTodayWib();

  const allSwaps = readSheetAsObjects(SHEET_NAMES.TUKAR);
  const swap = allSwaps.find((s) => s.id === swapId);

  if (!swap) {
    throw createAppError("NOT_FOUND", "Permintaan tukar jadwal tidak ditemukan.");
  }

  if (swap.status !== "PENDING") {
    throw createAppError("CONFLICT", `Permintaan tukar ini sudah berstatus ${swap.status}.`);
  }

  if (swap.mitra.toUpperCase() !== auth.user.toUpperCase() && auth.role !== "admin") {
    throw createAppError(
      "FORBIDDEN",
      "Hanya rekan yang diajak tukar (atau admin) yang dapat merespons.",
    );
  }

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TUKAR);
  const now = getCurrentTimestampWib();

  // If tanggal1 has already passed, expire
  if (diffDays(today, swap.tanggal1) <= 0) {
    sheet.getRange(swap._rowIndex, 6).setValue("KADALUARSA");
    sheet.getRange(swap._rowIndex, 8).setValue(now);
    throw createAppError(
      "CONFLICT",
      "Permintaan tukar sudah kedaluwarsa karena tanggal giliran pertama sudah lewat.",
    );
  }

  // Revalidate schedule
  const info1 = getPetugasForDate(swap.tanggal1);
  const info2 = getPetugasForDate(swap.tanggal2);

  if (
    !info1 ||
    info1.petugasJadwal.toUpperCase() !== swap.pemohon.toUpperCase() ||
    !info2 ||
    info2.petugasJadwal.toUpperCase() !== swap.mitra.toUpperCase()
  ) {
    sheet.getRange(swap._rowIndex, 6).setValue("KADALUARSA");
    sheet.getRange(swap._rowIndex, 8).setValue(now);
    throw createAppError(
      "CONFLICT",
      "Jadwal asli telah berubah. Permintaan tukar ditandai KADALUARSA.",
    );
  }

  const newStatus = setujuBool ? "DISETUJUI" : "DITOLAK";
  sheet.getRange(swap._rowIndex, 6).setValue(newStatus);
  sheet.getRange(swap._rowIndex, 8).setValue(now);

  return { ok: true, status: newStatus };
}

function cancelSwapAction(token, swapId) {
  const auth = verifyToken(token);
  const today = getTodayWib();

  const allSwaps = readSheetAsObjects(SHEET_NAMES.TUKAR);
  const swap = allSwaps.find((s) => s.id === swapId);

  if (!swap) {
    throw createAppError("NOT_FOUND", "Permintaan tukar jadwal tidak ditemukan.");
  }

  const isPemohon = swap.pemohon.toUpperCase() === auth.user.toUpperCase();
  const isAdmin = auth.role === "admin";

  if (swap.status === "PENDING") {
    if (!isPemohon && !isAdmin) {
      throw createAppError(
        "FORBIDDEN",
        "Hanya pemohon atau admin yang dapat membatalkan permintaan pending.",
      );
    }
  } else if (swap.status === "DISETUJUI") {
    if (!isAdmin) {
      throw createAppError(
        "FORBIDDEN",
        "Hanya admin yang dapat membatalkan tukar jadwal yang sudah disetujui.",
      );
    }
    if (diffDays(today, swap.tanggal1) <= 0 || diffDays(today, swap.tanggal2) <= 0) {
      throw createAppError(
        "VALIDATION",
        "Tidak dapat membatalkan karena salah satu tanggal giliran sudah lewat.",
      );
    }
  } else {
    throw createAppError("CONFLICT", `Tidak dapat membatalkan jadwal berstatus ${swap.status}.`);
  }

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.TUKAR);
  const now = getCurrentTimestampWib();

  sheet.getRange(swap._rowIndex, 6).setValue("DIBATALKAN");
  sheet.getRange(swap._rowIndex, 8).setValue(now);

  return { ok: true, status: "DIBATALKAN" };
}
