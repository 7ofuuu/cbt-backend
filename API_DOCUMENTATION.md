# CBT Backend API Documentation

API Backend untuk Aplikasi Computer Based Test (CBT) dengan role Admin, Guru, dan Siswa.

## Base URL
```
http://localhost:3000/api
```

## Authentication
Semua endpoint (kecuali auth) memerlukan JWT token di header:
```
Authorization: Bearer <token>
```

---

## 📌 AUTH ENDPOINTS

### 1. Register User
**POST** `/auth/register`

**Body:**
```json
{
  "username": "guru1",
  "password": "password123",
  "role": "guru",
  "nama": "Budi Santoso",
  
  // Wajib jika role = siswa:
  "kelas": "10A",
  "tingkat": "10",
  "jurusan": "IPA"
}
```

**Response:**
```json
{
  "message": "User berhasil didaftarkan",
  "userId": 1
}
```

### 2. Login
**POST** `/auth/login`

**Body:**
```json
{
  "username": "guru1",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "role": "guru",
    "profile": {
      "guru_id": 1,
      "nama_lengkap": "Budi Santoso"
    }
  }
}
```

---

## 📚 SOAL ENDPOINTS (Guru Only)

### 1. Create Soal
**POST** `/soal`

**Headers:** `Authorization: Bearer <token>`

**Body (Pilihan Ganda):**
```json
{
  "tipe_soal": "PILIHAN_GANDA_SINGLE",
  "teks_soal": "Berapa hasil dari 2 + 2?",
  "mata_pelajaran": "Matematika",
  "tingkat": "10",
  "jurusan": "IPA",
  "soal_gambar": null,
  "soal_pembahasan": "2 + 2 = 4",
  "opsi_jawaban": [
    { "label": "A", "teks_opsi": "3", "is_benar": false },
    { "label": "B", "teks_opsi": "4", "is_benar": true },
    { "label": "C", "teks_opsi": "5", "is_benar": false },
    { "label": "D", "teks_opsi": "6", "is_benar": false },
    { "label": "E", "teks_opsi": "7", "is_benar": false }
  ]
}
```

**Body (Essay):**
```json
{
  "tipe_soal": "ESSAY",
  "teks_soal": "Jelaskan konsep limit dalam matematika",
  "mata_pelajaran": "Matematika",
  "tingkat": "12",
  "jurusan": "IPA"
}
```

### 2. Get All Soal (dengan filter)
**GET** `/soal?mata_pelajaran=Matematika&tingkat=10`

### 3. Get Soal by ID
**GET** `/soal/:id`

### 4. Update Soal
**PUT** `/soal/:id`

**Body:** (sama seperti create, isi field yang ingin diupdate)

### 5. Delete Soal
**DELETE** `/soal/:id`

---

## 📝 UJIAN ENDPOINTS (Guru Only)

### 1. Create Ujian
**POST** `/ujian`

**Body:**
```json
{
  "nama_ujian": "Ujian Tengah Semester Matematika",
  "mata_pelajaran": "Matematika",
  "tingkat": "10",
  "jurusan": "IPA",
  "tanggal_mulai": "2025-01-15T08:00:00.000Z",
  "tanggal_selesai": "2025-01-15T12:00:00.000Z",
  "durasi_menit": 120,
  "is_acak_soal": true
}
```

### 2. Get All Ujian
**GET** `/ujian`

### 3. Get Ujian by ID
**GET** `/ujian/:id`

### 4. Update Ujian
**PUT** `/ujian/:id`

### 5. Delete Ujian
**DELETE** `/ujian/:id`

### 6. Assign Soal ke Ujian
**POST** `/ujian/assign-soal`

**Body:**
```json
{
  "ujian_id": 1,
  "soal_id": 5,
  "bobot_nilai": 10,
  "urutan": 1
}
```

### 7. Remove Soal dari Ujian
**DELETE** `/ujian/remove-soal/:soal_ujian_id`

### 8. Assign Siswa ke Ujian
**POST** `/ujian/assign-siswa`

**Body:**
```json
{
  "ujian_id": 1,
  "tingkat": "10",
  "jurusan": "IPA"
}
```

---

## 🎓 SISWA ENDPOINTS (Siswa Only)

### 1. Get My Ujians
**GET** `/siswa/ujians`

**Response:**
```json
{
  "ujians": [
    {
      "peserta_ujian_id": 1,
      "status_ujian": "BELUM_MULAI",
      "ujian": {
        "nama_ujian": "Ujian MTK",
        "tanggal_mulai": "2025-01-15T08:00:00.000Z"
      }
    }
  ]
}
```

### 2. Start Ujian
**POST** `/siswa/ujians/start`

**Body:**
```json
{
  "peserta_ujian_id": 1
}
```

