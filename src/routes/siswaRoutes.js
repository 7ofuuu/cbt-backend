const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');

// Import controller functions (placeholder - create these in siswaController.js)
// const { getMyUjians, startUjian, submitJawaban, finishUjian, getHasilUjian } = require('../controllers/siswaController');

// Semua route hanya untuk Siswa
router.use(verifyToken, checkRole('siswa'));

// TODO: Implement these routes when siswaController is ready
// router.get('/ujians', getMyUjians);                          // Get ujian yang di-assign
// router.post('/ujians/start', startUjian);                    // Mulai ujian
// router.post('/ujians/jawaban', submitJawaban);               // Submit jawaban per soal
// router.post('/ujians/finish', finishUjian);                  // Finish ujian
// router.get('/ujians/hasil/:peserta_ujian_id', getHasilUjian); // Get hasil ujian

module.exports = router;
