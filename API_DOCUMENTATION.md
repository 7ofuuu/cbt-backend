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

### 6. Get Bank Soal (Grouped by Mata Pelajaran, Tingkat, Jurusan)
**GET** `/soal/bank`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "bankSoal": [
    {
      "mata_pelajaran": "Matematika",
      "tingkat": "X",
      "jurusan": "IPA",
      "jumlah_soal": 25,
      "jumlah_pg": 20,
      "jumlah_essay": 5
    },
    {
      "mata_pelajaran": "Fisika",
      "tingkat": "XI",
      "jurusan": "IPA",
      "jumlah_soal": 15,
      "jumlah_pg": 12,
      "jumlah_essay": 3
    }
  ],
  "total_soal": 40
}
```

**Notes:**
- Returns soal grouped by mata_pelajaran, tingkat, and jurusan
- Includes count of total soal, PG soal, and essay soal per group
- Used for Bank Soal management interface

### 7. Get Soal by Bank (Mata Pelajaran, Tingkat, Jurusan)
**GET** `/soal/bank/:mataPelajaran/:tingkat/:jurusan`

**Example:** `/soal/bank/Matematika/X/IPA`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "bankInfo": {
    "mata_pelajaran": "Matematika",
    "tingkat": "X",
    "jurusan": "IPA"
  },
  "soals": [
    {
      "soal_id": 1,
      "tipe_soal": "PILIHAN_GANDA_SINGLE",
      "teks_soal": "Berapa hasil dari 2 + 2?",
      "mata_pelajaran": "Matematika",
      "tingkat": "X",
      "jurusan": "IPA",
      "created_at": "2025-12-20T10:00:00.000Z",
      "opsi_jawaban": [
        {
          "opsi_id": 1,
          "label": "A",
          "teks_opsi": "3",
          "is_benar": false
        },
        {
          "opsi_id": 2,
          "label": "B",
          "teks_opsi": "4",
          "is_benar": true
        }
      ]
    }
  ],
  "stats": {
    "total_soal": 25,
    "total_pg_single": 15,
    "total_pg_multiple": 5,
    "total_essay": 5
  }
}
```

**Notes:**
- Returns all soal in a specific bank
- Includes opsi_jawaban for PG questions
- Provides statistics about the bank

### 8. Get Available Soal for Ujian
**GET** `/soal/ujian/:ujianId/tersedia`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "ujian": {
    "ujian_id": 1,
    "nama_ujian": "Ujian Tengah Semester Matematika",
    "mata_pelajaran": "Matematika",
    "tingkat": "X",
    "jurusan": "IPA"
  },
  "soal_tersedia": [
    {
      "soal_id": 1,
      "tipe_soal": "PILIHAN_GANDA_SINGLE",
      "teks_soal": "Berapa hasil dari 2 + 2?",
      "is_assigned": false
    },
    {
      "soal_id": 2,
      "tipe_soal": "ESSAY",
      "teks_soal": "Jelaskan konsep limit",
      "is_assigned": true
    }
  ],
  "total_tersedia": 25,
  "total_assigned": 10
}
```

**Notes:**
- Returns soal matching ujian's mata_pelajaran, tingkat, and jurusan
- `is_assigned` indicates if soal is already added to this ujian
- Used for adding soal to ujian interface

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
  "is_acak_soal": true,
  "auto_assign_siswa": true
}
```

**Response:**
```json
{
  "message": "Ujian berhasil dibuat",
  "ujian_id": 1,
  "auto_assign_enabled": true,
  "jumlah_siswa_assigned": 25
}
```

**Notes:**
- `auto_assign_siswa` (optional, default: `true`) - Otomatis assign siswa berdasarkan tingkat & jurusan
- Jika `true`, semua siswa dengan tingkat dan jurusan yang cocok akan langsung di-assign
- Jika `false`, guru harus manual assign siswa menggunakan endpoint `/ujian/assign-siswa`

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

### 7. Assign Bank Soal ke Ujian (Batch)
**POST** `/ujian/assign-bank`

**Body:**
```json
{
  "ujian_id": 1,
  "mata_pelajaran": "Matematika",
  "tingkat": "X",
  "jurusan": "IPA",
  "bobot_nilai_default": 10,
  "is_acak": true
}
```

