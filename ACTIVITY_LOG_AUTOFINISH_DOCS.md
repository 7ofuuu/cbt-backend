# ACTIVITY LOG & AUTO-FINISH DOCUMENTATION

## 🔍 ACTIVITY LOGGING

Activity logging otomatis mencatat semua aktivitas penting user di sistem CBT.

### Activity Types yang Di-log:
- `LOGIN` - User berhasil login
- `LOGOUT` - User logout (perlu implementasi)
- `START_UJIAN` - Siswa memulai ujian
- `SUBMIT_JAWABAN` - Siswa submit jawaban (opsional, bisa overhead)
- `FINISH_UJIAN` - Siswa menyelesaikan ujian
- `AUTO_FINISH_UJIAN` - Sistem auto-finish ujian karena waktu habis
- `BLOCKED` - Siswa terblokir (keluar aplikasi)
- `UNBLOCKED` - Siswa di-unblock dengan kode

### Database Schema:
```sql
CREATE TABLE activity_logs (
  log_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  peserta_ujian_id INT NULL,
  activity_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  ip_address VARCHAR(50) NULL,
  user_agent TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_id (user_id),
  INDEX idx_peserta_ujian_id (peserta_ujian_id),
  INDEX idx_activity_type (activity_type),
  INDEX idx_created_at (created_at)
);
```

### API Endpoints:

#### 1. Get All Activity Logs (with filters)
```
GET /api/activity-logs
Authorization: Bearer {token}
Role: admin, guru

Query Parameters:
- user_id: Filter by user ID
- activity_type: Filter by type (LOGIN, START_UJIAN, etc.)
- start_date: Filter from date (YYYY-MM-DD)
- end_date: Filter until date (YYYY-MM-DD)
- limit: Limit results (default: 100)

Example:
GET /api/activity-logs?activity_type=LOGIN&start_date=2025-12-01&limit=50

Response:
{
  "success": true,
  "count": 10,
  "logs": [
    {
      "log_id": 1,
      "user_id": 5,
      "peserta_ujian_id": null,
      "activity_type": "LOGIN",
      "description": "User siswa01 (siswa) berhasil login",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "metadata": {
        "username": "siswa01",
        "role": "siswa"
      },
      "created_at": "2025-12-27T10:30:00.000Z"
    }
  ]
}
```

#### 2. Get Logs by User
```
GET /api/activity-logs/user/:userId
Authorization: Bearer {token}
Role: admin, guru

Example:
GET /api/activity-logs/user/5?limit=20

Response:
{
  "success": true,
  "user_id": 5,
  "count": 20,
  "logs": [...]
}
```

#### 3. Get Logs by Peserta Ujian
```
GET /api/activity-logs/peserta-ujian/:pesertaUjianId
Authorization: Bearer {token}
Role: admin, guru

Example:
GET /api/activity-logs/peserta-ujian/10

Response:
{
  "success": true,
  "peserta_ujian_id": 10,
  "count": 5,
  "logs": [
    {
      "log_id": 15,
      "user_id": 5,
      "peserta_ujian_id": 10,
      "activity_type": "START_UJIAN",
      "description": "Memulai ujian: UTS Matematika",
      "metadata": {
        "ujian_id": 25,
        "total_soal": 20,
        "waktu_mulai": "2025-12-27T11:00:00.000Z"
      },
      "created_at": "2025-12-27T11:00:00.000Z"
    },
    {
      "log_id": 20,
      "user_id": 5,
      "peserta_ujian_id": 10,
      "activity_type": "AUTO_FINISH_UJIAN",
      "description": "Ujian otomatis diselesaikan karena waktu habis",
      "metadata": {
        "ujian_id": 25,
        "nilai_akhir": 85.5,
        "waktu_mulai": "2025-12-27T11:00:00.000Z",
        "waktu_selesai": "2025-12-27T12:30:00.000Z"
      },
      "created_at": "2025-12-27T12:30:00.000Z"
    }
  ]
}
```

#### 4. Get Logs by Activity Type
```
GET /api/activity-logs/type/:activityType
Authorization: Bearer {token}
Role: admin, guru

Example:
GET /api/activity-logs/type/AUTO_FINISH_UJIAN?limit=10

Response:
{
  "success": true,
  "activity_type": "AUTO_FINISH_UJIAN",
  "count": 10,
  "logs": [...]
}
```

---

## ⏰ AUTO-FINISH SCHEDULER

Sistem otomatis menyelesaikan ujian yang melewati batas waktu.

### Cara Kerja:
1. **Scheduler berjalan setiap 60 detik**
2. Check semua peserta dengan status `SEDANG_DIKERJAKAN`
3. Hitung deadline dari:
   - `ujian.tanggal_selesai` (jika ada), atau
   - `waktu_mulai + durasi_menit`
4. Jika `now > deadline`:
   - Hitung nilai otomatis (PG saja, essay skip)
   - Update status ke `SELESAI`
   - Create record di `hasil_ujian`
   - Jika tidak ada essay, update status ke `DINILAI`
   - Log activity dengan type `AUTO_FINISH_UJIAN`

