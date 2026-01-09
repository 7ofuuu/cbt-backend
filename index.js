const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./src/routes/authRoutes');
const soalRoutes = require('./src/routes/soalRoutes');
const ujianRoutes = require('./src/routes/ujianRoutes');
const siswaRoutes = require('./src/routes/siswaRoutes');
const userRoutes = require('./src/routes/userRoutes');
const activityRoutes = require('./src/routes/activityRoutes');
const hasilUjianRoutes = require('./src/routes/hasilUjianRoutes');
const activityLogRoutes = require('./src/routes/activityLogRoutes');
const autoFinishService = require('./src/services/autoFinishService');
const autoExpireUjianService = require('./src/services/autoExpireUjianService');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes); // Auth: login, register
app.use('/api/soal', soalRoutes); // Soal CRUD (Guru)
app.use('/api/ujian', ujianRoutes); // Ujian CRUD (Guru)
app.use('/api/siswa', siswaRoutes); // Siswa: ujian, jawaban, hasil
app.use('/api/users', userRoutes); // User Management (Admin) & Penilaian (Guru)
app.use('/api/admin/activities', activityRoutes); // Activity Management (Admin)
app.use('/api/hasil-ujian', hasilUjianRoutes); // Hasil Ujian (Guru & Siswa)
app.use('/api/activity-logs', activityLogRoutes); // Activity Logs (Admin & Guru)

// Test Route
app.get('/', (req, res) => {
  res.send('Server CBT Berjalan 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start auto-finish scheduler
  autoFinishService.startAutoFinishScheduler();
  // Start auto-expire ujian scheduler
  autoExpireUjianService.startAutoExpireScheduler();
});