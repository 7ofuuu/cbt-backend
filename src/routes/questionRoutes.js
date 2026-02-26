const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middlewares/validationMiddleware');
const { resolveTeacher } = require('../middlewares/resolveRole');
const {
  createQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getQuestionBank,
  getQuestionsByBank,
  getAvailableQuestionsForExam,
  assignQuestionBankToExam
} = require('../controllers/questionController');

// All routes for Teacher only - resolveTeacher sets req.teacher
router.use(verifyToken, checkRole('teacher'), resolveTeacher);

// Question Bank CRUD
router.post('/bank', createQuestionBank);                  // Create question bank
router.get('/bank', getQuestionBank);                      // Get all question banks
router.get('/bank/:questionBankId', getQuestionsByBank);   // Get questions by specific bank
router.put('/bank/:id', updateQuestionBank);               // Update question bank
router.delete('/bank/:id', deleteQuestionBank);            // Delete question bank

// Question CRUD
router.post('/', createQuestion);                          // Create question (requires question_bank_id)
router.get('/', getQuestions);                             // Get all questions (with filters)
router.get('/exam/:exam_id/available', getAvailableQuestionsForExam); // Get available questions for exam
router.post('/assign-bank', assignQuestionBankToExam);    // Assign question bank to exam
router.get('/:id', getQuestionById);                       // Get question by ID
router.put('/:id', updateQuestion);                        // Update question
router.delete('/:id', deleteQuestion);                     // Delete question

module.exports = router;