### Logs Console:
```
🔍 Checking for expired ujian sessions...
⏰ Auto-finishing expired session for peserta_ujian_id: 10
✅ Soal 1: BENAR (opsi 5)
❌ Soal 2: SALAH (jawaban: 3, benar: 4)
📊 Nilai Akhir: 85.00 (17/20)
✅ Auto-finished: Budi Santoso - Nilai: 85.00
✅ Auto-finished 1 expired session(s)
```

### Aktivasi:
Scheduler otomatis start saat server berjalan:
```javascript
// Di index.js
const autoFinishService = require('./src/services/autoFinishService');

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  autoFinishService.startAutoFinishScheduler();
});
```

### Manual Trigger (untuk testing):
```javascript
const autoFinishService = require('./src/services/autoFinishService');

// Run once
await autoFinishService.checkAndFinishExpiredSessions();

// Returns: number of sessions finished
```

### Activity Log Entry untuk Auto-Finish:
```json
{
  "log_id": 25,
  "user_id": 5,
  "peserta_ujian_id": 10,
  "activity_type": "AUTO_FINISH_UJIAN",
  "description": "Ujian otomatis diselesaikan karena waktu habis - UTS Matematika",
  "ip_address": null,
  "user_agent": null,
  "metadata": {
    "ujian_id": 25,
    "nilai_akhir": 85.5,
    "waktu_mulai": "2025-12-27T11:00:00.000Z",
    "waktu_selesai": "2025-12-27T12:30:00.000Z",
    "deadline": "2025-12-27T12:30:00.000Z"
  },
  "created_at": "2025-12-27T12:30:15.000Z"
}
```

---

## 📊 USE CASES

### 1. Monitoring Real-time Activity
Dashboard admin dapat menampilkan:
- Jumlah login hari ini
- Ujian yang sedang berlangsung
- Siswa yang baru saja finish ujian
- Auto-finish events

### 2. Audit Trail untuk Investigasi
Ketika ada kecurangan atau masalah:
- Lihat semua aktivitas siswa tertentu
- Check timing: kapan mulai, kapan finish
- Lihat IP address untuk deteksi multiple device
- Check apakah ada block/unblock events

### 3. Analytics & Reporting
- Rata-rata waktu pengerjaan per ujian
- Siswa yang sering terblokir
- Peak login times
- Completion rate (manual vs auto-finish)

### 4. Troubleshooting
Jika siswa komplain ujiannya hilang:
- Check log `START_UJIAN`
- Check log `AUTO_FINISH_UJIAN`
- Lihat metadata untuk detail waktu dan nilai

---

## 🚀 IMPLEMENTASI FRONTEND (TODO)

### Dashboard Admin - Activity Monitor
```jsx
// Example component
<ActivityLogTable
  filters={{
    activity_type: 'AUTO_FINISH_UJIAN',
    start_date: today
  }}
  columns={['user', 'activity', 'description', 'time', 'metadata']}
  realtime={true}
/>
```

### Siswa Profile - Activity History
```jsx
<UserActivityTimeline
  userId={student.id}
  limit={20}
/>
```

### Ujian Detail - Peserta Logs
```jsx
<PesertaActivityLog
  pesertaUjianId={pesertaUjian.id}
  showTimeline={true}
/>
```

---

## ⚙️ CONFIGURATION

### Environment Variables:
```env
# Auto-finish interval (in milliseconds)
AUTO_FINISH_INTERVAL=60000  # Default: 60 seconds

# Activity log retention (days)
ACTIVITY_LOG_RETENTION=90  # Default: 90 days
```

### Disable Auto-Finish (if needed):
```javascript
// Comment out in index.js:
// autoFinishService.startAutoFinishScheduler();
```

### Clean Old Logs (add cron job):
```javascript
// Create new service: cleanupOldLogs.js
const cleanupOldLogs = async () => {
  const retentionDays = process.env.ACTIVITY_LOG_RETENTION || 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  await prisma.$executeRaw`
    DELETE FROM activity_logs 
    WHERE created_at < ${cutoffDate}
  `;
};
```

---

## ✅ CHECKLIST IMPLEMENTASI

**Backend:**
- ✅ Tabel `activity_logs` created
- ✅ Activity Log Service
- ✅ Auto-Finish Service
- ✅ Activity Log API endpoints
- ✅ Logging di: login, startUjian, finishUjian
- ✅ Scheduler running setiap 60 detik
- ⏳ Logging di: block/unblock (TODO jika perlu)
- ⏳ Cleanup old logs cron job (TODO)

**Frontend:**
- ⏳ Activity log viewer (Admin dashboard)
- ⏳ Real-time monitoring
- ⏳ User activity timeline
- ⏳ Export activity logs

---

## 📝 NOTES

1. **Performance**: Activity logging tidak akan impact performance karena:
   - Non-blocking (async)
   - Error tidak throw (hanya log)
   - Indexed columns untuk fast query

2. **Privacy**: Hati-hati dengan sensitive data di metadata. Jangan log password!

3. **Storage**: Dengan 1000 siswa dan 100 activity/hari, estimasi:
   - ~100k logs/hari
   - ~3M logs/bulan
   - Perlu cleanup strategy untuk logs > 90 hari

4. **Auto-Finish**: Scheduler lightweight, tidak akan impact performance untuk < 1000 concurrent sessions.
