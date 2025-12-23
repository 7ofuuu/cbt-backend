const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { 
  getAllUsers, 
  createUser, 
  updateUserRole, 
  toggleUserStatus,
  deleteUser,
  nilaiJawaban,
  finalisasiNilai
} = require('../controllers/userController');

// Routes untuk Admin - User Management
router.get('/', verifyToken, checkRole('admin'), getAllUsers);           // Get all users
router.post('/', verifyToken, checkRole('admin'), createUser);           // Create user
router.put('/:id/role', verifyToken, checkRole('admin'), updateUserRole); // Update role
router.patch('/:id/status', verifyToken, checkRole('admin'), toggleUserStatus); // Toggle status
router.delete('/:id', verifyToken, checkRole('admin'), deleteUser);      // Delete user

// Routes untuk Guru - Penilaian
router.post('/nilai', verifyToken, checkRole('guru'), nilaiJawaban);      // Nilai essay manual
router.post('/finalisasi', verifyToken, checkRole('guru'), finalisasiNilai); // Finalisasi nilai

module.exports = router;
