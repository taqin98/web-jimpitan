/**
 * Auth.gs - Authentication, HMAC token generation, rate limiting, and house management.
 */

function getAppSecret() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let secret = scriptProperties.getProperty("SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + "-" + Utilities.getUuid();
    scriptProperties.setProperty("SECRET", secret);
  }
  return secret;
}

function hashPassword(password, salt) {
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + String(password),
    Utilities.Charset.UTF_8,
  );
  return rawBytes
    .map((b) => {
      const byteVal = b < 0 ? b + 256 : b;
      return byteVal.toString(16).padStart(2, "0");
    })
    .join("");
}

function createToken(user, role) {
  const secret = getAppSecret();
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days validity
  const payload = JSON.stringify({ user, role, exp });
  const payloadBase64 = Utilities.base64EncodeWebSafe(payload);

  const signatureBytes = Utilities.computeHmacSha256Signature(payloadBase64, secret);
  const signatureHex = signatureBytes
    .map((b) => {
      const byteVal = b < 0 ? b + 256 : b;
      return byteVal.toString(16).padStart(2, "0");
    })
    .join("");

  return `${payloadBase64}.${signatureHex}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw createAppError("UNAUTHORIZED", "Token otentikasi tidak disediakan.");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw createAppError("UNAUTHORIZED", "Format token tidak valid.");
  }

  const [payloadBase64, providedSignatureHex] = parts;
  const secret = getAppSecret();
  const expectedSignatureBytes = Utilities.computeHmacSha256Signature(payloadBase64, secret);
  const expectedSignatureHex = expectedSignatureBytes
    .map((b) => {
      const byteVal = b < 0 ? b + 256 : b;
      return byteVal.toString(16).padStart(2, "0");
    })
    .join("");

  if (providedSignatureHex !== expectedSignatureHex) {
    throw createAppError("UNAUTHORIZED", "Tanda tangan token tidak sah.");
  }

  const decodedJson = Utilities.newBlob(
    Utilities.base64DecodeWebSafe(payloadBase64),
  ).getDataAsString();
  const data = JSON.parse(decodedJson);

  if (!data.exp || Date.now() > data.exp) {
    throw createAppError("UNAUTHORIZED", "Sesi telah kedaluwarsa. Silakan login kembali.");
  }

  return { user: data.user, role: data.role };
}

function checkRateLimit(userKey) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `fail_login_${userKey.toLowerCase()}`;
  const countStr = cache.get(cacheKey);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= 5) {
    throw createAppError(
      "FORBIDDEN",
      "Terlalu banyak percobaan login gagal. Akun dikunci sementara selama 10 menit.",
    );
  }
}

function recordLoginFailure(userKey) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `fail_login_${userKey.toLowerCase()}`;
  const countStr = cache.get(cacheKey);
  const count = countStr ? parseInt(countStr, 10) : 0;
  cache.put(cacheKey, String(count + 1), 600); // 10 minutes lock
}

function clearLoginFailure(userKey) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `fail_login_${userKey.toLowerCase()}`;
  cache.remove(cacheKey);
}

function loginUser(username, password) {
  if (!username || !password) {
    throw createAppError("VALIDATION", "Nomor rumah dan password wajib diisi.");
  }

  const normalizedUser = String(username).trim();
  checkRateLimit(normalizedUser);

  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  const house = houses.find(
    (h) => String(h.no_rumah).trim().toUpperCase() === normalizedUser.toUpperCase(),
  );

  if (!house) {
    recordLoginFailure(normalizedUser);
    throw createAppError("UNAUTHORIZED", "Nomor rumah atau password salah.");
  }

  const computedHash = hashPassword(password, house.salt);
  if (computedHash !== house.password_hash) {
    recordLoginFailure(normalizedUser);
    throw createAppError("UNAUTHORIZED", "Nomor rumah atau password salah.");
  }

  clearLoginFailure(normalizedUser);

  const token = createToken(house.no_rumah, house.role);
  return {
    token,
    user: house.no_rumah,
    role: house.role,
    wajibGantiPassword: Boolean(house.wajib_ganti_password),
  };
}

function changeUserPassword(token, passwordLama, passwordBaru) {
  const auth = verifyToken(token);
  if (!passwordBaru || String(passwordBaru).trim().length < 4) {
    throw createAppError("VALIDATION", "Password baru minimal harus terdiri dari 4 karakter.");
  }

  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  const house = houses.find(
    (h) => String(h.no_rumah).trim().toUpperCase() === auth.user.toUpperCase(),
  );

  if (!house) {
    throw createAppError("NOT_FOUND", "Pengguna tidak ditemukan.");
  }

  const oldHash = hashPassword(passwordLama, house.salt);
  if (oldHash !== house.password_hash) {
    throw createAppError("UNAUTHORIZED", "Password lama salah.");
  }

  const newSalt = Utilities.getUuid().substring(0, 8);
  const newHash = hashPassword(passwordBaru, newSalt);

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUMAH);
  const rowIndex = house._rowIndex;

  // Columns: no_rumah(1), nama(2), aktif(3), role(4), password_hash(5), salt(6), wajib_ganti_password(7)
  sheet.getRange(rowIndex, 5).setValue(newHash);
  sheet.getRange(rowIndex, 6).setValue(newSalt);
  sheet.getRange(rowIndex, 7).setValue(false);

  return { ok: true, message: "Password berhasil diperbarui." };
}

function adminResetPasswordAction(token, targetUser) {
  const auth = verifyToken(token);
  if (auth.role !== "admin") {
    throw createAppError("FORBIDDEN", "Hanya admin yang dapat mereset password.");
  }

  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  const house = houses.find(
    (h) => String(h.no_rumah).trim().toUpperCase() === String(targetUser).trim().toUpperCase(),
  );

  if (!house) {
    throw createAppError("NOT_FOUND", "Nomor rumah target tidak ditemukan.");
  }

  const defaultPassword = getSetting("default_password", "123456");
  const newSalt = Utilities.getUuid().substring(0, 8);
  const newHash = hashPassword(defaultPassword, newSalt);

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUMAH);
  const rowIndex = house._rowIndex;

  sheet.getRange(rowIndex, 5).setValue(newHash);
  sheet.getRange(rowIndex, 6).setValue(newSalt);
  sheet.getRange(rowIndex, 7).setValue(true);

  return { ok: true, message: `Password ${targetUser} berhasil direset ke password awal.` };
}

function adminSetAktifAction(token, houseNo, aktifBool) {
  const auth = verifyToken(token);
  if (auth.role !== "admin") {
    throw createAppError("FORBIDDEN", "Hanya admin yang dapat mengubah status aktif rumah.");
  }

  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  const house = houses.find(
    (h) => String(h.no_rumah).trim().toUpperCase() === String(houseNo).trim().toUpperCase(),
  );

  if (!house) {
    throw createAppError("NOT_FOUND", "Nomor rumah tidak ditemukan.");
  }

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUMAH);
  sheet.getRange(house._rowIndex, 3).setValue(Boolean(aktifBool));

  return { ok: true, message: `Status aktif ${houseNo} berhasil diperbarui.` };
}

function adminAddHouseAction(token, houseNo, namaWarga) {
  const auth = verifyToken(token);
  if (auth.role !== "admin") {
    throw createAppError("FORBIDDEN", "Hanya admin yang dapat menambah nomor rumah.");
  }

  const normalizedNo = String(houseNo).trim().toUpperCase();
  if (!normalizedNo) {
    throw createAppError("VALIDATION", "Nomor rumah wajib diisi.");
  }

  const houses = readSheetAsObjects(SHEET_NAMES.RUMAH);
  const exists = houses.some((h) => String(h.no_rumah).trim().toUpperCase() === normalizedNo);

  if (exists) {
    throw createAppError("CONFLICT", `Nomor rumah ${normalizedNo} sudah ada.`);
  }

  const defaultPassword = getSetting("default_password", "123456");
  const salt = Utilities.getUuid().substring(0, 8);
  const hash = hashPassword(defaultPassword, salt);

  appendRows(SHEET_NAMES.RUMAH, [
    {
      no_rumah: normalizedNo,
      nama: String(namaWarga || "").trim(),
      aktif: true,
      role: "warga",
      password_hash: hash,
      salt: salt,
      wajib_ganti_password: true,
    },
  ]);

  return { ok: true, message: `Rumah ${normalizedNo} berhasil ditambahkan.` };
}