**Response:**
```json
{
  "message": "25 soal dari bank berhasil ditambahkan ke ujian",
  "jumlah_soal": 25,
  "is_acak": true
}
```

**Notes:**
- Assigns all soal from specified bank (mata_pelajaran, tingkat, jurusan) to ujian
- `bobot_nilai_default` applies to all soal (default: 10)
- `is_acak`: if true, randomizes the order of soal
- Automatically sets urutan based on existing soal in ujian
- Skips duplicates if soal already assigned

### 8. Remove Soal dari Ujian
**DELETE** `/ujian/remove-soal/:soal_ujian_id`

**Notes:**
- Only removes the relationship (soalUjian), NOT the soal from master data
- Soal remains in bank and can be re-assigned

### 9. Remove Multiple Soal dari Ujian (Batch)
**DELETE** `/ujian/remove-multiple-soal`

**Body:**
```json
{
  "ujian_id": 1,
  "soal_ujian_ids": [1, 2, 3, 4, 5]
}
```

**Response:**
```json
{
  "message": "5 soal berhasil dihapus dari ujian",
  "jumlah_dihapus": 5
}
```

**Notes:**
- Batch delete multiple soal from ujian
- Validates all soal_ujian_ids belong to the specified ujian
- Only removes relationships, not master data

### 10. Remove Bank dari Ujian
**DELETE** `/ujian/remove-bank`

**Body:**
```json
{
  "ujian_id": 1,
  "mata_pelajaran": "Matematika",
  "tingkat": "X",
  "jurusan": "IPA"
}
```

**Response:**
```json
{
  "message": "15 soal dari bank Matematika-X-IPA berhasil dihapus dari ujian",
  "jumlah_dihapus": 15
}
```

**Notes:**
- Removes all soal from specified bank (mata_pelajaran + tingkat + jurusan)
- **jurusan is REQUIRED**
- Useful for removing entire bank assignment at once

### 11. Clear All Soal dari Ujian
**DELETE** `/ujian/:ujianId/clear-soal`

**Response:**
```json
{
  "message": "Semua soal berhasil dihapus dari ujian",
  "jumlah_dihapus": 25
}
```

**Notes:**
- Removes ALL soal from ujian (reset)
- Useful for starting fresh when reconfiguring ujian

### 12. Get Soal Ujian Grouped by Bank
**GET** `/ujian/:ujianId/soal-by-bank`

**Response:**
```json
{
  "ujian_id": 1,
  "total_bank": 2,
  "total_soal": 25,
  "banks": [
    {
      "bank": "Matematika-X-IPA",
      "mata_pelajaran": "Matematika",
      "tingkat": "X",
      "jurusan": "IPA",
      "jumlah_soal": 15,
      "total_bobot": 150,
      "soals": [
        {
          "soal_ujian_id": 1,
          "soal_id": 5,
          "urutan": 1,
          "bobot_nilai": 10,
          "tipe_soal": "PILIHAN_GANDA_SINGLE",
          "teks_soal": "Berapa hasil dari 2 + 2?",
          "opsi_jawaban": [
            {
              "opsi_id": 1,
              "label": "A",
              "teks_opsi": "3",
              "is_benar": false
            }
          ]
        }
      ]
    }
  ]
}
```

**Notes:**
- Returns soal grouped by their bank origin
- Includes complete soal details with opsi_jawaban
- Summary includes jumlah_soal and total_bobot per bank
- Useful for ujian management interface

### 13. Update Bobot Multiple Soal
**PUT** `/ujian/update-bobot-multiple`

**Body:**
```json
{
  "ujian_id": 1,
  "updates": [
    { "soal_ujian_id": 1, "bobot_nilai": 15 },
    { "soal_ujian_id": 2, "bobot_nilai": 20 },
    { "soal_ujian_id": 3, "bobot_nilai": 10 }
  ]
}
```

**Response:**
```json
{
  "message": "Bobot 3 soal berhasil diupdate",
  "jumlah_updated": 3
}
```

**Notes:**
- Batch update bobot_nilai for multiple soal
- **NO ownership validation** - any guru can update (for correction purposes)
- Validates all soal_ujian_ids belong to specified ujian_id
- More efficient than updating one by one

### 14. Assign Siswa ke Ujian
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

## � ADMIN - AKTIVITAS (MONITORING) ENDPOINTS

### Admin Only - Monitor Ujian & Peserta

