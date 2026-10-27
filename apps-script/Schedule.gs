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

function buildScheduleMap(startDateStr, endDateStr) {
  const activeHouses = getActiveWargaHouses();
  if (activeHouses.length === 0) {
    return {};
  }

  const jimpitanRecords = readSheetAsObjects(SHEET_NAMES.JIMPITAN);
  const approvedSwaps = getApprovedSwaps();

  // Create lookup for existing Jimpitan rows
  const jimpitanByDate = {};
  jimpitanRecords.forEach((r) => {
    if (r.tanggal) {
      jimpitanByDate[r.tanggal] = r;
    }
  });

  // Find base anchor or latest record before startDateStr
  const anchorTanggal = getSetting("anchor_tanggal", getTodayWib());
  const anchorPetugas = getSetting("anchor_petugas", activeHouses[0].no_rumah);

  // Find the closest recorded date before or at startDateStr
  const recordedDates = Object.keys(jimpitanByDate).sort();
  let baseDate = anchorTanggal;
  let basePetugas = anchorPetugas;

  for (let i = recordedDates.length - 1; i >= 0; i -= 1) {
    const d = recordedDates[i];
    if (d <= startDateStr) {
      baseDate = d;
      basePetugas = jimpitanByDate[d].petugas_jadwal;
      break;
    }
  }

  // If baseDate is after startDateStr, step backwards or use baseDate
  // In practice we step forward from min(baseDate, startDateStr) to endDateStr
  const scheduleMap = {};
  let iterDate = baseDate;
  let iterPetugas = basePetugas;

  // If baseDate is after startDateStr, step backward
  if (diffDays(startDateStr, iterDate) > 0) {
    // Walk back
    const daysBack = diffDays(startDateStr, iterDate);
    for (let b = 0; b < daysBack; b += 1) {
      const prevDate = addDays(iterDate, -1);
      // find previous petugas
      const currIdx = activeHouses.findIndex(
        (h) => h.no_rumah.toUpperCase() === iterPetugas.toUpperCase(),
      );
      const prevIdx = currIdx <= 0 ? activeHouses.length - 1 : currIdx - 1;
      iterPetugas = activeHouses[prevIdx].no_rumah;
      iterDate = prevDate;
    }
  }

  // Walk forward up to endDateStr
  while (iterDate <= endDateStr) {
    let scheduledPetugas;
    if (jimpitanByDate[iterDate]) {
      scheduledPetugas = jimpitanByDate[iterDate].petugas_jadwal;
    } else {
      scheduledPetugas = iterPetugas;
    }

    const swapResult = getPetugasAktualFromSwaps(iterDate, scheduledPetugas, approvedSwaps);

    if (iterDate >= startDateStr && iterDate <= endDateStr) {
      scheduleMap[iterDate] = {
        tanggal: iterDate,
        petugasJadwal: scheduledPetugas,
        petugasAktual: swapResult.aktual,
        ditukar: swapResult.ditukar,
        swapInfo: swapResult.swapInfo,
      };
    }

    iterPetugas = nextPetugas(activeHouses, scheduledPetugas);
    iterDate = addDays(iterDate, 1);
  }

  return scheduleMap;
}

function getPetugasForDate(targetDate) {
  const scheduleMap = buildScheduleMap(targetDate, addDays(targetDate, 1));
  return scheduleMap[targetDate];
}

function getBootstrapData(token, yearMonthStr) {
  const auth = verifyToken(token);
  const today = getTodayWib();

  // If yearMonthStr is not provided, use today's month
  const targetYm = yearMonthStr || today.substring(0, 7);
  const [year, month] = targetYm.split("-").map((v) => parseInt(v, 10));

  // Determine first day and last day of month
  const startDateStr = `${targetYm}-01`;
  const lastDayInt = new Date(year, month, 0).getDate();
  const endDateStr = `${targetYm}-${String(lastDayInt).padStart(2, "0")}`;

  const activeHouses = getActiveWargaHouses().map((h) => ({
    no_rumah: h.no_rumah,
    nama: h.nama,
  }));

  const scheduleMap = buildScheduleMap(startDateStr, endDateStr);
  const scheduleList = [];

  for (let day = 1; day <= lastDayInt; day += 1) {
    const dateStr = `${targetYm}-${String(day).padStart(2, "0")}`;
    const info = scheduleMap[dateStr] || {
      tanggal: dateStr,
      petugasJadwal: "",
      petugasAktual: "",
      ditukar: false,
    };

    scheduleList.push({
      tanggal: dateStr,
      petugasJadwal: info.petugasJadwal,
      petugasAktual: info.petugasAktual,
      ditukar: info.ditukar,
      isToday: dateStr === today,
      isUserTurn: String(info.petugasAktual).toUpperCase() === auth.user.toUpperCase(),
    });
  }

  // Get pending swaps relevant to this user
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
    schedule: scheduleList,
    pendingSwaps,
  };
}

function getDayDetail(token, targetDate) {
  verifyToken(token);
  const today = getTodayWib();
  const dateStr = targetDate || today;
  const nextDateStr = addDays(dateStr, 1);

  const scheduleMap = buildScheduleMap(dateStr, nextDateStr);
  const dayInfo = scheduleMap[dateStr];
  const nextDayInfo = scheduleMap[nextDateStr];

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

  // Search partner's nearest scheduled date after tanggal1 within 150 days
  const maxSearchDays = 150;
  const searchEndDate = addDays(tanggal1, maxSearchDays);
  const futureScheduleMap = buildScheduleMap(addDays(tanggal1, 1), searchEndDate);

  let tanggal2 = null;
  const datesToInspect = Object.keys(futureScheduleMap).sort();

  for (let i = 0; i < datesToInspect.length; i += 1) {
    const candidateDate = datesToInspect[i];
    const sched = futureScheduleMap[candidateDate];

    if (sched.petugasJadwal.toUpperCase() === normalizedMitra) {
      // Check if candidateDate is already in an active swap
      const candidateSwap = allSwaps.find(
        (s) =>
          (s.status === "PENDING" || s.status === "DISETUJUI") &&
          (s.tanggal1 === candidateDate || s.tanggal2 === candidateDate),
      );
      if (!candidateSwap) {
        tanggal2 = candidateDate;
        break;
      }
    }
  }

  if (!tanggal2) {
    throw createAppError(
      "NOT_FOUND",
      `Tidak ditemukan giliran ${normalizedMitra} yang tersedia dalam 150 hari ke depan.`,
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
