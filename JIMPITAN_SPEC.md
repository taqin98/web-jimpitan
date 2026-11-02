# Jimpitan RT 09: Spesifikasi untuk AI Coding Agent

Dokumen ini adalah sumber kebenaran (single source of truth) untuk membangun aplikasi **Jimpitan**. Baca seluruhnya sebelum menulis kode. Jika ada ambiguitas, tanyakan; jangan berasumsi di luar yang tertulis di sini.

## 1. Ringkasan

Jimpitan adalah tradisi RT: warga menaruh uang koin di cempolong (batok/wadah) di depan rumah, dan setiap malam satu petugas bergiliran berkeliling mengambilnya. Aplikasi ini menggantikan pencatatan manual.

Fungsi utama:

1. Kalender jadwal petugas dengan rotasi otomatis dari master data nomor rumah (rumah kosong, sepuh, dan janda tidak dimasukkan sehingga otomatis terlewati).
2. Tukar jadwal dua arah dengan persetujuan rekan.
3. Petugas mencatat nominal tiap rumah, dengan hitungan hari otomatis dan dukungan titipan (bayar di muka).
4. Rekap malam itu yang bisa disalin ke grup WhatsApp.

Skala: sekitar 35 rumah, pengguna adalah warga awam yang memakai HP. Prioritas: **sederhana, cepat, mudah dipakai satu tangan di gang gelap**.

## 2. Stack dan batasan teknis

| Bagian        | Pilihan                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| Frontend      | HTML + CSS + JavaScript murni (vanilla), **tanpa framework dan tanpa build step** |
| Hosting       | GitHub Pages (branch `main`, folder `/docs` atau root)                            |
| Backend       | Google Apps Script (Web App)                                                      |
| Database      | Google Sheets                                                                     |
| Kualitas kode | ESLint + Prettier (alat dev saja, bukan build step; lihat bagian 11)              |
| Bahasa UI     | Bahasa Indonesia                                                                  |
| Zona waktu    | Asia/Jakarta (WIB, UTC+7) di semua tempat                                         |

Batasan penting:

- Frontend statis, jadi **tidak ada rahasia di kode frontend**. Semua validasi dan otorisasi dilakukan di Apps Script.
- Mobile-first (lebar 360 sampai 430 px), mendukung mode terang dan gelap lewat CSS variables dan `prefers-color-scheme`.
- Aplikasi boleh dibuat PWA (manifest + ikon) agar bisa di-install ke layar utama. Service worker opsional, hanya untuk cache aset statis.
- Tanggal selalu string `yyyy-MM-dd` (WIB). **Jangan** memakai objek `Date` untuk menyimpan tanggal di Sheets (lihat bagian 9).

## 3. Peran pengguna

| Peran   | Hak akses                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `warga` | Melihat kalender dan jadwal, mengajukan/menyetujui/menolak/membatalkan tukar jadwal miliknya, ganti password sendiri. Jika dia petugas malam itu: input jimpitan dan terima titipan. |
| `admin` | Semua hak warga (kecuali menjadi petugas), plus: input jimpitan kapan pun, membatalkan tukar yang sudah disetujui, menambah/menonaktifkan rumah, reset password, koreksi setoran.    |

Login: `username` = nomor rumah (contoh `A6`, tidak peka huruf besar/kecil), `password` awal sama untuk semua (ditentukan admin, disimpan sebagai hash). Akun admin memakai username khusus, misalnya `ADMIN`.

## 4. Aturan bisnis

### 4.1 Nominal dan hari

Satu rumus untuk cempolong maupun titipan:

```
if nominal < 500:   hari = 0 (dicatat zonk)
else:               hari = max(1, floor(nominal / 1000))
sumbangan = nominal - (nominal >= 1000 ? hari * 1000 : 500)   // untuk hari >= 1
```

| Nominal | Hari | Sumbangan |
| ------- | ---- | --------- |
| 0       | zonk | -         |
| 500     | 1    | 0         |
| 1000    | 1    | 0         |
| 1500    | 1    | 500       |
| 2000    | 2    | 0         |
| 2500    | 2    | 500       |
| 3000    | 3    | 0         |
| 30000   | 30   | 0         |

Seluruh nominal (termasuk sumbangan) masuk ke total uang yang dikumpulkan.

### 4.2 Hari tercatat dan "sudah titip"

