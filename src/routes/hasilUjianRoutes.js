const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const {
  getHasilByPeserta,
  getHasilByUjian,
  getMyHasil,
  calculateAndSaveHasil,
  updateNilaiManual,
  getDetailedResult
} = require('../controllers/hasilUjianController');

// Student routes - get their own results
router.get('/my-hasil', verifyToken, checkRole('siswa'), getMyHasil);

// Guru routes - manage and view results
router.get('/ujian/:ujian_id', verifyToken, checkRole('guru'), getHasilByUjian);
router.get('/peserta/:peserta_ujian_id', verifyToken, checkRole('guru'), getHasilByPeserta);
router.get('/detail/:peserta_ujian_id', verifyToken, checkRole('guru'), getDetailedResult);
router.post('/calculate', verifyToken, checkRole('guru'), calculateAndSaveHasil);
router.put('/nilai-manual', verifyToken, checkRole('guru'), updateNilaiManual);

module.exports = router;
