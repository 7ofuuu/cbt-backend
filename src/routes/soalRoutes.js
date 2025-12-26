const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { 
  createSoal, 
  getSoals, 
  getSoalById, 
  updateSoal, 
  deleteSoal,
  getBankSoal,
  getSoalByBank,
  getSoalTersediaUntukUjian,
  assignBankSoalToUjian
} = require('../controllers/soalController');

// Semua route hanya untuk Guru
router.use(verifyToken, checkRole('guru'));

router.post('/', createSoal);                          // Create soal
router.get('/', getSoals);                             // Get all soal (dengan filter)
router.get('/bank', getBankSoal);                      // Get bank soal (grouped)
router.get('/bank/:mataPelajaran/:tingkat/:jurusan', getSoalByBank); // Get soal by specific bank
router.get('/ujian/:ujian_id/tersedia', getSoalTersediaUntukUjian); // Get soal untuk ujian
router.post('/assign-bank', assignBankSoalToUjian);    // Assign bank soal ke ujian
router.get('/:id', getSoalById);                       // Get soal by ID
router.put('/:id', updateSoal);                        // Update soal
router.delete('/:id', deleteSoal);                     // Delete soal

module.exports = router;
