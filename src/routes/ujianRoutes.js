const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { 
  createUjian, 
  getUjians, 
  getUjianById, 
  updateUjian, 
  deleteUjian,
  assignSoalToUjian,
  assignBankToUjian,
  removeMultipleSoal,
  removeBankFromUjian,
  clearAllSoal,
  getSoalByBank,
  updateBobotMultiple,
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
router.post('/assign-bank', assignBankToUjian);       // Assign bank soal ke ujian (batch)
router.delete('/remove-soal/:id', removeSoalFromUjian); // Remove soal dari ujian
router.delete('/remove-multiple-soal', removeMultipleSoal); // Remove multiple soal (batch)
router.delete('/remove-bank', removeBankFromUjian);   // Remove bank dari ujian
router.delete('/:ujianId/clear-soal', clearAllSoal); // Clear all soal dari ujian
router.get('/:ujianId/soal-by-bank', getSoalByBank); // Get soal grouped by bank
router.put('/update-bobot-multiple', updateBobotMultiple); // Update bobot multiple soal
router.post('/assign-siswa', assignSiswaToUjian);     // Assign siswa ke ujian

module.exports = router;
