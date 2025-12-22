const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { 
  createUjian, 
  getUjians, 
  getUjianById, 
  updateUjian, 
  deleteUjian,
  assignSoalToUjian,
  removeSoalFromUjian,
  assignSiswaToUjian
} = require('../controllers/ujianController');

// Semua route hanya untuk Guru
router.use(verifyToken, checkRole('guru'));

router.post('/', createUjian);                        // Create ujian
router.get('/', getUjians);                           // Get all ujian
router.get('/:id', getUjianById);                     // Get ujian by ID
router.put('/:id', updateUjian);                      // Update ujian
router.delete('/:id', deleteUjian);                   // Delete ujian

// Assign soal & siswa
router.post('/assign-soal', assignSoalToUjian);       // Assign soal ke ujian
router.delete('/remove-soal/:id', removeSoalFromUjian); // Remove soal dari ujian
router.post('/assign-siswa', assignSiswaToUjian);     // Assign siswa ke ujian

module.exports = router;
