// src/routes/activityRoutes.js
const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

// All routes require admin authentication
router.use(verifyToken);
router.use(checkRole('admin'));

// GET all activities (exam list)
router.get('/', activityController.getAllActivities);

// GET exam participants
router.get('/:ujianId/participants', activityController.getExamParticipants);

// GET participant detail
router.get('/participant/:pesertaUjianId', activityController.getParticipantDetail);

// POST block participant
router.post('/:pesertaUjianId/block', activityController.blockParticipant);

// POST generate unlock code
router.post('/:pesertaUjianId/generate-unlock', activityController.generateUnlockCode);

// POST unblock participant
router.post('/:pesertaUjianId/unblock', activityController.unblockParticipant);

module.exports = router;
