const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const {
  getTaxonomy,
  createSubject, updateSubject, deactivateSubject,
  createGradeLevel, updateGradeLevel, deactivateGradeLevel,
  createMajor, updateMajor, deactivateMajor,
} = require('../controllers/taxonomyController');

// Public read - dashboard + Flutter populate dropdowns from this.
// ?include_inactive=true returns soft-deleted rows (used by admin master-data UI).
router.get('/', getTaxonomy);

// All writes require admin
const adminOnly = [verifyToken, checkRole('admin')];

router.post('/subjects', ...adminOnly, createSubject);
router.put('/subjects/:id', ...adminOnly, updateSubject);
router.delete('/subjects/:id', ...adminOnly, deactivateSubject); // soft

router.post('/grade-levels', ...adminOnly, createGradeLevel);
router.put('/grade-levels/:id', ...adminOnly, updateGradeLevel);
router.delete('/grade-levels/:id', ...adminOnly, deactivateGradeLevel);

router.post('/majors', ...adminOnly, createMajor);
router.put('/majors/:id', ...adminOnly, updateMajor);
router.delete('/majors/:id', ...adminOnly, deactivateMajor);

module.exports = router;
