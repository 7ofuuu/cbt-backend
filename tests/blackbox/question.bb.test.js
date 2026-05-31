/**
 * Black Box Test: Question Bank & Question CRUD
 * BB-3 — SB-66 & SB-67
 * Endpoints: /api/questions/bank, /api/questions
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('supertest'),
}));

const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { adminToken, teacherToken } = require('../helpers/jwtHelper');

const mockTeacherDbUser = { id: 2, role: 'teacher', is_active: true, is_super_admin: false };
const mockTeacher = {
  teacher_id: 1, full_name: 'Guru Matematika',
  subject: 'Matematika', is_coordinator: false, user_id: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: teacher auth
  prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
  prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
});

// ─── POST /api/questions/bank ─────────────────────────────────────────────────

describe('POST /api/questions/bank', () => {
  test('BB-Q1: no auth → 401', async () => {
    const res = await request(app)
      .post('/api/questions/bank')
      .send({ bank_name: 'Bank Test', subject: 'Matematika' });
    expect(res.status).toBe(401);
  });

  test('BB-Q2: admin token (wrong role) → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin', is_active: true, is_super_admin: false });
    const res = await request(app)
      .post('/api/questions/bank')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ bank_name: 'Bank Test' });
    expect(res.status).toBe(403);
  });

  test('BB-Q3: teacher, missing bank_name → 400', async () => {
    const res = await request(app)
      .post('/api/questions/bank')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ subject: 'Matematika' });
    expect(res.status).toBe(400);
  });

  test('BB-Q4: teacher, valid body → 201', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null); // name not taken
    prisma.questionBank.create.mockResolvedValue({
      question_bank_id: 10, bank_name: 'Bank Matematika', subject: 'Matematika', teacher_id: 1,
    });
    const res = await request(app)
      .post('/api/questions/bank')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ bank_name: 'Bank Matematika', grade_level: '10' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('question_bank');
  });
});

// ─── GET /api/questions/bank ──────────────────────────────────────────────────

describe('GET /api/questions/bank', () => {
  test('BB-Q5: teacher → 200 with list of own banks', async () => {
    prisma.questionBank.findMany.mockResolvedValue([
      { question_bank_id: 1, bank_name: 'Bank Mat', subject: 'Matematika', teacher_id: 1,
        _count: { questions: 5 }, questions: [], teacher: { teacher_id: 1, full_name: 'Guru Matematika' } },
    ]);
    prisma.questionBank.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/questions/bank')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });

  test('BB-Q6: GET /bank/:id, valid id → 200', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({
      question_bank_id: 1, bank_name: 'Bank Mat', subject: 'Matematika', teacher_id: 1, questions: [],
    });
    prisma.question.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/questions/bank/1')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });

  test('BB-Q7: GET /bank/:id, not found → 404', async () => {
    prisma.questionBank.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/questions/bank/99999')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/questions/bank/:id ─────────────────────────────────────────────

describe('PUT /api/questions/bank/:id', () => {
  test('BB-Q8: teacher access own bank → 200', async () => {
    prisma.questionBank.findUnique
      .mockResolvedValueOnce({ question_bank_id: 1, bank_name: 'Old', subject: 'Matematika', teacher_id: 1 })
      .mockResolvedValueOnce(null); // uniqueness check: 'New' name not taken
    prisma.questionBank.update.mockResolvedValue({
      question_bank_id: 1, bank_name: 'New', subject: 'Matematika', teacher_id: 1,
    });
    const res = await request(app)
      .put('/api/questions/bank/1')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ bank_name: 'New' });
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/questions (create question) ────────────────────────────────────

describe('POST /api/questions', () => {
  test('BB-Q9: SINGLE_CHOICE question → 201', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({
      question_bank_id: 1, bank_name: 'Bank', subject: 'Matematika', teacher_id: 1,
    });
    prisma.question.create.mockResolvedValue({
      question_id: 1, question_text: 'Berapa 1+1?', question_type: 'SINGLE_CHOICE',
      question_bank_id: 1,
    });
    prisma.answerOption.createMany.mockResolvedValue({ count: 2 });
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({
        question_bank_id: 1,
        question_text: 'Berapa 1+1?',
        question_type: 'SINGLE_CHOICE',
        answer_options: [
          { option_text: '2', is_correct: true },
          { option_text: '3', is_correct: false },
        ],
      });
    expect(res.status).toBe(201);
  });

  test('BB-Q10: ESSAY question without options → 201', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({
      question_bank_id: 1, bank_name: 'Bank', subject: 'Matematika', teacher_id: 1,
    });
    prisma.question.create.mockResolvedValue({
      question_id: 2, question_text: 'Jelaskan teorema Pythagoras.', question_type: 'ESSAY',
      question_bank_id: 1, answer_options: [],
    });
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({
        question_bank_id: 1,
        question_text: 'Jelaskan teorema Pythagoras.',
        question_type: 'ESSAY',
      });
    expect(res.status).toBe(201);
  });

  test('BB-Q11: SINGLE_CHOICE without correct answer → 400', async () => {
    prisma.questionBank.findUnique.mockResolvedValue({
      question_bank_id: 1, bank_name: 'Bank', subject: 'Matematika', teacher_id: 1,
    });
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({
        question_bank_id: 1,
        question_text: 'Soal tanpa jawaban benar',
        question_type: 'SINGLE_CHOICE',
        options: [
          { option_text: 'A', is_correct: false },
          { option_text: 'B', is_correct: false },
        ],
      });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/questions ───────────────────────────────────────────────────────

describe('GET /api/questions', () => {
  test('BB-Q12: list questions → 200', async () => {
    prisma.question.findMany.mockResolvedValue([]);
    prisma.question.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/api/questions')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/questions/:id ───────────────────────────────────────────────────

describe('GET /api/questions/:id', () => {
  test('BB-Q13: valid question id → 200', async () => {
    prisma.question.findUnique.mockResolvedValue({
      question_id: 1, question_text: 'Soal', question_type: 'SINGLE_CHOICE',
      subject: 'Matematika',
      question_bank: { bank_name: 'Bank', subject: 'Matematika', teacher_id: 1 },
      answer_options: [],
    });
    const res = await request(app)
      .get('/api/questions/1')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });

  test('BB-Q14: non-existent question → 404', async () => {
    prisma.question.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/questions/99999')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/questions/:id ────────────────────────────────────────────────

describe('DELETE /api/questions/:id', () => {
  test('BB-Q15: delete own question → 200', async () => {
    prisma.question.findUnique.mockResolvedValue({
      question_id: 1, question_text: 'Soal', question_type: 'SINGLE_CHOICE',
      subject: 'Matematika',
      question_bank: { bank_name: 'Bank', subject: 'Matematika', teacher_id: 1 },
      answer_options: [],
    });
    prisma.examQuestion.findFirst.mockResolvedValue(null); // not in active exam
    prisma.question.delete.mockResolvedValue({});
    const res = await request(app)
      .delete('/api/questions/1')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });
});
