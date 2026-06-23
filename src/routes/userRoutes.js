const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { uploadSpreadsheet } = require('../middlewares/spreadsheetUpload');
const {
  getAllUsers,
  getAllAdmins,
  getAllTeachers,
  getAllStudents,
  countUsersByRole,
  getUserDetail,
  updateUser,
  createUser,
  batchDeleteUsers,
  importUsers,
  downloadImportTemplate,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  scoreAnswer,
  finalizeScore
} = require('../controllers/userController');

// Routes for Admin - User Management
router.get('/', verifyToken, checkRole('admin'), getAllUsers);              // Get all users (paginated)
router.get('/admins', verifyToken, checkRole('admin'), getAllAdmins);       // Get all admins
router.get('/teachers', verifyToken, checkRole('admin'), getAllTeachers);   // Get all teachers
router.get('/students', verifyToken, checkRole('admin'), getAllStudents);   // Get all students
router.get('/count', verifyToken, checkRole('admin'), countUsersByRole);    // Count users by role
router.post('/', verifyToken, checkRole('admin'), createUser);              // Create user
router.post('/batch-delete', verifyToken, checkRole('admin'), batchDeleteUsers); // Batch delete users
router.post('/import', verifyToken, checkRole('admin'), uploadSpreadsheet, importUsers); // Import users from .xlsx
router.get('/import/template', verifyToken, checkRole('admin'), downloadImportTemplate); // Download import template
router.get('/:id', verifyToken, checkRole('admin'), getUserDetail);         // Get user detail
router.put('/:id', verifyToken, checkRole('admin'), updateUser);            // Update user
router.put('/:id/role', verifyToken, checkRole('admin'), updateUserRole);   // Update role
router.patch('/:id/status', verifyToken, checkRole('admin'), toggleUserStatus); // Toggle status
router.delete('/:id', verifyToken, checkRole('admin'), deleteUser);         // Delete user

// Routes for Teacher - Grading
router.post('/score', verifyToken, checkRole('teacher'), scoreAnswer);         // Score essay manually
router.post('/finalize', verifyToken, checkRole('teacher'), finalizeScore);    // Finalize score

module.exports = router;