Pembayaran `N` hari pada tanggal `T` menutup tanggal `T` sampai `T + N - 1`. Pada malam `D`, rumah berstatus **sudah titip** jika ada pembayaran dengan `tgl_mulai < D <= tgl_akhir`. Rumah yang sudah titip:

- terkunci di layar input (tidak perlu input),
- tidak dihitung zonk,
- muncul di rekap dengan sisa hari.

Contoh: A10 membayar 3000 pada 1 Okt 2026 menutup 1, 2, 3 Okt. Pada 2 dan 3 Okt, A10 berstatus sudah titip.

### 4.3 Master data rumah dan rotasi petugas

**Master data hanya berisi nomor rumah yang ikut jimpitan.** Rumah kosong, rumah orang sepuh, dan rumah janda **tidak dimasukkan** ke master. Akibatnya:

- mereka tidak punya akun, tidak muncul di layar input, tidak masuk daftar zonk, dan tidak pernah menjadi petugas,
- tidak ada kolom "status jenis rumah" yang perlu dikelola, dan rotasi otomatis melompati mereka karena memang tidak ada di daftar.

Rotasi memakai **penunjuk** terhadap urutan baris di sheet `Rumah` (hanya baris dengan `aktif = TRUE`), bukan pembagian tanggal:

```
nextPetugas(h): ambil rumah aktif berikutnya setelah h menurut urutan baris; setelah rumah terakhir kembali ke rumah aktif pertama
```

Contoh: master berisi A6, A7, ... A35 (A1 sampai A5 tidak dimasukkan). Jika A35 bertugas hari ini, besok **A6**.

Jika di kemudian hari sebuah rumah menjadi kosong atau pindah, admin cukup mengubah `aktif` menjadi `FALSE` (jangan menghapus baris, agar penunjuk rotasi dan histori tetap utuh). Rumah baru ditambahkan sebagai baris baru; letak barisnya menentukan posisi di rotasi. Jika petugas terakhir yang tersimpan ternyata sudah nonaktif, lanjutkan ke rumah aktif berikutnya menurut urutan barisnya.

Admin membuat jadwal secara terpisah untuk setiap bulan dengan memilih petugas tanggal 1. Sistem tidak memproyeksikan jadwal ke bulan atau tahun yang belum dirilis admin.

Menentukan petugas (dijadwalkan) pada tanggal `D` untuk bulan yang sudah dirilis:

1. Jika ada baris `Jimpitan` untuk `D`, pakai `petugas_jadwal` yang tersimpan (histori **tidak** berubah walau master data berubah nanti).
2. Jika tidak, mulai dari petugas tanggal 1 yang dipilih admin, lalu maju satu hari demi satu hari dengan `nextPetugas` sampai `D`.
3. Petugas aktual pada `D`: jika ada tukar berstatus `DISETUJUI` yang mengubah `D`, pakai petugas pengganti; selain itu sama dengan petugas dijadwalkan.

Rotasi maju berdasarkan **tanggal kalender**, termasuk malam yang tidak dicatat.

### 4.4 Tukar jadwal dua arah dengan persetujuan

Contoh: giliran A6 pada 30 Okt, giliran A9 berikutnya pada 2 Nov. Setelah tukar: 30 Okt = A9, 2 Nov = A6. Urutan rotasi lain tidak bergeser (31 Okt tetap A7).

Alur:

1. Pemohon (A6) memilih tanggal gilirannya sendiri (harus di masa depan, belum pernah ditukar, dan dia adalah petugas dijadwalkan tanggal itu), lalu memilih rekan (rumah dengan `aktif = TRUE`).
2. Sistem mencari **giliran rekan terdekat setelah tanggal pemohon** yang belum ditukar. Jika tidak ada dalam 150 hari, tolak dengan pesan jelas.
3. Dibuat permintaan `PENDING` berisi `tanggal1` (giliran pemohon) dan `tanggal2` (giliran rekan).
4. Rekan melihat permintaan di layar utama: **Setuju** atau **Tolak**. Pemohon bisa **Batal** selama `PENDING`.
5. Saat Setuju, sistem **memvalidasi ulang**: petugas aktual `tanggal1` masih pemohon dan `tanggal2` masih rekan. Jika tidak, status menjadi `KADALUARSA`. Jika valid, status `DISETUJUI` dan kedua tanggal berubah.
6. Admin dapat membatalkan tukar `DISETUJUI` selama kedua tanggalnya belum lewat (status `DIBATALKAN`, kedua tanggal kembali ke jadwal asli).
7. Permintaan `PENDING` otomatis `KADALUARSA` jika `tanggal1` sudah lewat.

