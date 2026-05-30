# ngrok Forwarding + Firebase App Distribution

Tutorial self-host: **backend berjalan di laptop Anda (port 3000)** dan diekspos ke
internet lewat ngrok, sehingga **dashboard (di Vercel)** dan **APK Flutter (Firebase
App Distribution)** bisa menjangkaunya dari mana saja. Backend lokal (`localhost:3000`)
tetap hidup normal saat ngrok berjalan — ngrok hanya membuka jalur internet tambahan.

---

## 1. Setup ngrok (sekali)

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <TOKEN_ANDA>   # dari https://dashboard.ngrok.com
```

Authtoken disimpan global di komputer (`%LOCALAPPDATA%\ngrok\ngrok.yml`) — **tidak
disimpan di repo ini**.

**Static domain:** Klaim 1 static domain gratis di <https://dashboard.ngrok.com/domains>,
lalu isikan ke `domain:` pada `ngrok.yml`. Static domain yang sama juga dipakai oleh:
- env Vercel `NEXT_PUBLIC_HOST_NGROK` (frontend)
- `cbt_app/lib/utils/url.dart` → `_ngrokHost` (mobile)

## 2. Menjalankan tiap sesi (di laptop Anda)

```powershell
npm run dev      # 1) backend dulu di localhost:3000
npm run ngrok    # 2) ekspos backend ke https://<static-domain>
```

URL backend `https://<static-domain>` tetap sama selama memakai static domain. Biarkan
keduanya berjalan selama sistem dipakai.

## 3. Bagaimana lokal + online jalan bersamaan

| Client | Mode lokal (dev) | Mode online |
|--------|------------------|-------------|
| **Dashboard** | `localhost:3001` → Axios ke `localhost:3000` | di Vercel → Axios ke URL ngrok backend (`NEXT_PUBLIC_HOST_NGROK`) |
| **Flutter** | `useNgrok=false` di `url.dart` | `useNgrok=true` di `url.dart` |
| **Backend CORS** | Origins dari `CORS_ORIGINS` | `ALLOW_NGROK_ORIGINS=true` + `ALLOW_VERCEL_ORIGINS=true` |

Yang sudah ditangani di kode:
- **Header `ngrok-skip-browser-warning`** — Axios kirim header ini agar XHR dapat JSON, bukan halaman HTML interstitial ngrok.
- **CSP `connect-src`/`img-src`** di `next.config.mjs` — diturunkan dari `NEXT_PUBLIC_HOST_NGROK`, jadi pastikan env itu benar di Vercel.
- **`trust proxy 1`** — backend baca IP asli client di balik proxy ngrok.

> **Penting:** matikan `ALLOW_NGROK_ORIGINS` di environment production yang sebenarnya.

## 4. Env var

**`cbt-backend/.env`** (laptop Anda):
```env
ALLOW_NGROK_ORIGINS=true
ALLOW_VERCEL_ORIGINS=true
```

**Vercel → Project Settings → Environment Variables** (frontend):
```env
NEXT_PUBLIC_HOST_NGROK=https://<static-domain>/api/
NEXT_PUBLIC_HOST=https://<static-domain>/api/
```

**`cbt_app/lib/utils/url.dart`** (mobile):
```dart
static const String _ngrokHost = "<static-domain>";
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
