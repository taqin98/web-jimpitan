/**
 * Sheets.gs - Data access layer and date utilities for Google Sheets.
 */

const SHEET_NAMES = {
  RUMAH: "Rumah",
  PENGATURAN: "Pengaturan",
  JIMPITAN: "Jimpitan",
  SETORAN: "Setoran",
  TUKAR: "Tukar",
};

const SHEET_HEADERS = {
  Rumah: ["no_rumah", "nama", "aktif", "role", "password_hash", "salt", "wajib_ganti_password"],
  Pengaturan: ["kunci", "nilai"],
  Jimpitan: [
    "tanggal",
    "petugas_jadwal",
    "petugas_aktual",
    "total",
    "jumlah_zonk",
    "daftar_zonk",
    "dicatat_oleh",
    "waktu",
  ],
  Setoran: [
    "id",
    "tanggal",
    "no_rumah",
    "nominal",
    "hari",
    "sumbangan",
    "tgl_mulai",
    "tgl_akhir",
    "status",
    "dicatat_oleh",
    "waktu",
  ],
  Tukar: ["id", "tanggal1", "tanggal2", "pemohon", "mitra", "status", "dibuat", "diperbarui"],
};

const TIMEZONE_WIB = "Asia/Jakarta";

function getSpreadsheet() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const spreadsheetId = scriptProperties.getProperty("SPREADSHEET_ID");
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }
  throw createAppError("SERVER", "Spreadsheet ID belum dikonfigurasi di Script Properties.");
}

function getOrInitSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headers = SHEET_HEADERS[sheetName];
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function normalizeCellValue(val) {
  if (val === null || val === undefined) {
    return "";
  }
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE_WIB, "yyyy-MM-dd");
  }
  if (typeof val === "boolean") {
    return val;
  }
  const str = String(val).trim();
  if (str.toUpperCase() === "TRUE") {
    return true;
  }
  if (str.toUpperCase() === "FALSE") {
    return false;
  }
  return str;
}

function readSheetAsObjects(sheetName) {
  const spreadsheet = getSpreadsheet();
  const sheet = getOrInitSheet(spreadsheet, sheetName);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0].map((h) => String(h).trim());
  const rows = [];

  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    const isRowEmpty = row.every((cell) => cell === "" || cell === null || cell === undefined);
    if (isRowEmpty) {
      continue;
    }

    const obj = { _rowIndex: i + 1 };
    for (let j = 0; j < headers.length; j += 1) {
      const header = headers[j];
      obj[header] = normalizeCellValue(row[j]);
    }
    rows.push(obj);
  }

  return rows;
}

function appendRows(sheetName, objectList) {
  if (!objectList || objectList.length === 0) {
    return;
  }

  const spreadsheet = getSpreadsheet();
  const sheet = getOrInitSheet(spreadsheet, sheetName);
  const headers = SHEET_HEADERS[sheetName];
  const startRow = sheet.getLastRow() + 1;
  const numRows = objectList.length;
  const numCols = headers.length;

  const rowValues = objectList.map((item) =>
    headers.map((colName) => {
      const val = item[colName];
      if (val === null || val === undefined) {
        return "";
      }
      return val;
    }),
  );

  const range = sheet.getRange(startRow, 1, numRows, numCols);
  range.setNumberFormat("@");
  range.setValues(rowValues);
}

function overwriteSheetData(sheetName, objectList) {
  const spreadsheet = getSpreadsheet();
  const sheet = getOrInitSheet(spreadsheet, sheetName);
  const headers = SHEET_HEADERS[sheetName];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.setFrozenRows(1);

  if (objectList && objectList.length > 0) {
    const rowValues = objectList.map((item) =>
      headers.map((colName) => {
        const val = item[colName];
        if (val === null || val === undefined) {
          return "";
        }
        return val;
      }),
    );
    const range = sheet.getRange(2, 1, rowValues.length, headers.length);
    range.setNumberFormat("@");
    range.setValues(rowValues);
  }
}

function getSetting(key, defaultValue = "") {
  const settings = readSheetAsObjects(SHEET_NAMES.PENGATURAN);
  const found = settings.find((item) => String(item.kunci) === key);
  return found ? String(found.nilai) : defaultValue;
}

function setSetting(key, value) {
  const spreadsheet = getSpreadsheet();
  const sheet = getOrInitSheet(spreadsheet, SHEET_NAMES.PENGATURAN);
  const settings = readSheetAsObjects(SHEET_NAMES.PENGATURAN);
  const foundIndex = settings.findIndex((item) => String(item.kunci) === key);

  if (foundIndex >= 0) {
    const rowIndex = settings[foundIndex]._rowIndex;
    sheet.getRange(rowIndex, 2).setValue(String(value));
  } else {
    appendRows(SHEET_NAMES.PENGATURAN, [{ kunci: key, nilai: String(value) }]);
  }
}

function getTodayWib() {
  return Utilities.formatDate(new Date(), TIMEZONE_WIB, "yyyy-MM-dd");
}

function getCurrentTimestampWib() {
  return Utilities.formatDate(new Date(), TIMEZONE_WIB, "yyyy-MM-dd HH:mm:ss");
}

function parseDateWib(dateStr) {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function addDays(dateStr, days) {
  const d = parseDateWib(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
}

function diffDays(startDateStr, endDateStr) {
  const d1 = parseDateWib(startDateStr);
  const d2 = parseDateWib(endDateStr);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function createAppError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