### 4.5 Hak input

Hanya petugas aktual malam itu atau admin yang boleh menyimpan input jimpitan untuk tanggal hari ini. Validasi ini **wajib di server**. Input untuk tanggal selain hari ini hanya untuk admin (koreksi).

## 5. Model data (Google Sheets)

Satu spreadsheet, satu sheet per tabel. Baris 1 adalah header (nama kolom persis seperti di bawah). Semua kolom tanggal dan nomor rumah **diformat Plain Text** (lihat bagian 9).

**Rumah** (master data; hanya rumah yang ikut jimpitan)

| kolom                | contoh   | keterangan                                                                                   |
| -------------------- | -------- | -------------------------------------------------------------------------------------------- |
| no_rumah             | A6       | unik, urutan baris = urutan rotasi                                                           |
| nama                 | Pak Budi | kepala keluarga                                                                              |
| aktif                | TRUE     | TRUE = ikut jimpitan dan rotasi; FALSE = berhenti (rumah pindah/kosong), baris tidak dihapus |
| role                 | warga    | warga / admin                                                                                |
| password_hash        | (hash)   | lihat bagian 8                                                                               |
| salt                 | (acak)   | per pengguna                                                                                 |
| wajib_ganti_password | TRUE     | TRUE sampai pengguna mengganti password awal                                                 |

**Pengaturan** (pasangan `kunci` dan `nilai`)
`anchor_tanggal`, `anchor_petugas`, `bulan_rilis` (daftar `yyyy-MM`), `jadwal_<yyyy-MM>_petugas_1`, `nominal_per_hari` (1000), `nominal_minimum` (500), `nama_rt`.

**Jimpitan** (satu baris per malam yang sudah disimpan)
`tanggal`, `petugas_jadwal`, `petugas_aktual`, `total`, `jumlah_zonk`, `daftar_zonk` (dipisah koma), `dicatat_oleh`, `waktu`.

**Setoran** (satu baris per rumah per malam yang ada transaksinya)
`id`, `tanggal`, `no_rumah`, `nominal`, `hari`, `sumbangan`, `tgl_mulai`, `tgl_akhir`, `status` (`SETOR` / `ZONK`), `dicatat_oleh`, `waktu`.
Rumah yang berstatus sudah titip pada malam itu **tidak** diberi baris (statusnya diturunkan dari baris pembayaran sebelumnya).

**Tukar**
`id`, `tanggal1`, `tanggal2`, `pemohon`, `mitra`, `status` (`PENDING` / `DISETUJUI` / `DITOLAK` / `DIBATALKAN` / `KADALUARSA`), `dibuat`, `diperbarui`.

**Sesi** (opsional, jika token disimpan; alternatif: token bertanda tangan HMAC tanpa sheet, lihat bagian 8)

## 6. Kontrak API (Apps Script Web App)

Satu endpoint Web App. Semua permintaan memakai **POST** dengan body JSON yang dikirim sebagai `Content-Type: text/plain;charset=utf-8` (menghindari preflight CORS yang tidak didukung Apps Script). Respons selalu JSON:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "Pesan untuk pengguna" } }
```

Frontend mengirim: `{ "action": "...", "token": "...", "params": { } }`.

| action                | Auth  | params                              | Hasil                                                                                                                                                       |
| --------------------- | ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login`               | -     | `user`, `password`                  | `token`, `user`, `role`, `wajibGantiPassword`                                                                                                               |
| `changePassword`      | token | `passwordLama`, `passwordBaru`      | ok                                                                                                                                                          |
| `getBootstrap`        | token | `bulan` (`yyyy-MM`)                 | daftar rumah aktif (no), jadwal sebulan (`tanggal`, `petugasJadwal`, `petugasAktual`, `ditukar`), tukar PENDING terkait pengguna, tanggal hari ini (server) |
| `getDay`              | token | `tanggal`                           | petugas, berikutnya, titipan berakhir, ringkasan log jika ada                                                                                               |
| `getInputForm`        | token | -                                   | daftar rumah dengan status malam ini (`normal` / `titip` + sisa hari); gagal `FORBIDDEN` jika bukan petugas/admin                                           |
| `saveNight`           | token | `tanggal`, `items: [{no, nominal}]` | menyimpan Setoran + Jimpitan, mengembalikan teks rekap                                                                                                      |
| `getRekap`            | token | `tanggal`                           | teks rekap dan data terstruktur                                                                                                                             |
| `requestSwap`         | token | `tanggal1`, `mitra`                 | permintaan baru (server yang mencari `tanggal2`)                                                                                                            |
| `respondSwap`         | token | `id`, `setuju` (bool)               | status baru                                                                                                                                                 |
| `cancelSwap`          | token | `id`                                | status baru (pemohon untuk PENDING, admin untuk DISETUJUI)                                                                                                  |
| `adminSetAktif`       | admin | `no`, `aktif` (bool)                | ok                                                                                                                                                          |
| `adminAddHouse`       | admin | `no`, `nama`                        | ok (ditambahkan di akhir urutan; password awal dari pengaturan)                                                                                             |
| `adminResetPassword`  | admin | `no`                                | ok                                                                                                                                                          |
| `adminSetJadwalBulan` | admin | `bulan` (`yyyy-MM`), `petugasAwal`  | merilis jadwal untuk satu bulan                                                                                                                             |