### 3. Submit Jawaban
**POST** `/siswa/ujians/jawaban`

**Body (Pilihan Ganda Single):**
```json
{
  "peserta_ujian_id": 1,
  "soal_id": 5,
  "jawaban_pg_opsi_ids": "[\"2\"]"
}
```

**Body (Pilihan Ganda Multiple):**
```json
{
  "peserta_ujian_id": 1,
  "soal_id": 6,
  "jawaban_pg_opsi_ids": "[\"2\", \"4\"]"
}
```

**Body (Essay):**
```json
{
  "peserta_ujian_id": 1,
  "soal_id": 7,
  "jawaban_essay_text": "Limit adalah nilai yang didekati oleh suatu fungsi..."
}
```

### 4. Finish Ujian
**POST** `/siswa/ujians/finish`

**Body:**
```json
{
  "peserta_ujian_id": 1
}
```

### 5. Get Hasil Ujian
**GET** `/siswa/ujians/hasil/:peserta_ujian_id`

---

## 👥 USER MANAGEMENT ENDPOINTS

### Admin Only

#### 1. Get All Users
**GET** `/users?role=siswa&status_aktif=true`

#### 2. Create User
**POST** `/users`

**Body:** (sama seperti register)

#### 3. Update User Role
**PUT** `/users/:id/role`

**Body:**
```json
{
  "role": "guru"
}
```

#### 4. Toggle User Status
**PATCH** `/users/:id/status`

#### 5. Delete User
**DELETE** `/users/:id`

---

### Guru Only - Penilaian

#### 1. Nilai Jawaban Essay Manual
**POST** `/users/nilai`

**Body:**
```json
{
  "jawaban_id": 15,
  "nilai_manual": 85
}
```

#### 2. Finalisasi Nilai (Hitung Total)
**POST** `/users/finalisasi`

**Body:**
```json
{
  "peserta_ujian_id": 1
}
```

**Response:**
```json
{
  "message": "Nilai berhasil difinalisasi",
  "nilai_akhir": "87.50"
}
```

---

## 🔑 Role-Based Access

| Endpoint | Admin | Guru | Siswa |
|----------|-------|------|-------|
| `/auth/*` | ✅ | ✅ | ✅ |
| `/soal/*` | ❌ | ✅ | ❌ |
| `/ujian/*` | ❌ | ✅ | ❌ |
| `/siswa/*` | ❌ | ❌ | ✅ |
| `/users` (User Mgmt) | ✅ | ❌ | ❌ |
| `/users/nilai` | ❌ | ✅ | ❌ |

---

## 📊 Database Schema

Lihat file `prisma/schema.prisma` untuk struktur database lengkap.

**Main Entities:**
- User (Admin, Guru, Siswa)
- Soal & OpsiJawaban
- Ujian
- SoalUjian (Many-to-Many)
- PesertaUjian (Many-to-Many)
- Jawaban
- HasilUjian

---

## 🚀 Setup & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```bash
# Jalankan MySQL server
# Edit .env sesuai kredensial database Anda

# Generate Prisma Client & Run Migration
npx prisma migrate dev --name init
```

### 3. Run Server
```bash
npm start
# atau
node index.js
```

### 4. Test dengan Postman
1. Import collection dari dokumentasi ini
2. Login sebagai admin/guru/siswa
3. Copy token dari response
4. Set Bearer Token di Postman
5. Test endpoint sesuai role

---

## 📝 Example Workflow

### Guru membuat ujian:
1. Login → Get token
2. POST `/soal` → Buat 10 soal
3. POST `/ujian` → Buat ujian baru
4. POST `/ujian/assign-soal` → Assign 10 soal ke ujian
5. POST `/ujian/assign-siswa` → Assign siswa kelas 10 IPA

### Siswa mengerjakan ujian:
1. Login → Get token
2. GET `/siswa/ujians` → Lihat ujian tersedia
3. POST `/siswa/ujians/start` → Mulai ujian
4. POST `/siswa/ujians/jawaban` → Submit jawaban (repeat 10x)
5. POST `/siswa/ujians/finish` → Selesai ujian

### Guru menilai:
1. GET `/ujian/:id` → Lihat peserta & jawaban
2. POST `/users/nilai` → Nilai essay manual (jika ada)
3. POST `/users/finalisasi` → Finalisasi nilai total

### Siswa lihat hasil:
1. GET `/siswa/ujians/hasil/:peserta_ujian_id` → Lihat nilai

---

## ⚠️ Error Responses

```json
{
  "error": "Token tidak valid atau expired"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (no token)
- `403` - Forbidden (wrong role)
- `404` - Not Found
- `500` - Server Error

---

**Happy Testing! 🎉**
