const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { resolveTeacher, resolveStudent } = require('../middlewares/resolveRole');
const { getResultByParticipant, getResultByExam, getMyResults, calculateAndSaveResult, updateManualScore, getDetailedResult, getCompletedExams, submitExam, getArchivedExams, exportExamScores } = require('../controllers/examResultController');

// Student routes - get their own results
router.get('/my-results', verifyToken, checkRole('student'), resolveStudent, getMyResults);

// Teacher routes - manage and view results (resolveTeacher for ownership checks)
router.get('/completed-exams', verifyToken, checkRole('teacher'), resolveTeacher, getCompletedExams);
router.get('/exam/:exam_id/export', verifyToken, checkRole('teacher'), resolveTeacher, exportExamScores);
router.get('/exam/:exam_id', verifyToken, checkRole('teacher'), resolveTeacher, getResultByExam);
router.get('/participant/:exam_participant_id', verifyToken, checkRole('teacher'), resolveTeacher, getResultByParticipant);
router.get('/detail/:exam_participant_id', verifyToken, checkRole('teacher'), resolveTeacher, getDetailedResult);
router.post('/calculate', verifyToken, checkRole('teacher'), resolveTeacher, calculateAndSaveResult);
router.put('/manual-score', verifyToken, checkRole('teacher'), resolveTeacher, updateManualScore);
router.post('/:examId/submit', verifyToken, checkRole('teacher'), resolveTeacher, submitExam);
router.get('/archived-exams', verifyToken, checkRole('teacher'), resolveTeacher, getArchivedExams);

module.exports = router;