Kode error baku: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION`, `CONFLICT`, `NOT_FOUND`, `SERVER`.

Aturan server:

- **Hitung ulang semua nominal, hari, dan sumbangan di server**; jangan percaya angka hitungan dari klien.
- Semua penulisan dibungkus `LockService.getScriptLock()` (tunggu maks 10 detik) agar dua penyimpanan bersamaan tidak saling menimpa.
- `saveNight` harus **idempoten per tanggal**: jika tanggal itu sudah ada, hapus baris Setoran dan Jimpitan tanggal tersebut lalu tulis ulang (dipakai juga untuk "Input ulang"), dalam satu lock.
- Baca sheet sekali per permintaan (`getDataRange().getValues()`), proses di memori, tulis dengan `setValues` massal. Hindari pemanggilan per sel.
- Gunakan `CacheService` (30 sampai 60 detik) untuk data rumah dan jadwal bila perlu, dan bersihkan cache saat ada penulisan.

## 7. Layar dan UX

Navigasi tunggal tanpa library: satu `index.html`, layar diganti lewat JavaScript. Tombol dan area ketuk minimal 44 px. Teks minimal 16 px.

1. **Login**: kolom nomor rumah, password, tombol Masuk. Jika `wajibGantiPassword`, arahkan ke layar ganti password sebelum masuk.
2. **Beranda (kalender)**:
   - Atas: kalender bulanan seperti aplikasi tanggal iPhone, minggu mulai Senin (Sn Sl Rb Km Jm Sb Mg), tombol bulan sebelum/berikutnya. Hari ini diberi lingkaran penuh, tanggal terpilih diberi garis lingkaran. Titik di bawah tanggal: hijau = giliran pengguna, abu-abu = giliran orang lain.
   - Tengah: kartu permintaan tukar (jika ada) dengan tombol Setuju / Tolak / Batal.
   - Bawah kalender: panel tanggal terpilih (petugas, berikutnya, label "tukar", titipan yang berakhir, ringkasan rekap jika ada, tombol "Ajukan tukar jadwal" untuk giliran sendiri di masa depan, tombol admin "Batalkan tukar").
   - Paling bawah (tetap/sticky): tombol **Mulai Jimpitan Malam Ini**. Aktif hanya untuk petugas aktual malam itu atau admin; jika tidak, nonaktif dengan teks "Giliran malam ini: A6".
3. **Input jimpitan**: daftar semua rumah. Tiap baris: nomor rumah, kolom nominal, chip cepat `500`, `1000`, `Zonk`, dan keterangan hasil hitung ("3 hari (27-29 Okt), sumbangan Rp 500"). Rumah titip terkunci berwarna hijau dengan sisa hari. Tombol **Simpan** (sticky) menolak jika masih ada rumah belum diisi dan menyebutkan nomornya.
4. **Rekap**: teks monospasi (format di bawah), tombol **Salin untuk WhatsApp**, tombol **Input ulang** (petugas malam itu atau admin, hanya untuk hari ini).
5. **Admin**: daftar rumah (master data) dengan tambah rumah, aktifkan/nonaktifkan, dan reset password.

Indikator "Menyimpan..." wajib muncul untuk semua pemanggilan API (Apps Script bisa butuh 1 sampai 3 detik). Tombol dinonaktifkan selama proses untuk mencegah klik ganda. Pesan error ditampilkan dalam bahasa Indonesia yang jelas.

Format rekap:

```
Jimpitan Selasa, 27 Okt 2026
Petugas: A6

