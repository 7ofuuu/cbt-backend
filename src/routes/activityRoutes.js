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

// All routes for Admin only
router.use(verifyToken, checkRole('admin'));

// Activities routes
router.get('/', getAllActivities);                                          // Get all activities/exams with filters
router.get('/:examId/participants', getExamParticipants);                   // Get participants of specific exam
router.get('/participant/:examParticipantId', getParticipantDetail);         // Get participant detail
router.post('/:examParticipantId/block', blockParticipant);                 // Block participant from exam
router.post('/:examParticipantId/generate-unlock', generateUnlockCode);     // Generate unlock code for participant
router.post('/:examParticipantId/unblock', unblockParticipant);             // Unblock participant

module.exports = router;
