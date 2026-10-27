/**
 * Code.gs - Google Apps Script Web App router and initialization.
 */

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: "Jimpitan RT Web App API",
    status: "active",
    time: getTodayWib(),
  });
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = payload.action;
    const token = payload.token || "";
    const params = payload.params || {};

    if (!action) {
      throw createAppError("VALIDATION", "Parameter 'action' wajib disertakan.");
    }

    let resultData = null;

    switch (action) {
      case "login":
        resultData = loginUser(params.user, params.password);
        break;

      case "changePassword":
        resultData = changeUserPassword(token, params.passwordLama, params.passwordBaru);
        break;

      case "getBootstrap":
        resultData = getBootstrapData(token, params.bulan);
        break;

      case "getDay":
        resultData = getDayDetail(token, params.tanggal);
        break;

      case "getInputForm":
        resultData = getInputFormData(token);
        break;

      case "saveNight":
        resultData = saveNightSubmission(token, params.tanggal, params.items);
        break;

      case "getRekap":
        resultData = getRekapDetail(token, params.tanggal);
        break;

      case "requestSwap":
        resultData = requestSwapAction(token, params.tanggal1, params.mitra);
        break;

      case "respondSwap":
        resultData = respondSwapAction(token, params.id, params.setuju);
        break;

      case "cancelSwap":
        resultData = cancelSwapAction(token, params.id);
        break;

      case "adminSetAktif":
        resultData = adminSetAktifAction(token, params.no, params.aktif);
        break;

      case "adminAddHouse":
        resultData = adminAddHouseAction(token, params.no, params.nama);
        break;

      case "adminResetPassword":
        resultData = adminResetPasswordAction(token, params.no);
        break;

      case "adminSetJadwalBulan":
        resultData = adminSetJadwalBulanAction(token, params.bulan, params.petugasAwal);
        break;

      default:
        throw createAppError("NOT_FOUND", `Action '${action}' tidak dikenali.`);
    }

    return jsonResponse({
      ok: true,
      data: resultData,
    });
  } catch (err) {
    const code = err.code || "SERVER";
    const message = err.message || "Terjadi kesalahan internal pada server.";
    return jsonResponse({
      ok: false,
      error: { code, message },
    });
  }
}

/**
 * Utility to initialize sheets, default settings, and sample houses.
 * Run once from Apps Script editor when deploying to a fresh Google Sheet.
 */
function setupInitialSheets() {
  const spreadsheet = getSpreadsheet();

  // Create sheets and headers
  Object.keys(SHEET_HEADERS).forEach((sheetName) => {
    getOrInitSheet(spreadsheet, sheetName);
  });

  // Default settings
  const todayYm = getTodayWib().substring(0, 7);
  const defaultSettings = [
    { kunci: "anchor_tanggal", nilai: getTodayWib() },
    { kunci: "anchor_petugas", nilai: "A6" },
    { kunci: "bulan_rilis", nilai: todayYm },
    { kunci: `jadwal_${todayYm}_petugas_1`, nilai: "A6" },
    { kunci: "nominal_per_hari", nilai: "1000" },
    { kunci: "nominal_minimum", nilai: "500" },
    { kunci: "nama_rt", nilai: "RT 09" },
    { kunci: "default_password", nilai: "123456" },
  ];

  const currentSettings = readSheetAsObjects(SHEET_NAMES.PENGATURAN);
  if (currentSettings.length === 0) {
    appendRows(SHEET_NAMES.PENGATURAN, defaultSettings);
  }

  // Create ADMIN and default houses if empty
  const currentHouses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  if (currentHouses.length === 0) {
    const saltAdmin = Utilities.getUuid().substring(0, 8);
    const hashAdmin = hashPassword("admin123", saltAdmin);

    const initialHouses = [
      {
        no_rumah: "ADMIN",
        nama: "Pengurus RT 09",
        aktif: false, // Inactive so admin is never in rotation
        role: "admin",
        password_hash: hashAdmin,
        salt: saltAdmin,
        wajib_ganti_password: true,
      },
    ];

    const defaultPwd = "123456";
    // Sample houses A6 to A35 as specified in section 1
    for (let i = 6; i <= 35; i += 1) {
      const houseNo = `A${i}`;
      const salt = Utilities.getUuid().substring(0, 8);
      const hash = hashPassword(defaultPwd, salt);
      initialHouses.push({
        no_rumah: houseNo,
        nama: `Warga ${houseNo}`,
        aktif: true,
        role: "warga",
        password_hash: hash,
        salt: salt,
        wajib_ganti_password: true,
      });
    }

    appendRows(SHEET_NAMES.RUMAH, initialHouses);
  }

  Logger.log("Inisialisasi sheet dan master data selesai.");
}