A3 = 500
A7 = 1000 (sumbangan 0)
A10 = 3000 (3 hari, 27 Okt - 29 Okt)

Sudah titip (tanpa uang malam ini):
A15 (sisa 12 hari)

Zonk:
A20, A11, A12

Total uang terkumpul: Rp 4.500
```

## 8. Keamanan

Ini aplikasi RT berskala kecil, tetapi tetap ikuti dasar berikut:

- Password **tidak** disimpan polos. Simpan `SHA-256(salt + password)` memakai `Utilities.computeDigest`, dengan `salt` acak per pengguna. (Catatan: ini cukup untuk skala RT; bcrypt tidak tersedia di Apps Script.)
- Token sesi: string acak yang disimpan di `CacheService`/`PropertiesService`, atau token bertanda tangan HMAC (`Utilities.computeHmacSha256Signature`) berisi `user`, `role`, `exp` dengan kunci rahasia di Script Properties. Masa berlaku 7 hari. Frontend menyimpannya di `localStorage`.
- Batasi percobaan login (misalnya 5 kali gagal per nomor rumah, kunci 10 menit) memakai `CacheService`.
- Semua action memeriksa token dan peran di server. Jangan mengandalkan penyembunyian tombol di frontend.
- Deploy Web App dengan **Execute as: Me** dan **Who has access: Anyone** (diperlukan agar GitHub Pages bisa memanggil). Karena itu endpoint publik, seluruh pengamanan ada di logika server di atas.
- Spreadsheet **tidak dibagikan** ke warga. Hak edit hanya untuk 1 sampai 2 admin, karena siapa pun yang punya akses edit bisa mengubah data tanpa lewat aplikasi.
- Escape semua teks dari data sebelum ditampilkan (gunakan `textContent`, bukan `innerHTML`, untuk data pengguna).

## 9. Jebakan Google Sheets yang harus dihindari

- **Konversi tanggal otomatis**: Sheets mengubah teks `2026-10-27` menjadi tanggal. Format kolom tanggal sebagai **Plain Text** (`@`), dan tulis dengan `setNumberFormat('@')` sebelum `setValues`. Saat membaca, bila nilai berupa `Date`, konversi dengan `Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd')`.
- Nomor rumah seperti `A6` aman, tetapi tetap format kolom sebagai Plain Text.
- Zona waktu: set di `appsscript.json` (`"timeZone": "Asia/Jakarta"`) dan selalu pakai tanggal WIB dari server, **bukan jam HP pengguna**, untuk menentukan "hari ini".
- Boolean dari Sheets dapat berupa `TRUE` (boolean) atau teks; normalkan saat membaca.
- Batas waktu eksekusi Apps Script 6 menit; perhitungan jadwal sebulan harus dilakukan di memori dalam satu kali baca data.

## 10. Struktur proyek

```
jimpitan/
├── README.md
├── package.json
├── eslint.config.js
├── .prettierrc.json
├── .prettierignore
├── .editorconfig
├── .gitignore
├── .github/workflows/check.yml
├── docs/                  # dipublikasikan oleh GitHub Pages
│   ├── index.html
│   ├── css/app.css
│   ├── js/               # ES modules (<script type="module">)
│   │   ├── config.js      # API_URL (URL Web App), tidak berisi rahasia
│   │   ├── api.js         # fetch ke Apps Script (text/plain), penanganan error/timeout
│   │   ├── calendar.js
│   │   ├── schedule.js    # hanya untuk tampilan; sumber kebenaran tetap server
│   │   ├── input.js
│   │   └── app.js         # router layar dan state
│   ├── manifest.webmanifest
│   └── icons/
└── apps-script/
    ├── Code.gs            # doPost, router action
    ├── Auth.gs            # login, hash, token, rate limit
    ├── Schedule.gs        # rotasi, tukar, overlay jadwal
    ├── Payments.gs        # hitung hari, titipan, saveNight
    ├── Sheets.gs          # helper baca/tulis dan konversi tanggal
    └── appsscript.json
```

## 11. Kualitas kode: ESLint dan Prettier

ESLint dan Prettier adalah **alat pengembangan saja** (dev tooling), bukan build step. Situs yang di-deploy tetap HTML/CSS/JS statis apa adanya, dan `node_modules` tidak ikut di-commit.

