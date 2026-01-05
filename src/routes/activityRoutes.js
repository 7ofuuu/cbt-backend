const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { 
  getAllActivities, 
  getExamParticipants, 
  getParticipantDetail,
  blockParticipant,
  generateUnlockCode,
  unblockParticipant
} = require('../controllers/activityController');

// Semua route hanya untuk Admin
router.use(verifyToken, checkRole('admin'));

// Activities routes
router.get('/', getAllActivities);                                  // Get all activities/exams with filters
router.get('/:ujianId/participants', getExamParticipants);          // Get participants of specific exam
router.get('/participant/:pesertaUjianId', getParticipantDetail);   // Get participant detail
router.post('/:pesertaUjianId/block', blockParticipant);            // Block participant from exam
router.post('/:pesertaUjianId/generate-unlock', generateUnlockCode);// Generate unlock code for participant
router.post('/:pesertaUjianId/unblock', unblockParticipant);        // Unblock participant

module.exports = router;