#### 1. Get All Activities (Exam List)
**GET** `/admin/activities`

**Query Parameters:**
- `jurusan` - Filter by jurusan (IPA/IPS/Bahasa) or 'all'
- `kelas` - Filter by tingkat (X/XI/XII) or 'all'
- `status` - Filter participant status (ON_PROGRESS/SUBMITTED/BLOCKED) or 'all'
- `jenis_ujian` - Filter by exam type ('Ujian Akhir Semester'/'Ujian Tengah Semester') or 'all'

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "ujian_id": 1,
      "nama_ujian": "Ujian Akhir Semester Matematika",
      "mata_pelajaran": "Matematika",
      "jurusan": "IPA",
      "tingkat": "XII",
      "jenis_ujian": "Ujian Akhir Semester",
      "peserta_count": 25,
      "status": "Sedang Berlangsung",
      "tanggal_mulai": "2025-12-24T08:00:00.000Z",
      "tanggal_selesai": "2025-12-24T10:00:00.000Z",
      "durasi_menit": 120
    }
  ]
}
```

**Status Values:**
- `Belum Mulai` - Exam hasn't started yet
- `Sedang Berlangsung` - Exam is currently active
- `Selesai` - Exam has ended

#### 2. Get Exam Participants Detail
**GET** `/admin/activities/:ujianId/participants`

**Query Parameters:**
- `jurusan` - Filter participants by jurusan
- `kelas` - Filter participants by kelas
- `status` - Filter by participant status (ON_PROGRESS/SUBMITTED/BLOCKED)

**Response:**
```json
{
  "success": true,
  "data": {
    "ujian": {
      "ujian_id": 1,
      "nama_ujian": "Ujian Akhir Semester Matematika",
      "mata_pelajaran": "Matematika",
      "tingkat": "XII",
      "jurusan": "IPA"
    },
    "peserta": [
      {
        "peserta_ujian_id": 15,
        "nama": "Budi Santoso",
        "tingkat": "XII",
        "kelas": "IPA 01",
        "mata_pelajaran": "Matematika",
        "status": "On Progress",
        "is_blocked": false,
        "block_reason": null,
        "unlock_code": null,
        "waktu_mulai": "2025-12-24T08:05:00.000Z",
        "waktu_selesai": null
      }
    ]
  }
}
```

**Status Values:**
- `Belum Mulai` - Student hasn't started
- `On Progress` - Currently working on exam
- `Submitted` - Exam completed
- `Blocked` - Student is blocked

#### 3. Get Participant Detail
**GET** `/admin/activities/participant/:pesertaUjianId`

**Response:**
```json
{
  "success": true,
  "data": {
    "peserta_ujian_id": 15,
    "nama": "Budi Santoso",
    "tingkat": "XII",
    "kelas": "IPA 01",
    "mata_pelajaran": "Matematika",
    "status": "Blocked",
    "is_blocked": true,
    "block_reason": "Keluar dari aplikasi sebelum ujian selesai",
    "unlock_code": "ABC123",
    "waktu_mulai": "2025-12-24T08:05:00.000Z",
    "waktu_selesai": null
  }
}
```

#### 4. Block Participant
**POST** `/admin/activities/:pesertaUjianId/block`

**Body:**
```json
{
  "block_reason": "Keluar dari aplikasi sebelum ujian selesai"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Peserta berhasil diblokir"
}
```

#### 5. Generate Unlock Code
**POST** `/admin/activities/:pesertaUjianId/generate-unlock`

**Response:**
```json
{
  "success": true,
  "message": "Kode unlock berhasil di-generate",
  "data": {
    "unlock_code": "X7K9P2"
  }
}
```

#### 6. Unblock Participant
**POST** `/admin/activities/:pesertaUjianId/unblock`

**Body:**
```json
{
  "unlock_code": "X7K9P2"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Peserta berhasil di-unblock"
}
```

---

## �👥 USER MANAGEMENT ENDPOINTS

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

## �‍🎓 SISWA ENDPOINTS (Siswa Only)

### 1. Get My Ujians (List ujian yang di-assign ke siswa)
**GET** `/siswa/ujians`

**Headers:** `Authorization: Bearer <token>` (role: siswa)

**Response:**
```json
{
  "ujians": [
    {
      "peserta_ujian_id": 5,
      "status_ujian": "BELUM_MULAI",
      "is_blocked": false,
      "unlock_code": null,
      "waktu_mulai": null,
      "waktu_selesai": null,
      "ujian": {
        "ujian_id": 2,
        "nama_ujian": "Ujian Matematika Semester 1",
        "mata_pelajaran": "Matematika",
        "tingkat": "10",
        "jurusan": "IPA",
        "tanggal_mulai": "2025-12-26T08:00:00.000Z",
        "tanggal_selesai": "2025-12-26T10:00:00.000Z",
        "durasi_menit": 90,
        "is_acak_soal": false
      },
      "hasil": null
    },
    {
      "peserta_ujian_id": 8,
      "status_ujian": "DINILAI",
      "is_blocked": false,
      "unlock_code": null,
      "waktu_mulai": "2025-12-20T08:15:00.000Z",
      "waktu_selesai": "2025-12-20T09:30:00.000Z",
      "ujian": {
        "ujian_id": 1,
        "nama_ujian": "Ujian Fisika",
        "mata_pelajaran": "Fisika",
        "tingkat": "10",
        "jurusan": "IPA",
        "tanggal_mulai": "2025-12-20T08:00:00.000Z",
        "tanggal_selesai": "2025-12-20T10:00:00.000Z",
        "durasi_menit": 90,
        "is_acak_soal": true
      },
      "hasil": {
        "nilai_akhir": 85.5,
        "tanggal_submit": "2025-12-20T09:30:00.000Z"
      }
    }
  ]
}
```

**Status Ujian:**
- `BELUM_MULAI` - Ujian belum dikerjakan
- `SEDANG_DIKERJAKAN` - Sedang mengerjakan
- `SELESAI` - Sudah submit, menunggu grading essay
- `DINILAI` - Nilai sudah final

---

### 2. Start Ujian (Mulai mengerjakan ujian)
**POST** `/siswa/ujians/start`

**Headers:** `Authorization: Bearer <token>` (role: siswa)

**Body:**
```json
{
  "peserta_ujian_id": 5,
  "unlock_code": "ABC123"  // Optional, hanya jika ujian terblokir
}
```

**Response:**
```json
{
  "message": "Ujian berhasil dimulai",
  "peserta_ujian": {
    "peserta_ujian_id": 5,
    "status_ujian": "SEDANG_DIKERJAKAN",
    "waktu_mulai": "2025-12-26T10:15:00.000Z",
    "durasi_menit": 90,
    "ujian": {
      "ujian_id": 2,
      "nama_ujian": "Ujian Matematika Semester 1",
      "mata_pelajaran": "Matematika",
      "is_acak_soal": false
    },
    "soal_list": [
      {
        "soal_ujian_id": 15,
        "urutan": 1,
        "bobot_nilai": 10,
        "soal": {
          "soal_id": 7,
          "tipe_soal": "PILIHAN_GANDA",
          "teks_soal": "Berapa hasil dari 2 + 2?",
          "soal_gambar": null,
          "opsi_jawaban": [
            {
              "opsi_id": 1,
              "label_opsi": "A",
              "teks_opsi": "3"
            },
            {
              "opsi_id": 2,
              "label_opsi": "B",
              "teks_opsi": "4"
            },
            {
              "opsi_id": 3,
              "label_opsi": "C",
              "teks_opsi": "5"
            }
          ]
        },
        "jawaban_saya": null
      },
      {
        "soal_ujian_id": 16,
        "urutan": 2,
        "bobot_nilai": 15,
        "soal": {
          "soal_id": 8,
          "tipe_soal": "ESSAY",
          "teks_soal": "Jelaskan konsep limit dalam matematika",
          "soal_gambar": null,
          "opsi_jawaban": []
        },
        "jawaban_saya": null
      }
    ],
    "total_soal": 10
  }
}
```

**Error Responses:**
- `403` - Ujian terblokir, perlu unlock_code
- `400` - Ujian sudah selesai / waktu belum dimulai / waktu sudah lewat

**Notes:**
- Jawaban benar (`is_benar`) TIDAK ditampilkan untuk opsi jawaban
- Jika ujian pernah dimulai, `jawaban_saya` akan berisi jawaban yang sudah tersimpan (resume capability)
- Frontend harus menyimpan `waktu_mulai` untuk countdown timer

---

### 3. Submit Jawaban (Auto-save per soal)
**POST** `/siswa/ujians/jawaban`

**Headers:** `Authorization: Bearer <token>` (role: siswa)

**Body (Pilihan Ganda):**
```json
{
  "peserta_ujian_id": 5,
  "soal_id": 7,
  "opsi_jawaban_id": 2
}
```

**Body (Essay):**
```json
{
  "peserta_ujian_id": 5,
  "soal_id": 8,
  "teks_jawaban": "Limit adalah konsep matematika yang menjelaskan..."
}
```

**Response:**
```json
{
  "message": "Jawaban berhasil disimpan",
  "jawaban": {
    "jawaban_id": 25,
    "soal_id": 7,
    "opsi_jawaban_id": 2,
    "teks_jawaban": null
  }
}
```

**Notes:**
- Endpoint ini dapat dipanggil **berkali-kali** untuk soal yang sama (update jawaban)
- Auto-grading dilakukan untuk PILIHAN_GANDA (tapi `is_correct` TIDAK dikirim ke frontend)
- Jawaban tersimpan real-time (auto-save)
- Frontend sebaiknya call endpoint ini setiap kali siswa mengubah jawaban (debounced)

---

### 4. Finish Ujian (Finalisasi & submit)
**POST** `/siswa/ujians/finish`

**Headers:** `Authorization: Bearer <token>` (role: siswa)

**Body:**
```json
{
  "peserta_ujian_id": 5
}
```

**Response:**
```json
{
  "message": "Ujian berhasil diselesaikan",
  "hasil": {
    "hasil_ujian_id": 12,
    "nilai_akhir": 82.5,
    "status": "Selesai dinilai",
    "total_soal": 10,
    "soal_terjawab": 10
  }
}
```

**Response (jika ada essay):**
```json
{
  "message": "Ujian berhasil diselesaikan",
  "hasil": {
    "hasil_ujian_id": 12,
    "nilai_akhir": 70.0,
    "status": "Menunggu penilaian essay oleh guru",
    "total_soal": 10,
    "soal_terjawab": 9
  }
}
```

**Notes:**
- Status `PesertaUjian` berubah menjadi `SELESAI`
- Auto-calculate nilai untuk PILIHAN_GANDA
- Jika ada ESSAY, status = "Menunggu penilaian", nilai bersifat temporary
- Jika tidak ada ESSAY, status langsung `DINILAI` dan nilai final

---

## 📊 HASIL UJIAN ENDPOINTS

### 1. Get My Hasil (Siswa - lihat hasil ujian sendiri)
**GET** `/hasil-ujian/my-hasil`

**Headers:** `Authorization: Bearer <token>` (role: siswa)

**Response:**
```json
{
  "hasil": [
    {
      "hasil_ujian_id": 12,
      "peserta_ujian_id": 5,
      "nilai_akhir": 85.5,
      "tanggal_submit": "2025-12-26T11:30:00.000Z",
      "pesertaUjian": {
        "peserta_ujian_id": 5,
        "siswa_id": 3,
        "ujian_id": 2,
        "status_ujian": "DINILAI",
        "ujian": {
          "ujian_id": 2,
          "nama_ujian": "Ujian Matematika Semester 1",
          "mata_pelajaran": "Matematika",
          "tingkat": "10",
          "jurusan": "IPA",
          "tanggal_mulai": "2025-12-26T08:00:00.000Z",
          "tanggal_selesai": "2025-12-26T10:00:00.000Z"
        }
      }
    }
  ]
}
```

### 2. Get Hasil by Ujian (Guru - lihat semua hasil ujian)
**GET** `/hasil-ujian/ujian/:ujian_id`

**Headers:** `Authorization: Bearer <token>` (role: guru)

**Example:** `/hasil-ujian/ujian/1`

**Response:**
```json
{
  "ujian": {
    "ujian_id": 1,
    "nama_ujian": "UTS Matematika Semester 1",
    "mata_pelajaran": "Matematika"
  },
  "total_peserta": 30,
  "hasil": [
    {
      "hasil_ujian_id": 12,
      "peserta_ujian_id": 5,
      "nilai_akhir": 92.5,
      "tanggal_submit": "2025-12-26T10:30:00.000Z",
      "pesertaUjian": {
        "peserta_ujian_id": 5,
        "siswa_id": 3,
        "status_ujian": "DINILAI",
        "siswa": {
          "siswa_id": 3,
          "nama_lengkap": "Ahmad Fauzi",
          "kelas": "X-1",
          "tingkat": "X",
          "jurusan": "IPA"
        }
      }
    },
    {
      "hasil_ujian_id": 13,
      "peserta_ujian_id": 6,
      "nilai_akhir": 87.0,
      "tanggal_submit": "2025-12-26T10:35:00.000Z",
      "pesertaUjian": {
        "siswa": {
          "nama_lengkap": "Siti Nurhaliza",
          "kelas": "X-1"
        }
      }
    }
  ]
}
```

**Notes:**
- Returns all hasil ujian sorted by nilai_akhir (highest first)
- Only shows results for ujian owned by the logged-in guru
- Includes student information for each result

### 3. Get Hasil by Peserta (Guru - detail hasil satu siswa)
**GET** `/hasil-ujian/peserta/:peserta_ujian_id`

**Headers:** `Authorization: Bearer <token>` (role: guru)

**Example:** `/hasil-ujian/peserta/5`

**Response:**
```json
{
  "hasil": {
    "hasil_ujian_id": 12,
    "peserta_ujian_id": 5,
    "nilai_akhir": 85.5,
    "tanggal_submit": "2025-12-26T10:30:00.000Z",
    "pesertaUjian": {
      "peserta_ujian_id": 5,
      "siswa_id": 3,
      "ujian_id": 1,
      "status_ujian": "DINILAI",
      "siswa": {
        "siswa_id": 3,
        "nama_lengkap": "Ahmad Fauzi",
        "kelas": "X-1",
        "tingkat": "X",
        "jurusan": "IPA"
      },
      "ujian": {
        "ujian_id": 1,
        "nama_ujian": "UTS Matematika",
        "mata_pelajaran": "Matematika",
        "tanggal_mulai": "2025-12-26T08:00:00.000Z",
        "tanggal_selesai": "2025-12-26T10:00:00.000Z"
      },
      "jawabans": [
        {
          "jawaban_id": 15,
          "soal_id": 1,
          "is_correct": true,
          "nilai_manual": null,
          "soal": {
            "soal_id": 1,
            "teks_soal": "Berapa hasil 2 + 2?",
            "tipe_soal": "PILIHAN_GANDA_SINGLE"
          }
        }
      ]
    }
  }
}
```

**Notes:**
- Returns basic hasil info with student answers
- Use this for quick overview of student's result

### 4. Get Detailed Result (Guru - review lengkap semua jawaban)
**GET** `/hasil-ujian/detail/:peserta_ujian_id`

**Headers:** `Authorization: Bearer <token>` (role: guru)

**Example:** `/hasil-ujian/detail/5`

**Response:**
```json
{
  "hasil_ujian": {
    "hasil_ujian_id": 12,
    "nilai_akhir": 82.5,
    "tanggal_submit": "2025-12-26T10:30:00.000Z"
  },
  "siswa": {
    "siswa_id": 3,
    "nama_lengkap": "Ahmad Fauzi",
    "kelas": "X-1",
    "tingkat": "X",
    "jurusan": "IPA"
  },
  "ujian": {
    "ujian_id": 1,
    "nama_ujian": "UTS Matematika Semester 1",
    "mata_pelajaran": "Matematika"
  },
  "review": [
    {
      "urutan": 1,
      "soal": {
        "soal_id": 7,
        "tipe_soal": "PILIHAN_GANDA_SINGLE",
        "teks_soal": "Berapa hasil dari 2 + 2?",
        "opsiJawabans": [
          {
            "opsi_id": 1,
            "label": "A",
            "teks_opsi": "3",
            "is_benar": false
          },
          {
            "opsi_id": 2,
            "label": "B",
            "teks_opsi": "4",
            "is_benar": true
          }
        ]
      },
      "bobot_nilai": 10,
      "jawaban": {
        "jawaban_id": 15,
        "opsi_jawaban_id": 2,
        "teks_jawaban": null,
        "is_correct": true,
        "nilai_manual": null
      },
      "is_correct": true,
      "nilai_didapat": 10
    },
    {
      "urutan": 2,
      "soal": {
        "soal_id": 8,
        "tipe_soal": "ESSAY",
        "teks_soal": "Jelaskan konsep limit dalam matematika"
      },
      "bobot_nilai": 20,
      "jawaban": {
        "jawaban_id": 16,
        "teks_jawaban": "Limit adalah nilai yang didekati...",
        "is_correct": null,
        "nilai_manual": 75.5
      },
      "is_correct": null,
      "nilai_didapat": 75.5
    }
  ]
}
```

**Notes:**
- Most detailed view for grading and review
- Shows all soal with their jawaban in order
- Includes bobot_nilai and nilai_didapat for each soal
- Used for grading essay questions and reviewing student work

### 5. Update Nilai Manual (Guru - nilai soal essay)
**PUT** `/hasil-ujian/nilai-manual`

**Headers:** `Authorization: Bearer <token>` (role: guru)

**Body:**
```json
{
  "jawaban_id": 16,
  "nilai_manual": 85.0
}
```

**Response:**
```json
{
  "message": "Nilai manual berhasil diupdate",
  "jawaban": {
    "jawaban_id": 16,
    "soal_id": 8,
    "peserta_ujian_id": 5,
    "teks_jawaban": "Limit adalah nilai yang didekati...",
    "nilai_manual": 85.0,
    "is_correct": null
  }
}
```

**Notes:**
- Used for grading ESSAY questions manually
- `nilai_manual` range: 0-100 (percentage)
- Automatically recalculates the final score (nilai_akhir) after update
- Final score formula: `(totalNilai / totalBobot) × 100`
- For PG: `nilai_didapat = bobot_nilai` (if correct)
- For Essay: `nilai_didapat = (nilai_manual / 100) × bobot_nilai`

**Example Calculation:**
```
Soal 1 (PG, bobot 10): Benar → nilai = 10
Soal 2 (Essay, bobot 20): Manual 85% → nilai = 17
Soal 3 (PG, bobot 10): Salah → nilai = 0