Pembagian tugas: **Prettier mengurus format**, **ESLint mengurus kesalahan dan kualitas logika**. `eslint-config-prettier` mematikan aturan ESLint yang bentrok dengan Prettier, jadi keduanya tidak saling berebut.

### 11.1 Instalasi

Jalankan di akar repo, dan biarkan npm memilih versi stabil terbaru (jangan menulis nomor versi dari ingatan):

```bash
npm init -y
npm install -D eslint @eslint/js globals prettier eslint-config-prettier
```

Gunakan ESLint 9 atau lebih baru dengan **flat config** (`eslint.config.js`). Jangan memakai format lama `.eslintrc`.

### 11.2 Keputusan arsitektur akibat linting

- Frontend memakai **ES modules**: `<script type="module" src="js/app.js"></script>`, dan antar file memakai `import`/`export`.
- **Jangan menulis JavaScript inline di `index.html`.** ESLint tidak membaca isi HTML, jadi semua kode harus berada di file `.js`.
- Folder `apps-script/` memakai file `.gs` yang berbagi satu ruang global (tanpa `import`/`export`). Karena itu `no-undef` dan `no-unused-vars` dimatikan khusus folder ini.

### 11.3 `package.json` (bagian yang diubah)

```json
{
  "name": "jimpitan",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run lint && npm run format:check"
  }
}
```

### 11.4 `eslint.config.js`

```js
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

const gasGlobals = Object.fromEntries(
  [
    "SpreadsheetApp",
    "LockService",
    "CacheService",
    "PropertiesService",
    "Utilities",
    "ContentService",
    "Logger",
    "Session",
  ].map((name) => [name, "readonly"]),
);

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    // Frontend (GitHub Pages)
    files: ["docs/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "innerHTML",
          message:
            "Gunakan textContent untuk data pengguna (spesifikasi bagian 8). Untuk templat statis, beri eslint-disable-next-line beserta alasan.",
        },
      ],
    },
  },
  {
    // Backend (Google Apps Script)
    files: ["apps-script/**/*.gs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: gasGlobals,
    },
    rules: {
      "no-unused-vars": "off", // fungsi dipanggil oleh runtime Apps Script / file lain
      "no-undef": "off", // fungsi antar file berbagi ruang global
    },
  },
  {
    // File konfigurasi di akar repo
    files: ["*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier, // harus terakhir
];
```

### 11.5 `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf",
  "overrides": [{ "files": "*.gs", "options": { "parser": "babel" } }]
}
```

`.prettierignore`:

```
node_modules
docs/icons
```

`.editorconfig`:

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.gitignore` minimal: `node_modules/`.

Prettier juga memformat `.html`, `.css`, `.json`, dan `.md` secara otomatis, jadi seluruh repo seragam.

### 11.6 Pemeriksaan otomatis di GitHub (opsional tapi disarankan)

`.github/workflows/check.yml` menjalankan pemeriksaan pada setiap push dan pull request (gunakan versi action stabil terbaru):

```yaml
name: check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
```

Opsional: `husky` + `lint-staged` untuk menjalankan `prettier --write` dan `eslint --fix` pada berkas yang akan di-commit.

### 11.7 Aturan kerja untuk agent

- Jalankan `npm run format` lalu `npm run check` **sebelum menyatakan satu tahap selesai**.
- Jangan menambahkan `eslint-disable` tanpa komentar alasan. Pengecualian `innerHTML` hanya untuk templat statis yang tidak memuat data pengguna.
- Jangan mengubah aturan di `eslint.config.js` untuk meloloskan kode; perbaiki kodenya.
- Peringatan (warning) dianggap kegagalan (`--max-warnings 0`).

## 12. Deploy

**Apps Script**

1. Buat Google Sheet baru dan buat sheet sesuai bagian 5 (header persis).
2. Extensions → Apps Script, tempel isi folder `apps-script/`.
3. Isi Script Properties: `SECRET` (acak panjang), `SPREADSHEET_ID`.
4. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**. Salin URL ke `docs/js/config.js`.
5. Setiap perubahan kode butuh **deployment versi baru** agar URL yang sama memakai kode terbaru.

**GitHub Pages**

1. Push repo ke GitHub.
2. Settings → Pages → Source: branch `main`, folder `/docs`.
3. Akses di `https://taqin98.github.io/web-jimpitan/`.

