# Jimpitan RT 09

Aplikasi web pencatatan jimpitan dan rotasi jadwal otomatis untuk warga RT 09.
Dibangun dengan Vanilla HTML + CSS + JavaScript (ES Modules) tanpa build step untuk frontend (GitHub Pages) dan Google Apps Script Web App dengan database Google Sheets untuk backend.

---

## 🚀 Fitur Utama

1. **Kalender Rotasi Otomatis**: Penjadwalan berputar otomatis berdasarkan master data nomor rumah yang aktif.
2. **Tukar Jadwal 2 Arah**: Warga dapat mengajukan tukar giliran ke rekan dengan persetujuan dua pihak.
3. **Pencatatan Cepat Malam Hari**:
   - Hitungan hari otomatis (`>= 1000` = kelipatan hari, `< 1000` tapi `>= 500` = 1 hari).
   - Deteksi sisa hari titipan (bayar di muka). Rumah yang sudah titip terkunci otomatis.
   - Pilihan chip cepat (`500`, `1.000`, `Zonk`).
4. **Format Rekap WhatsApp**: Teks rekap malam itu yang siap disalin sekali ketuk ke grup WhatsApp RT.
5. **Panel Admin**: Pengelolaan status aktif/nonaktif rumah dan reset password warga.

---

## 🛠️ Panduan Instalasi & Deploy

### 1. Google Sheets & Google Apps Script (Backend)

1. Buat spreadsheet baru di Google Sheets.
2. Buka menu **Extensions** &rarr; **Apps Script**.
3. Salin seluruh file dari folder `apps-script/` ke dalam project Apps Script:
   - `Code.gs`
   - `Auth.gs`
   - `Schedule.gs`
   - `Payments.gs`
   - `Sheets.gs`
   - `appsscript.json` (buka _Project Settings_ &rarr; centang _Show "appsscript.json" manifest file in editor_).
4. Buka **Project Settings** &rarr; **Script Properties**:
   - Tambahkan property `SPREADSHEET_ID` dengan ID spreadsheet Anda.
   - Tambahkan property `SECRET` dengan string acak rahasia (misal: UUID atau string panjang).
5. Pada editor Apps Script, pilih fungsi `setupInitialSheets` di `Code.gs` dan klik **Run**. Ini akan membuat seluruh sheet (`Rumah`, `Pengaturan`, `Jimpitan`, `Setoran`, `Tukar`) serta akun default `ADMIN` (password awal: `admin123`) dan rumah `A6` s.d. `A35` (password default: `123456`).
6. Klik **Deploy** &rarr; **New deployment**:
   - Pilih tipe: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Salin Web App URL yang dihasilkan.

### 2. Frontend (GitHub Pages)

1. Buka berkas `docs/js/config.js`.
2. Tempelkan URL Google Apps Script Web App ke variabel `API_URL`:
   ```javascript
   export const CONFIG = {
     API_URL: "https://script.google.com/macros/s/AKfycb.../exec",
     APP_NAME: "Jimpitan RT 09",
   };
   ```
3. Commit dan push ke repository GitHub:
   ```bash
   git add .
   git commit -m "feat: complete initial jimpitan web app"
   git push origin main
   ```
4. Di GitHub repository: buka **Settings** &rarr; **Pages** &rarr; Branch `main`, folder `/docs`.

---

## 💻 Pengembangan Lokal & Linting

Proyek ini menggunakan ESLint 9 (Flat Config) dan Prettier sebagai dev-tooling:

```bash
# Periksa kode (linting + format check)
npm run check

# Format otomatis semua berkas
npm run format

# Perbaiki linting otomatis
npm run lint:fix
```
