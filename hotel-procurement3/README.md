# 🏨 Hotel Procurement — Ticket Extractor

Baca tiket support dari sistem ticketing, ekstrak kebutuhan pengadaan menggunakan Gemini AI, lalu tulis langsung ke Google Sheets untuk dilacak oleh tim purchasing.

---

## Alur Kerja

```
Staff paste/upload tiket → AI baca & ekstrak item pengadaan
    → AI mencari kisaran harga di toko online (Google Search) untuk setiap item
        → Preview & konfirmasi → Tulis ke Google Sheets
              → Tim purchasing isi Harga Fix, Lunas, Status langsung di Sheet
```

**Catatan tentang estimasi harga:** Sistem ini mencari harga secara otomatis melalui Google Search (termasuk hasil dari Google Shopping, Tokopedia, Shopee, dll) untuk setiap item yang diekstrak. Karena setiap item memerlukan pencarian terpisah, proses akan memakan waktu lebih lama untuk batch tiket yang besar (perkirakan beberapa detik per item). Estimasi harga tetap merupakan referensi awal — harga final harus diverifikasi oleh tim purchasing dan diisi pada kolom "Harga Fix".

---

## Struktur Folder

```
hotel-procurement/
├── server.js                    ← Entry point
├── package.json
├── railway.json                 ← Railway deploy config
├── .env.example                 ← Copy ke .env dan isi nilainya
├── routes/
│   ├── auth.js                  ← Login / logout
│   └── tickets.js               ← Extract + submit ke Sheets
├── services/
│   ├── geminiService.js         ← Gemini AI: baca tiket & ekstrak item
│   └── googleSheetsService.js   ← Tulis ke Google Sheets
├── middleware/
│   └── authMiddleware.js
├── data/
│   └── sop/                     ← ⭐ Taruh file SOP .txt atau .md di sini
└── public/                      ← Frontend (tidak perlu build)
    ├── index.html
    ├── manifest.json
    ├── sw.js
    ├── css/main.css
    └── js/app.js
```

---

## Setup

### 1. Gemini API Key
1. Buka [aistudio.google.com](https://aistudio.google.com)
2. Klik **Get API Key → Create API key**
3. Copy → isi ke `GEMINI_API_KEY`

---

### 2. Google Service Account
1. Buka [console.cloud.google.com](https://console.cloud.google.com)
2. Buat project baru
3. Enable **Google Drive API** dan **Google Sheets API**
4. Buka **IAM & Admin → Service Accounts → Create Service Account**
5. Beri nama, klik **Create and Continue → Done**
6. Klik service account → tab **Keys → Add Key → JSON** → download
7. Dari file JSON, copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

---

### 3. Google Drive Folder
1. Buat folder di Google Drive (contoh: `Procurement`)
2. Klik kanan folder → **Share** → masukkan `client_email` → set **Editor**
3. Buka folder, copy ID dari URL:
   `drive.google.com/drive/folders/`**`INI_ADALAH_FOLDER_ID`**
4. Isi ke `GOOGLE_DRIVE_FOLDER_ID`

Sheet akan dibuat otomatis di folder ini saat pertama kali submit.

---

### 4. Konfigurasi .env
```bash
cp .env.example .env
# Edit .env dan isi semua nilainya
```

```env
GEMINI_API_KEY=isi_api_key_gemini

# Login staff: format username:password,username:password
USERS=admin:admin123,purchasing:hotel456

GOOGLE_SERVICE_ACCOUNT_EMAIL=hotel-procurement@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nISI_KEY\n-----END RSA PRIVATE KEY-----\n"

GOOGLE_DRIVE_FOLDER_ID=id_folder_google_drive
GOOGLE_SHEET_NAME=Hotel Procurement

SESSION_SECRET=string_panjang_acak_di_sini
NODE_ENV=production
```

---

### 5. Tambah File SOP
Taruh file SOP pengadaan ke folder `data/sop/` dalam format `.txt` atau `.md`.
AI akan membacanya saat mengekstrak tiket. File contoh sudah tersedia.

---

### 6. Kelola User Login
Edit variabel `USERS` di `.env`:
```
USERS=admin:password1,john:password2,purchasing:password3
```
Restart server setelah mengubah.

---

## Deploy ke Railway

1. Push folder ini ke **GitHub repository**
2. Buka [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
3. Pilih repository
4. Buka tab **Variables** di Railway → masukkan semua nilai dari `.env`
5. Deploy otomatis — satu URL untuk segalanya ✅

> ⚠️ Jangan tambahkan `PORT` ke Variables Railway — Railway mengaturnya otomatis.

## Jalankan Lokal

```bash
npm install
cp .env.example .env   # isi nilainya
node server.js
# Buka http://localhost:3001
```

---

## Kolom Google Sheets

| Kolom | Deskripsi | Diisi Oleh |
|---|---|---|
| ID | Nomor urut otomatis | Sistem |
| Tanggal Input | Tanggal item dimasukkan | Sistem |
| No. Tiket | Nomor tiket dari sistem | AI |
| Judul Tiket | Judul tiket asli | AI |
| Cabang | Nama cabang/lokasi hotel | AI |
| Dept | IT, ME, Housekeeping, F&B, dll | AI |
| Deskripsi | Item yang perlu dibeli/diperbaiki | AI |
| Estimasi Harga | Kisaran harga perkiraan | AI |
| Harga Fix (IDR) | Harga aktual setelah pembelian | **Tim Purchasing** |
| Lunas | Belum Lunas / Lunas | **Tim Purchasing** |
| Status | Pending / In Progress / Finish | **Tim Purchasing** |
| Hari | Rumus otomatis: berapa hari sejak input | Sistem |
| Diminta Oleh | Nama yang mengajukan di tiket | AI |
| Tanggal Permintaan | Tanggal dari tiket asli | AI |
| Urgensi | normal / urgent / critical | AI |
| Catatan | Catatan tambahan dari tiket | AI |
| Diinput Oleh | Username yang submit ke sheet | Sistem |

---

## Troubleshooting

**Google Sheets gagal sync**
→ Pastikan `client_email` sudah diberi akses **Editor** ke folder Drive.

**Login tidak bisa**
→ Cek format `USERS`: harus `username:password` dipisah koma, tanpa spasi.

**Private key error**
→ Pastikan key dalam satu baris dengan `\n` (bukan line break nyata), dan dibungkus tanda kutip ganda.

**AI tidak menemukan item pengadaan**
→ Pastikan teks tiket cukup jelas menyebutkan kebutuhan pembelian atau perbaikan. Tiket yang hanya berisi "closed/done" akan dilewati.

**Proses terasa lambat untuk banyak tiket**
→ Wajar — setiap item memerlukan pencarian harga terpisah ke Google Search. Semakin banyak item yang diekstrak, semakin lama prosesnya. Ini normal dan tidak berarti aplikasi error.

**Estimasi harga kosong/"Tidak ditemukan" untuk beberapa item**
→ Bisa terjadi jika deskripsi item terlalu umum/ambigu, atau hasil pencarian web tidak menemukan produk yang sesuai. Tim purchasing bisa langsung mengisi "Harga Fix" secara manual di Sheet.

**Penggunaan kuota API meningkat**
→ Fitur pencarian harga menggunakan 1 panggilan AI tambahan (dengan web search) per item, di luar 1 panggilan untuk ekstraksi tiket. Untuk batch 10 item, totalnya sekitar 11 panggilan API.

**Data hilang setelah redeploy di Railway**
→ Railway filesystem reset saat redeploy. Data sudah aman di Google Sheets — yang hilang hanya riwayat sesi di layar (bukan data sheet).