## 13. Tahapan pengerjaan (urutan yang disarankan)

0. **Tooling**: siapkan `package.json`, ESLint, dan Prettier sesuai bagian 11, lalu pastikan `npm run check` lulus pada proyek kosong.
1. **Fondasi backend**: `Sheets.gs` (helper + konversi tanggal), `Auth.gs` (login, hash, token), `doPost` router. Uji `login` lewat curl/Postman.
2. **Jadwal**: `Schedule.gs` dengan rotasi berdasarkan master data rumah aktif. Tulis fungsi uji dengan kasus A35 → A6 (master A6 sampai A35).
3. **Frontend kalender** dengan data dari `getBootstrap`, tanpa fitur tukar dahulu.
4. **Input dan simpan**: `Payments.gs` (`getInputForm`, `saveNight`), layar input dan rekap, termasuk kunci titipan.
5. **Tukar jadwal**: `requestSwap`, `respondSwap`, `cancelSwap`, kartu permintaan di beranda.
6. **Admin dan ganti password**, lalu PWA dan poles tampilan.

Tiap tahap harus berjalan penuh dan `npm run check` lulus tanpa peringatan sebelum lanjut.

## 14. Kriteria penerimaan dan kasus uji

Fungsi hitung (uji unit di Apps Script dan di sisi klien untuk tampilan):

| Nominal | Hari     | Sumbangan |
| ------- | -------- | --------- |
| 0       | 0 (zonk) | 0         |
| 499     | 0 (zonk) | 0         |
| 500     | 1        | 0         |
| 1000    | 1        | 0         |
| 1500    | 1        | 500       |
| 2000    | 2        | 0         |
| 2500    | 2        | 500       |
| 30000   | 30       | 0         |

Jadwal:

- [ ] Jika master berisi A6 sampai A35 (A1 sampai A5 tidak ada), hari setelah A35 adalah A6.
- [ ] Menonaktifkan A6 (`aktif = FALSE`) hanya mengubah tanggal setelah log terakhir; tanggal yang sudah tersimpan di `Jimpitan` tidak berubah.
- [ ] Layar input dan daftar zonk hanya berisi rumah di master yang aktif.
- [ ] Tukar A6 (30 Okt) dengan A9 (giliran berikutnya 2 Nov): 30 Okt = A9, 2 Nov = A6, 31 Okt tetap A7.
- [ ] Persetujuan ditolak (`KADALUARSA`) jika salah satu tanggal sudah berubah sejak permintaan dibuat.
- [ ] Pembatalan tukar oleh admin mengembalikan kedua tanggal.

Titipan:

- [ ] A10 bayar 3000 pada 1 Okt: pada 2 dan 3 Okt statusnya sudah titip, tidak masuk zonk, tidak ada baris Setoran baru; pada 4 Okt kembali normal.
- [ ] Rumah titip tidak bisa diinput di layar input.

Hak akses:

- [ ] Pengguna yang bukan petugas malam itu mendapat `FORBIDDEN` pada `getInputForm` dan `saveNight`, walau memanggil API langsung.
- [ ] Hanya admin yang dapat memanggil `adminSetAktif`, `adminAddHouse`, dan `adminResetPassword`.
- [ ] Penyimpanan ulang tanggal yang sama tidak menggandakan baris Setoran.

Lainnya:

- [ ] `npm run check` (ESLint dan Prettier) lulus tanpa error maupun peringatan.
- [ ] Tidak ada JavaScript inline di `index.html` dan tidak ada `innerHTML` untuk data pengguna.
- [ ] Dua pengguna menyimpan bersamaan tidak menimbulkan data rusak (lock bekerja).
- [ ] Tampilan nyaman di layar 360 px dan terbaca di mode gelap.
- [ ] Rekap yang disalin sama persis dengan format bagian 7.

## 15. Di luar cakupan (jangan dikerjakan dahulu)

Pengingat otomatis ke WhatsApp, mode offline penuh, laporan bulanan lanjutan, pembayaran digital, dan penyimpanan foto.

## 16. Referensi prototipe

Prototipe HTML sudah ada dan memuat logika kalender, rotasi dengan lompat, tukar jadwal, input, dan rekap (data masih di `localStorage`). Gunakan sebagai referensi perilaku dan tampilan, lalu pindahkan seluruh logika data dan aturan ke Apps Script. Prototipe: https://claude.ai/artifact/9ZRtvuiLcNWeUymkZgnxst
