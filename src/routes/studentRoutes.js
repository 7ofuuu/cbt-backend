const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { resolveStudent } = require('../middlewares/resolveRole');
const {
  getMyExams,
  startExam,
  prefetchExam,
  submitAnswer,
  finishExam,
  reportViolation,
} = require('../controllers/studentController');

// All routes for Student only - resolveStudent sets req.student
router.use(verifyToken, checkRole('student'), resolveStudent);

// Exam Routes - Incremental approach (auto-save)
router.get('/exams', getMyExams);                      // Get exams assigned to student
router.get('/exams/:examId/prefetch', prefetchExam);   // Download encrypted exam package (H-1)
router.post('/exams/start', startExam);                // Start exam session (state only)
router.post('/exams/answer', submitAnswer);            // Submit/update answer per question (repeatable)
router.post('/exams/finish', finishExam);              // Finalize & calculate score
router.post('/exams/report-violation', reportViolation); // Student self-reports app lifecycle violation

module.exports = router;
