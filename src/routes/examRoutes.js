const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { resolveTeacher } = require('../middlewares/resolveRole');
const { 
  createExam, 
  getExams, 
  getExamById, 
  updateExam, 
  deleteExam,
  assignQuestionToExam,
  assignBankToExam,
  removeMultipleQuestions,
  removeBankFromExam,
  clearAllQuestions,
  getQuestionsByBank,
  updateWeightMultiple,
  removeQuestionFromExam,
  assignStudentToExam,
  reassignStudents
} = require('../controllers/examController');

// All routes for Teacher only - resolveTeacher sets req.teacher
router.use(verifyToken, checkRole('teacher'), resolveTeacher);

router.post('/', createExam);                        // Create exam
router.get('/', getExams);                           // Get all exams

// Named routes MUST come before parameterized /:id routes
router.post('/assign-question', assignQuestionToExam);       // Assign question to exam
router.post('/assign-bank', assignBankToExam);       // Assign question bank to exam (batch)
router.post('/assign-student', assignStudentToExam);     // Assign student to exam
router.post('/reassign-students', reassignStudents);      // Clear & re-assign students
router.post('/remove-multiple-questions', removeMultipleQuestions); // Remove multiple questions (batch)
router.post('/remove-bank', removeBankFromExam);     // Remove bank from exam
router.put('/update-weight-multiple', updateWeightMultiple); // Update weight for multiple questions

// Parameterized routes AFTER named routes
router.get('/:id', getExamById);                     // Get exam by ID
router.put('/:id', updateExam);                      // Update exam
router.delete('/:id', deleteExam);                   // Delete exam
router.delete('/:id/clear-questions', clearAllQuestions); // Clear all questions from exam
router.get('/:id/questions-by-bank', getQuestionsByBank); // Get questions grouped by bank
router.delete('/:examId/questions/:questionId', removeQuestionFromExam); // Remove single question from exam

module.exports = router;
