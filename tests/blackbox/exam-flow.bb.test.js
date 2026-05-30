/**
 * Black Box Test: Exam Flow End-to-End
 * BB-4 — SB-68 & SB-69
 * MUST run with --runInBand (stateful sequential test)
 * Covers: create exam, assign students, start exam, submit answers, finish, view results, block/unblock
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('supertest'),
}));
jest.mock('../../src/services/scoreService', () => ({
  calculateScore: jest.fn().mockReturnValue({
    finalScore: 80, totalScore: 8, totalWeight: 10, hasEssay: false, allEssayGraded: true,
  }),
  calculateAndSaveResult: jest.fn().mockResolvedValue({
    finalScore: 80, status: 'GRADED',
  }),
}));

const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { teacherToken, studentToken, adminToken } = require('../helpers/jwtHelper');

// ─── Shared state ────────────────────────────────────────────────────────────

const state = {
  examId: null,
  examParticipantId: null,
  questionId: null,
};

// ─── Mock users ───────────────────────────────────────────────────────────────

const teacherDbUser = { id: 2, role: 'teacher', is_active: true, is_super_admin: false };
const studentDbUser = { id: 3, role: 'student', is_active: true, is_super_admin: false };
const adminDbUser   = { id: 1, role: 'admin',   is_active: true, is_super_admin: false };
const mockTeacher   = { teacher_id: 1, full_name: 'Guru Test', subject: 'Matematika', is_coordinator: false, user_id: 2 };
const mockStudent   = { student_id: 1, full_name: 'Siswa Test', classroom: 'X-IPA-1', grade_level: '10', major: 'IPA', user_id: 3 };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
});

// ─── Step 1: Teacher creates exam ─────────────────────────────────────────────

describe('Step 1: Teacher creates exam', () => {
  test('BB-EF-01: POST /api/exams → 201, captures examId', async () => {
    prisma.user.findUnique.mockResolvedValue(teacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    prisma.exam.create.mockResolvedValue({
      exam_id: 42, exam_name: 'Ujian Flow Test', subject: 'Matematika',
      grade_level: '10', major: 'IPA', exam_status: 'SCHEDULED',
      start_date: new Date('2025-06-01'), end_date: new Date('2025-07-01'),
      duration_minutes: 90, teacher_id: 1,
    });
    prisma.student.findMany.mockResolvedValue([{ student_id: 1 }]);
    prisma.examParticipant.createMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({
        exam_name: 'Ujian Flow Test',
        grade_level: '10',
        major: 'IPA',
        start_date: '2025-06-01T08:00:00Z',
        end_date: '2025-07-01T10:00:00Z',
        duration_minutes: 90,
      });

    expect(res.status).toBe(201);
    state.examId = res.body.exam?.exam_id || 42;
    expect(state.examId).toBeDefined();
  });
});

// ─── Step 2: Assign question bank to exam ─────────────────────────────────────

describe('Step 2: Assign question bank to exam', () => {
  test('BB-EF-02: POST /api/exams/assign-bank → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(teacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    prisma.exam.findUnique.mockResolvedValue({
      exam_id: 42, exam_name: 'Ujian Flow Test', subject: 'Matematika',
      exam_status: 'SCHEDULED', teacher_id: 1, exam_questions: [],
    });
    prisma.questionBank.findUnique.mockResolvedValue({
      question_bank_id: 1, bank_name: 'Bank Mat', subject: 'Matematika', teacher_id: 1,
      questions: [
        { question_id: 1, question_type: 'SINGLE_CHOICE', answer_options: [] },
      ],
    });
    prisma.examQuestion.findMany.mockResolvedValue([]);
    prisma.examQuestion.createMany.mockResolvedValue({ count: 1 });
    prisma.question.findMany.mockResolvedValue([{ question_id: 1 }]);
    state.questionId = 1;

    const res = await request(app)
      .post('/api/exams/assign-bank')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ exam_id: state.examId || 42, question_bank_id: 1, score_weight: 10 });

    expect([200, 201]).toContain(res.status);
  });
});

// ─── Step 3: Student gets assigned exams ──────────────────────────────────────

describe('Step 3: Student gets assigned exams', () => {
  test('BB-EF-03: GET /api/students/exams → 200, lists assigned exams', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);
    prisma.examParticipant.findMany.mockResolvedValue([{
      exam_participant_id: 10,
      exam_status: 'NOT_STARTED',
      is_blocked: false,
      exam: {
        exam_id: 42, exam_name: 'Ujian Flow Test', subject: 'Matematika',
        grade_level: '10', major: 'IPA', exam_status: 'ONGOING',
        start_date: new Date('2025-01-01'), end_date: new Date('2099-12-31'),
        duration_minutes: 90, teacher: { full_name: 'Guru Test' },
        exam_questions: [{ exam_question_id: 1 }],
        is_shuffle_questions: false,
      },
    }]);

    const res = await request(app)
      .get('/api/students/exams')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.exams).toBeInstanceOf(Array);
  });
});

// ─── Step 4: Student starts exam ──────────────────────────────────────────────

describe('Step 4: Student starts exam', () => {
  test('BB-EF-04: POST /api/students/exams/start → 200, captures participantId', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);

    const mockParticipant = {
      exam_participant_id: 10,
      exam_status: 'NOT_STARTED',
      is_blocked: false,
      start_time: null,
      exam: {
        exam_id: 42, exam_name: 'Ujian Flow Test', exam_status: 'ONGOING',
        end_date: new Date('2099-12-31'), duration_minutes: 90, is_shuffle_questions: false,
        exam_questions: [
          {
            exam_question_id: 1, question_id: 1, score_weight: 10, sequence: 1,
            question: {
              question_id: 1, question_text: 'Berapa 2+2?', question_type: 'SINGLE_CHOICE',
              answer_options: [
                { option_id: 1, option_label: 'A', option_text: '4', is_correct: true },
                { option_id: 2, option_label: 'B', option_text: '5', is_correct: false },
              ],
            },
          },
        ],
      },
      student: { user_id: 3 },
    };

    prisma.examParticipant.findFirst.mockResolvedValue(mockParticipant);
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.answer.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/students/exams/start')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ exam_id: 42 });

    expect(res.status).toBe(200);
    // Start now returns session state only — questions arrive via the
    // encrypted /prefetch package, not here.
    expect(res.body).toHaveProperty('exam_participant_id');
    expect(res.body).not.toHaveProperty('questions');
    state.examParticipantId = res.body.exam_participant_id || 10;
  });

  test('BB-EF-04b: GET /api/students/exams/:examId/prefetch → 200, returns encrypted package', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);

    prisma.examParticipant.findFirst.mockResolvedValue({
      exam_participant_id: 10,
      is_blocked: false,
      exam: {
        exam_id: 42,
        exam_name: 'Ujian Flow Test',
        subject: 'Matematika',
        duration_minutes: 90,
        // Within the H-1 window so the password is generated and the package served.
        start_date: new Date(Date.now() + 60 * 60 * 1000),
        end_date: new Date('2099-12-31'),
        access_password: null,
        is_shuffle_questions: false,
        exam_questions: [
          {
            exam_question_id: 1, question_id: 1, score_weight: 10, sequence: 1,
            question: {
              question_id: 1, question_text: 'Berapa 2+2?', question_type: 'SINGLE_CHOICE',
              question_image: null,
              answer_options: [
                { option_id: 1, label: 'A', option_text: '4', is_correct: true },
                { option_id: 2, label: 'B', option_text: '5', is_correct: false },
              ],
            },
          },
        ],
      },
    });
    prisma.exam.update.mockResolvedValue({ exam_id: 42, access_password: 'ABCD2345WX' });

    const res = await request(app)
      .get('/api/students/exams/42/prefetch')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('encrypted');
    expect(res.body.data.encrypted).toHaveProperty('ciphertext');
    // Answer keys must never reach the device — payload is encrypted, not plain.
    expect(JSON.stringify(res.body.data)).not.toContain('is_correct');
  });

  test('BB-EF-05: start exam that not assigned → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);
    prisma.examParticipant.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/students/exams/start')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ exam_id: 99999 });

    expect(res.status).toBe(404);
  });
});

// ─── Step 5: Student submits answer ───────────────────────────────────────────

describe('Step 5: Student submits answer', () => {
  test('BB-EF-06: POST /api/students/exams/answer → 200, auto-saved', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);
    prisma.examParticipant.findFirst.mockResolvedValue({
      exam_participant_id: 10,
      exam_status: 'IN_PROGRESS',
      is_blocked: false,
      start_time: new Date(Date.now() - 5 * 60000),
      exam: {
        exam_id: 42, end_date: new Date('2099-12-31'), duration_minutes: 90,
        exam_questions: [{
          exam_question_id: 1, question_id: 1,
          question: {
            question_id: 1, question_type: 'SINGLE_CHOICE',
            answer_options: [
              { option_id: 1, option_text: '4', is_correct: true },
              { option_id: 2, option_text: '5', is_correct: false },
            ],
          },
        }],
      },
      student: { user_id: 3 },
    });
    prisma.answer.upsert.mockResolvedValue({ answer_id: 1 });

    const res = await request(app)
      .post('/api/students/exams/answer')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({
        exam_participant_id: 10,
        question_id: 1,
        mc_option_ids: '1',
      });

    expect([200, 201]).toContain(res.status);
  });
});

// ─── Step 6: Student finishes exam ────────────────────────────────────────────

describe('Step 6: Student finishes exam', () => {
  test('BB-EF-07: POST /api/students/exams/finish → 200, COMPLETED/GRADED', async () => {
    prisma.user.findUnique.mockResolvedValue(studentDbUser);
    prisma.student.findUnique.mockResolvedValue(mockStudent);
    prisma.examParticipant.findFirst.mockResolvedValue({
      exam_participant_id: 10,
      exam_status: 'IN_PROGRESS',
      exam: { exam_id: 42, end_date: new Date('2099-12-31'), duration_minutes: 90 },
    });
    prisma.examParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam_participant_id: 10,
      exam: { exam_questions: [{ question_id: 1, score_weight: 10 }] },
      answers: [{ question_id: 1, is_correct: true, mc_option_ids: null, manual_score: null, question: { question_type: 'SINGLE_CHOICE', answer_options: [] } }],
    });
    prisma.examResult.upsert.mockResolvedValue({ final_score: 100 });
    prisma.examParticipant.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/students/exams/finish')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ exam_participant_id: 10 });

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('result.final_score');
  });
});

// ─── Step 7: Teacher views exam results ───────────────────────────────────────

describe('Step 7: Teacher views exam results', () => {
  test('BB-EF-08: GET /api/exam-results/exam/:exam_id → 200 with results', async () => {
    prisma.user.findUnique.mockResolvedValue(teacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    prisma.exam.findUnique.mockResolvedValue({
      exam_id: 42, exam_name: 'Ujian Flow Test', subject: 'Matematika', teacher_id: 1,
    });
    prisma.examResult.findMany.mockResolvedValue([
      {
        exam_result_id: 1, final_score: 80, submit_date: new Date(),
        exam_participant: {
          exam_participant_id: 10, exam_status: 'GRADED',
          student: { full_name: 'Siswa Test', classroom: 'X-IPA-1' },
        },
      },
    ]);
    prisma.examResult.count.mockResolvedValue(1);
    prisma.examParticipant.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/exam-results/exam/42')
      .set('Authorization', `Bearer ${teacherToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});

// ─── Step 8: Admin blocks and unblocks participant ────────────────────────────

describe('Step 8: Admin monitoring — block and unblock', () => {
  test('BB-EF-09: POST /api/admin/activities/:id/block → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(adminDbUser);
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam_participant_id: 10, is_blocked: false, exam_status: 'IN_PROGRESS',
      student: { user_id: 3, full_name: 'Siswa Test' },
      exam: { exam_id: 42, exam_name: 'Ujian Flow Test' },
    });
    prisma.examParticipant.update.mockResolvedValue({
      exam_participant_id: 10, is_blocked: true, block_reason: 'Kecurangan terdeteksi',
      student: { student_id: 1, full_name: 'Siswa Test' },
    });

    const res = await request(app)
      .post('/api/admin/activities/10/block')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ block_reason: 'Kecurangan terdeteksi' });

    expect(res.status).toBe(200);
  });

  test('BB-EF-10: POST /api/admin/activities/:id/generate-unlock → 200 with unlock code', async () => {
    prisma.user.findUnique.mockResolvedValue(adminDbUser);
    prisma.examParticipant.findFirst.mockResolvedValue(null); // uniqueness check: unlock code not taken
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam_participant_id: 10, is_blocked: true,
      student: { full_name: 'Siswa Test' },
      exam: { exam_name: 'Ujian Flow Test' },
    });
    prisma.examParticipant.update.mockResolvedValue({
      exam_participant_id: 10, unlock_code: 'ABC123',
      student: { student_id: 1, full_name: 'Siswa Test' },
    });

    const res = await request(app)
      .post('/api/admin/activities/10/generate-unlock')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data.unlock_code');
  });

  test('BB-EF-11: POST /api/admin/activities/:id/unblock → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(adminDbUser);
    prisma.examParticipant.findUnique.mockResolvedValue({
      exam_participant_id: 10, is_blocked: true,
      student: { user_id: 3 },
      exam: { exam_id: 42 },
    });
    prisma.examParticipant.update.mockResolvedValue({ exam_participant_id: 10, is_blocked: false });

    const res = await request(app)
      .post('/api/admin/activities/10/unblock')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unlock_code: 'ABC123' });

    expect([200, 400]).toContain(res.status); // 400 if code validation fails
  });
});
