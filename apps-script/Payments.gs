/**
 * Payments.gs - Calculation, titipan handling, night submissions, and recap generation.
 */

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_ID = [
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

function formatIndonesianDate(dateStr) {
  const d = parseDateWib(dateStr);
  const dayName = DAYS_ID[d.getUTCDay()];
  const dayNum = d.getUTCDate();
  const monthName = MONTHS_ID[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

function formatShortDate(dateStr) {
  const d = parseDateWib(dateStr);
  const dayNum = d.getUTCDate();
  const monthName = MONTHS_ID[d.getUTCMonth()];
  return `${dayNum} ${monthName}`;
}

function formatRupiah(amount) {
  return "Rp " + Number(amount).toLocaleString("id-ID");
}

function calculatePaymentBreakdown(rawNominal) {
  const nominal = Math.max(0, parseInt(rawNominal, 10) || 0);
  if (nominal < 500) {
    return {
      nominal,
      hari: 0,
      sumbangan: 0,
      status: "ZONK",
    };
  }

  const hari = Math.max(1, Math.floor(nominal / 1000));
  const sumbangan = nominal - (nominal >= 1000 ? hari * 1000 : 500);

  return {
    nominal,
    hari,
    sumbangan,
    status: "SETOR",
  };
}

function getActiveTitipanMap(targetDate) {
  const setoranList = readSheetAsObjects(SHEET_NAMES.SETORAN);
  const titipanMap = {};

  setoranList.forEach((s) => {
    if (s.status === "SETOR" && s.tgl_mulai && s.tgl_akhir) {
      if (s.tgl_mulai < targetDate && targetDate <= s.tgl_akhir) {
        const remaining = diffDays(targetDate, s.tgl_akhir) + 1;
        titipanMap[String(s.no_rumah).toUpperCase()] = {
          tglMulai: s.tgl_mulai,
          tglAkhir: s.tgl_akhir,
          sisaHari: remaining,
        };
      }
    }
  });

  return titipanMap;
}

function getInputFormData(token) {
  const auth = verifyToken(token);
  const today = getTodayWib();
  const dayInfo = getPetugasForDate(today);

  const isPetugasMalamIni =
    dayInfo && dayInfo.petugasAktual.toUpperCase() === auth.user.toUpperCase();
  const isAdmin = auth.role === "admin";

  if (!isPetugasMalamIni && !isAdmin) {
    throw createAppError(
      "FORBIDDEN",
      `Hanya petugas malam ini (${dayInfo ? dayInfo.petugasAktual : "-"}) atau admin yang dapat mengakses form input.`,
    );
  }

  const activeHouses = getActiveWargaHouses();
  const titipanMap = getActiveTitipanMap(today);

  const housesList = activeHouses.map((h) => {
    const no = h.no_rumah.toUpperCase();
    const titip = titipanMap[no] || null;
    return {
      no_rumah: h.no_rumah,
      nama: h.nama,
      status: titip ? "titip" : "normal",
      titipInfo: titip,
    };
  });

  return {
    tanggal: today,
    petugasAktual: dayInfo ? dayInfo.petugasAktual : auth.user,
    houses: housesList,
  };
}

function generateRecapText(
  targetDate,
  petugasAktual,
  setoranItems,
  titipanMap,
  totalMoney,
  zonkList,
) {
  const lines = [];
  lines.push(`Jimpitan ${formatIndonesianDate(targetDate)}`);
  lines.push(`Petugas: ${petugasAktual}`);
  lines.push("");

  // Setoran normal / bayar di cempolong
  const setorNormal = setoranItems.filter((item) => item.status === "SETOR");
  setorNormal.forEach((item) => {
    if (item.hari === 1) {
      if (item.nominal === 500) {
        lines.push(`${item.no_rumah} = 500`);
      } else {
        lines.push(`${item.no_rumah} = ${item.nominal} (sumbangan ${item.sumbangan})`);
      }
    } else {
      const startShort = formatShortDate(item.tgl_mulai);
      const endShort = formatShortDate(item.tgl_akhir);
      lines.push(
        `${item.no_rumah} = ${item.nominal} (${item.hari} hari, ${startShort} - ${endShort})`,
      );
    }
  });

  // Sudah titip
  const titipHouses = Object.keys(titipanMap).sort();
  if (titipHouses.length > 0) {
    lines.push("");
    lines.push("Sudah titip (tanpa uang malam ini):");
    titipHouses.forEach((houseNo) => {
      const info = titipanMap[houseNo];
      lines.push(`${houseNo} (sisa ${info.sisaHari} hari)`);
    });
  }

  // Zonk
  lines.push("");
  lines.push("Zonk:");
  if (zonkList.length > 0) {
    lines.push(zonkList.join(", "));
  } else {
    lines.push("-");
  }

  // Total
  lines.push("");
  lines.push(`Total uang terkumpul: ${formatRupiah(totalMoney)}`);

  return lines.join("\n");
}

function saveNightSubmission(token, targetDate, items) {
  const auth = verifyToken(token);
  const today = getTodayWib();
  const dateStr = targetDate || today;

  if (dateStr !== today && auth.role !== "admin") {
    throw createAppError(
      "FORBIDDEN",
      "Hanya admin yang dapat mencatat atau mengoreksi tanggal selain hari ini.",
    );
  }

  const dayInfo = getPetugasForDate(dateStr);
  const isPetugasMalamIni =
    dayInfo && dayInfo.petugasAktual.toUpperCase() === auth.user.toUpperCase();
  const isAdmin = auth.role === "admin";

  if (!isPetugasMalamIni && !isAdmin) {
    throw createAppError(
      "FORBIDDEN",
      "Hanya petugas aktual malam itu atau admin yang boleh menyimpan data jimpitan.",
    );
  }

  const activeHouses = getActiveWargaHouses();
  const titipanMap = getActiveTitipanMap(dateStr);

  // Validate that all non-titip houses are provided in items
  const itemMap = {};
  if (Array.isArray(items)) {
    items.forEach((it) => {
      if (it.no) {
        itemMap[String(it.no).toUpperCase()] = it.nominal;
      }
    });
  }

  const missingHouses = [];
  activeHouses.forEach((h) => {
    const no = h.no_rumah.toUpperCase();
    if (!titipanMap[no] && itemMap[no] === undefined) {
      missingHouses.push(h.no_rumah);
    }
  });

  if (missingHouses.length > 0) {
    throw createAppError(
      "VALIDATION",
      `Masih ada rumah yang belum diisi: ${missingHouses.join(", ")}`,
    );
  }

  // Lock script execution to ensure idempotency and atomic updates
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(10000);
  if (!hasLock) {
    throw createAppError(
      "SERVER",
      "Sistem sedang sibuk memproses penyimpanan lain. Silakan coba lagi.",
    );
  }

  try {
    const timestamp = getCurrentTimestampWib();
    const newSetoranRows = [];
    const zonkHouses = [];
    let totalCollected = 0;

    activeHouses.forEach((h) => {
      const no = h.no_rumah.toUpperCase();
      if (titipanMap[no]) {
        return; // Already covered by prior titipan, skip row creation
      }

      const nominal = itemMap[no] !== undefined ? itemMap[no] : 0;
      const calc = calculatePaymentBreakdown(nominal);
      const id = Utilities.getUuid();

      let tglMulai = "";
      let tglAkhir = "";

      if (calc.status === "SETOR") {
        tglMulai = dateStr;
        tglAkhir = addDays(dateStr, calc.hari - 1);
        totalCollected += calc.nominal;
      } else {
        zonkHouses.push(h.no_rumah);
      }

      newSetoranRows.push({
        id,
        tanggal: dateStr,
        no_rumah: h.no_rumah,
        nominal: calc.nominal,
        hari: calc.hari,
        sumbangan: calc.sumbangan,
        tgl_mulai: tglMulai,
        tgl_akhir: tglAkhir,
        status: calc.status,
        dicatat_oleh: auth.user,
        waktu: timestamp,
      });
    });

    const petugasJadwal = dayInfo ? dayInfo.petugasJadwal : auth.user;
    const petugasAktual = dayInfo ? dayInfo.petugasAktual : auth.user;

    const newJimpitanRow = {
      tanggal: dateStr,
      petugas_jadwal: petugasJadwal,
      petugas_aktual: petugasAktual,
      total: totalCollected,
      jumlah_zonk: zonkHouses.length,
      daftar_zonk: zonkHouses.join(", "),
      dicatat_oleh: auth.user,
      waktu: timestamp,
    };

    // Idempotent overwrite for targetDate
    const existingSetoran = readSheetAsObjects(SHEET_NAMES.SETORAN);
    const filteredSetoran = existingSetoran.filter((s) => s.tanggal !== dateStr);
    overwriteSheetData(SHEET_NAMES.SETORAN, [...filteredSetoran, ...newSetoranRows]);

    const existingJimpitan = readSheetAsObjects(SHEET_NAMES.JIMPITAN);
    const filteredJimpitan = existingJimpitan.filter((j) => j.tanggal !== dateStr);
    overwriteSheetData(SHEET_NAMES.JIMPITAN, [...filteredJimpitan, newJimpitanRow]);

    const recapText = generateRecapText(
      dateStr,
      petugasAktual,
      newSetoranRows,
      titipanMap,
      totalCollected,
      zonkHouses,
    );

    return {
      ok: true,
      data: {
        tanggal: dateStr,
        total: totalCollected,
        jumlahZonk: zonkHouses.length,
        daftarZonk: zonkHouses,
        rekapText,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

function getRekapDetail(token, targetDate) {
  verifyToken(token);
  const dateStr = targetDate || getTodayWib();

  const jimpitanList = readSheetAsObjects(SHEET_NAMES.JIMPITAN);
  const jimpitan = jimpitanList.find((j) => j.tanggal === dateStr);

  if (!jimpitan) {
    throw createAppError(
      "NOT_FOUND",
      `Belum ada data jimpitan yang dicatat untuk tanggal ${dateStr}.`,
    );
  }

  const setoranList = readSheetAsObjects(SHEET_NAMES.SETORAN);
  const itemsForDate = setoranList.filter((s) => s.tanggal === dateStr);
  const titipanMap = getActiveTitipanMap(dateStr);

  const zonkHouses = jimpitan.daftar_zonk
    ? jimpitan.daftar_zonk
        .split(",")
        .map((s) => s.trim())
        .filter((s) => Boolean(s))
    : [];

  const recapText = generateRecapText(
    dateStr,
    jimpitan.petugas_aktual,
    itemsForDate,
    titipanMap,
    jimpitan.total,
    zonkHouses,
  );

  return {
    tanggal: dateStr,
    petugasJadwal: jimpitan.petugas_jadwal,
    petugasAktual: jimpitan.petugas_aktual,
    total: jimpitan.total,
    jumlahZonk: jimpitan.jumlah_zonk,
    daftarZonk: zonkHouses,
    dicatatOleh: jimpitan.dicatat_oleh,
    waktu: jimpitan.waktu,
    rekapText,
  };
}
