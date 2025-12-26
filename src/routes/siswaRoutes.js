const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { 
  getMyUjians, 
  startUjian, 
  submitJawaban, 
  finishUjian
} = require('../controllers/siswaController');

// Semua route hanya untuk Siswa
router.use(verifyToken, checkRole('siswa'));

// Ujian Routes - Incremental approach (auto-save)
router.get('/ujians', getMyUjians);                     // Get ujian yang di-assign ke siswa
router.post('/ujians/start', startUjian);               // Mulai ujian & get soal list
router.post('/ujians/jawaban', submitJawaban);          // Submit/update jawaban per soal (repeatable)
router.post('/ujians/finish', finishUjian);             // Finalize & calculate nilai

module.exports = router;
