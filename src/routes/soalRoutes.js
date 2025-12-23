const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { 
  createSoal, 
  getSoals, 
  getSoalById, 
  updateSoal, 
  deleteSoal 
} = require('../controllers/soalController');

// Semua route hanya untuk Guru
router.use(verifyToken, checkRole('guru'));

router.post('/', createSoal);              // Create soal
router.get('/', getSoals);                 // Get all soal (dengan filter)
router.get('/:id', getSoalById);           // Get soal by ID
router.put('/:id', updateSoal);            // Update soal
router.delete('/:id', deleteSoal);         // Delete soal

module.exports = router;
