# ngrok Forwarding + Firebase App Distribution

Mengekspos **backend lokal (port 3000)** dan **dashboard (port 3001)** ke internet
lewat ngrok — dibutuhkan agar APK Flutter yang didistribusi via Firebase App
Distribution bisa menjangkau server dari HP manapun.

Server lokal (`localhost:3000`, `localhost:3001`) **tetap hidup normal** saat ngrok
berjalan. ngrok hanya membuka jalur internet tambahan, tidak menggantikan lokal.

---

## 1. Setup satu kali (per anggota tim)

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <TOKEN_ANDA>   # dari https://dashboard.ngrok.com
```

Masing-masing anggota tim perlu akun ngrok sendiri dan authtoken sendiri.
Authtoken disimpan global di komputer (`%LOCALAPPDATA%\ngrok\ngrok.yml`) — **tidak
disimpan di repo ini**.

**Static domain:** Klaim 1 static domain gratis di <https://dashboard.ngrok.com/domains>,
lalu isi di `ngrok.yml` (repo ini), `cbt-dashboard/.env` (`NEXT_PUBLIC_HOST_NGROK`),
dan `cbt_app/lib/utils/url.dart` (`_ngrokHost`).

## 2. Menjalankan setiap sesi

```
1. Jalankan backend dulu:    npm run dev
2. Baru jalankan ngrok:
```

```powershell
ngrok start --all --config "$env:LOCALAPPDATA\ngrok\ngrok.yml" --config ".\ngrok.yml"
```

Atau jika pakai script root UAS:

```powershell
.\scripts\start-ngrok.ps1
```

ngrok menampilkan dua URL:
- `https://<static-domain>` → backend (selalu sama)
- `https://xxxx.ngrok-free.app` → dashboard (random per sesi, copy jika perlu)

## 3. Bagaimana lokal + ngrok bisa jalan bersamaan

| Client | Mode lokal | Mode ngrok |
|--------|-----------|-----------|
| **Dashboard** | Buka `localhost:3001` → Axios ke `localhost:3000` otomatis | Buka URL ngrok dashboard → Axios ke URL ngrok backend otomatis |
| **Flutter** | `useNgrok=false` di `url.dart` | `useNgrok=true` di `url.dart` |
| **Backend CORS** | Origins dari `CORS_ORIGINS` | `ALLOW_NGROK_ORIGINS=true` → izinkan `*.ngrok-free.app` |

Yang sudah ditangani di kode:
- **Header `ngrok-skip-browser-warning`** — Axios kirim header ini agar XHR dapat JSON, bukan halaman HTML interstitial ngrok.
- **CSP `connect-src`** di `next.config.mjs` — sudah menyertakan domain ngrok backend.
- **`allowedDevOrigins`** — Next dev server mengizinkan request dari `*.ngrok-free.app`.
- **`trust proxy 1`** — backend baca IP asli client di balik proxy ngrok.

> **Penting:** Set `ALLOW_NGROK_ORIGINS=false` di environment production.

## 4. Env var yang perlu ditambahkan anggota tim

Setelah pull, copy dari `.env.example` dan isi sesuai domain masing-masing:

**`cbt-backend/.env`** — tambahkan:
```env
ALLOW_NGROK_ORIGINS=true
```

**`cbt-dashboard/.env`** — tambahkan:
```env
NEXT_PUBLIC_HOST_NGROK=https://<static-domain-kamu>/api/
```

**`cbt_app/lib/utils/url.dart`** — ubah:
```dart
static const String _ngrokHost = "<static-domain-kamu>";
```

---

## 5. Firebase App Distribution

Firebase **tidak meng-host backend** — hanya mendistribusikan APK ke tester.
Backend tetap lokal, diekspos lewat ngrok. Tidak perlu tambah SDK Firebase ke Flutter.

**Info project Firebase:**
- Project ID: `cbt-app-cf719`
- Android App ID: `1:1011876777198:android:0b2daadf90ae801ddcb7ff`
- Package: `com.example.cbt_app`
- `google-services.json` sudah ada di `cbt_app/android/app/`
- `firebase.json` sudah ada di `cbt_app/` (konfigurasi App Distribution + grup testers)

**Langkah distribusi:**

```powershell
# 1. Login Firebase (satu kali)
firebase login

# 2. Set url.dart ke mode ngrok
#    Edit cbt_app/lib/utils/url.dart -> useNgrok = true

# 3. Build APK release
cd cbt_app
flutter build apk --release

# 4. Upload ke App Distribution
firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk `
  --app 1:1011876777198:android:0b2daadf90ae801ddcb7ff `
  --groups testers `
  --release-notes "Describe what changed in this build"

# 5. Kembalikan useNgrok = false untuk dev lokal
```

Atau dari direktori `cbt_app/` (firebase.json sudah ada):
```powershell
firebase appdistribution:distribute build/app/outputs/flutter-apk/app-release.apk `
  --release-notes "Describe what changed"
```

Tester dapat undangan email → install → app konek ke backend lewat ngrok static domain.

**Tambah tester** di Firebase Console → App Distribution → Testers & Groups → buat grup `testers` lalu tambahkan email tester.

Static domain wajib digunakan agar URL tidak berubah tiap restart dan APK tidak
perlu di-rebuild setiap sesi.