Total Bobot = 40
Total Nilai = 27
Nilai Akhir = (27/40) × 100 = 67.5
```

### 6. Calculate Hasil Ujian (Guru - recalculate nilai)
**POST** `/hasil-ujian/calculate`

**Headers:** `Authorization: Bearer <token>` (role: guru)

**Body:**
```json
{
  "peserta_ujian_id": 5
}
```

**Response:**
```json
{
  "message": "Hasil ujian berhasil dihitung",
  "hasil": {
    "hasil_ujian_id": 12,
    "nilai_akhir": 82.5,
    "total_nilai": 33.0,
    "total_bobot": 40
  }
}
```

**Notes:**
- Manually trigger recalculation of final score
- Automatically called after updating nilai_manual
- Useful if you need to recalculate after fixing data
- Updates status_ujian to 'DINILAI' after calculation

---

## �🔑 Role-Based Access

| Endpoint | Admin | Guru | Siswa |
|----------|-------|------|-------|
| `/auth/*` | ✅ | ✅ | ✅ |
| `/soal/*` | ❌ | ✅ | ❌ |
| `/ujian/*` | ❌ | ✅ | ❌ |
| `/siswa/ujians/*` | ❌ | ❌ | ✅ |
| `/hasil-ujian/my-hasil` | ❌ | ❌ | ✅ |
| `/hasil-ujian/*` (other) | ❌ | ✅ | ❌ |
| `/admin/activities/*` | ✅ | ❌ | ❌ |
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

### Siswa mengerjakan ujian (Incremental Auto-Save):
1. **Login** → `POST /auth/login` → Get token
2. **Lihat ujian** → `GET /siswa/ujians` → Lihat ujian yang di-assign
3. **Mulai ujian** → `POST /siswa/ujians/start` → Mulai & get soal list
4. **Kerjakan soal** (auto-save per soal):
   - Soal 1 → `POST /siswa/ujians/jawaban` (soal_id: 1, opsi_jawaban_id: 2)
   - Soal 2 → `POST /siswa/ujians/jawaban` (soal_id: 2, teks_jawaban: "...")
   - Soal 3 → `POST /siswa/ujians/jawaban` (soal_id: 3, opsi_jawaban_id: 1)
   - ... (repeat untuk semua soal)
5. **Finalisasi** → `POST /siswa/ujians/finish` → Submit & calculate nilai
6. **Lihat hasil** → `GET /hasil-ujian/my-hasil` → Lihat nilai final

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
