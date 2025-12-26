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
router.get('/', getAllActivities);                               // Get all activities/exams with filters
router.get('/:ujianId/participants', getExamParticipants);       // Get participants of specific exam
router.get('/participant/:participantId', getParticipantDetail); // Get participant detail
router.post('/participant/block', blockParticipant);             // Block participant from exam
router.post('/participant/unlock', generateUnlockCode);          // Generate unlock code for participant
router.post('/participant/unblock', unblockParticipant);         // Unblock participant

module.exports = router;
