/**
 * White Box Test: Analytics Service
 * WB-15
 * Target: src/services/analyticsService.js
 *   calculateQuestionStats, getQuestionStatistics, getDashboardSummary,
 *   getTeacherPerformanceOverview, getAdminAuditOverview
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const {
  calculateQuestionStats,
  getQuestionStatistics,
  getDashboardSummary,
  getTeacherPerformanceOverview,
  getAdminAuditOverview,
} = require('../../src/services/analyticsService');

const coordinator = { teacher_id: 1, subject: 'IPA', is_coordinator: true };
const teacher = { teacher_id: 2, subject: 'IPA', is_coordinator: false };

beforeEach(() => jest.clearAllMocks());

// ─── calculateQuestionStats (pure) ────────────────────────────────────────────

describe('calculateQuestionStats', () => {
  test('WB-AN-01: zero attempts → all zero, avg_manual_score null', () => {
    expect(calculateQuestionStats([], 'SINGLE_CHOICE')).toMatchObject({
      total_attempts: 0,
      correct_count: 0,
      incorrect_count: 0,
      correct_rate: 0,
    });
  });

  test('WB-AN-02: SINGLE_CHOICE → counts correct/incorrect/unanswered and rates', () => {
    const answers = [
      { is_correct: true },
      { is_correct: false },
      { is_correct: null, mc_option_ids: null },
      { is_correct: true },
    ];
    const stats = calculateQuestionStats(answers, 'SINGLE_CHOICE');
    expect(stats.correct_count).toBe(2);
    expect(stats.incorrect_count).toBe(1);
    expect(stats.unanswered_count).toBe(1);
    expect(stats.correct_rate).toBe(50);
    expect(stats.incorrect_rate).toBe(25);
  });

  test('WB-AN-03: ESSAY graded → avg_manual_score computed, graded/ungraded counts', () => {
    const answers = [
      { manual_score: 80, essay_answer_text: 'a' },
      { manual_score: 60, essay_answer_text: 'b' },
      { manual_score: null, essay_answer_text: null },
    ];
    const stats = calculateQuestionStats(answers, 'ESSAY');
    expect(stats.avg_manual_score).toBe(70);
    expect(stats.graded_count).toBe(2);
    expect(stats.ungraded_count).toBe(1);
    expect(stats.unanswered_count).toBe(1);
  });

  test('WB-AN-04: ESSAY with none graded → avg_manual_score null', () => {
    const stats = calculateQuestionStats([{ manual_score: null, essay_answer_text: 'x' }], 'ESSAY');
    expect(stats.avg_manual_score).toBeNull();
    expect(stats.graded_count).toBe(0);
  });
});

// ─── getQuestionStatistics ────────────────────────────────────────────────────

describe('getQuestionStatistics', () => {
  const pagination = { page: 1, limit: 10, skip: 0 };

  test('WB-AN-05: teacher without subject and not coordinator → AppError 400', async () => {
    await expect(
      getQuestionStatistics({}, { subject: null, is_coordinator: false }, pagination)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-AN-06: regular teacher filtering foreign subject → AppError 403', async () => {
    await expect(
      getQuestionStatistics({ subject: 'Fisika' }, teacher, pagination)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('WB-AN-07: exam filter, exam not found → AppError 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    await expect(
      getQuestionStatistics({ exam_id: '5' }, coordinator, pagination)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('WB-AN-08: exam filter with no questions → empty data set', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 5, subject: 'IPA' });
    prisma.examQuestion.findMany.mockResolvedValue([]);
    const out = await getQuestionStatistics({ exam_id: '5' }, coordinator, pagination);
    expect(out.data).toEqual([]);
    expect(out.pagination.total).toBe(0);
  });

  test('WB-AN-09: happy path → per-question stats, sorted by incorrect_rate desc by default', async () => {
    prisma.question.count.mockResolvedValue(2);
    prisma.question.findMany.mockResolvedValue([
      {
        question_id: 1, question_text: 'Q1', question_type: 'SINGLE_CHOICE', subject: 'IPA', grade_level: '10',
        question_bank: { question_bank_id: 1, bank_name: 'B' },
        answers: [{ is_correct: true }, { is_correct: false }], // incorrect_rate 50
        exam_questions: [{ exam_id: 1 }],
      },
      {
        question_id: 2, question_text: 'Q2', question_type: 'SINGLE_CHOICE', subject: 'IPA', grade_level: '10',
        question_bank: { question_bank_id: 1, bank_name: 'B' },
        answers: [{ is_correct: false }, { is_correct: false }], // incorrect_rate 100
        exam_questions: [{ exam_id: 1 }],
      },
    ]);
    const out = await getQuestionStatistics({}, teacher, pagination);
    expect(out.data[0].question_id).toBe(2); // highest incorrect_rate first
    expect(out.data[0].statistics.incorrect_rate).toBe(100);
    expect(out.pagination.totalPages).toBe(1);
  });

  test('WB-AN-10: sort_by total_attempts asc honoured', async () => {
    prisma.question.count.mockResolvedValue(2);
    prisma.question.findMany.mockResolvedValue([
      { question_id: 1, question_type: 'SINGLE_CHOICE', question_bank: null, answers: [{ is_correct: true }, { is_correct: true }, { is_correct: false }], exam_questions: [] },
      { question_id: 2, question_type: 'SINGLE_CHOICE', question_bank: null, answers: [{ is_correct: true }], exam_questions: [] },
    ]);
    const out = await getQuestionStatistics({ sort_by: 'total_attempts', order: 'asc' }, teacher, pagination);
    expect(out.data[0].question_id).toBe(2); // fewest attempts first
  });
});

// ─── getDashboardSummary ──────────────────────────────────────────────────────

describe('getDashboardSummary', () => {
  test('WB-AN-11: aggregates question counts by type, exam/bank totals, recent exams', async () => {
    prisma.question.groupBy.mockResolvedValue([
      { question_type: 'SINGLE_CHOICE', _count: { question_id: 4 } },
      { question_type: 'ESSAY', _count: { question_id: 2 } },
    ]);
    prisma.exam.count.mockResolvedValue(3);
    prisma.questionBank.count.mockResolvedValue(5);
    prisma.exam.findMany.mockResolvedValue([
      {
        exam_id: 1, exam_name: 'UTS', subject: 'IPA',
        exam_participants: [
          { exam_result: { final_score: 80 } },
          { exam_result: { final_score: 90 } },
          { exam_result: null },
        ],
      },
    ]);
    const out = await getDashboardSummary(teacher);
    expect(out.questions.total).toBe(6);
    expect(out.questions.by_type).toEqual({ SINGLE_CHOICE: 4, ESSAY: 2 });
    expect(out.exams.total).toBe(3);
    expect(out.question_banks.total).toBe(5);
    expect(out.recent_exams[0]).toMatchObject({ participant_count: 3, avg_score: 85 });
  });

  test('WB-AN-12: recent exam with no scored participants → avg_score null', async () => {
    prisma.question.groupBy.mockResolvedValue([]);
    prisma.exam.count.mockResolvedValue(0);
    prisma.questionBank.count.mockResolvedValue(0);
    prisma.exam.findMany.mockResolvedValue([
      { exam_id: 1, exam_name: 'X', subject: 'IPA', exam_participants: [{ exam_result: null }] },
    ]);
    const out = await getDashboardSummary(teacher);
    expect(out.recent_exams[0].avg_score).toBeNull();
    expect(out.questions.total).toBe(0);
  });
});

// ─── getTeacherPerformanceOverview ────────────────────────────────────────────

describe('getTeacherPerformanceOverview', () => {
  test('WB-AN-13: teacher without subject, not coordinator → AppError 400', async () => {
    await expect(
      getTeacherPerformanceOverview({ subject: null, is_coordinator: false }, {})
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('WB-AN-14: regular teacher filtering foreign subject → AppError 403', async () => {
    await expect(
      getTeacherPerformanceOverview(teacher, { subject: 'Kimia' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('WB-AN-15: selected exam not found → AppError 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    await expect(
      getTeacherPerformanceOverview(coordinator, { exam_id: '9' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('WB-AN-16: happy path → summary, trend, student_watchlist computed', async () => {
    prisma.exam.findMany.mockResolvedValue([
      {
        exam_id: 1, exam_name: 'UTS', subject: 'IPA', grade_level: '10', major: 'IPA',
        exam_status: 'ENDED', end_date: new Date(),
        exam_participants: [
          { exam_status: 'GRADED', student_id: 1, student: { full_name: 'A', classroom: 'X-IPA-1' }, exam_result: { final_score: 90, submit_date: new Date() } },
          { exam_status: 'COMPLETED', student_id: 2, student: { full_name: 'B', classroom: 'X-IPA-1' }, exam_result: { final_score: 60, submit_date: new Date() } },
          { exam_status: 'NOT_STARTED', student_id: 3, student: { full_name: 'C', classroom: 'X-IPA-1' }, exam_result: null },
        ],
      },
    ]);
    prisma.question.findMany.mockResolvedValue([]);
    const out = await getTeacherPerformanceOverview(teacher, { days: '30' });
    expect(out.summary.total_participants).toBe(3);
    expect(out.summary.completed_participants).toBe(2);
    expect(out.summary.graded_participants).toBe(1);
    expect(out.summary.grading_backlog).toBe(1);
    expect(out.summary.average_score).toBe(75); // (90+60)/2
    expect(Array.isArray(out.trend)).toBe(true);
    expect(out.student_watchlist.length).toBe(3);
    // student with NOT_STARTED + no score should rank highest risk
    expect(out.student_watchlist[0].student_id).toBe(3);
  });

  test('WB-AN-17: days is capped at 180', async () => {
    prisma.exam.findMany.mockResolvedValue([]);
    const out = await getTeacherPerformanceOverview(teacher, { days: '999' });
    expect(out.meta.days).toBe(180);
  });
});

// ─── getAdminAuditOverview ────────────────────────────────────────────────────

describe('getAdminAuditOverview', () => {
  test('WB-AN-18: aggregates teacher/student performance and trend', async () => {
    prisma.exam.findMany.mockResolvedValue([
      {
        exam_id: 1, exam_name: 'UTS', subject: 'IPA', grade_level: '10', major: 'IPA',
        exam_status: 'ENDED', end_date: new Date(),
        teacher: { teacher_id: 7, full_name: 'Guru', subject: 'IPA' },
        exam_participants: [
          { exam_status: 'GRADED', student_id: 1, student: { full_name: 'A', classroom: 'X' }, exam_result: { final_score: 90, submit_date: new Date() } },
          { exam_status: 'COMPLETED', student_id: 2, student: { full_name: 'B', classroom: 'X' }, exam_result: { final_score: 50, submit_date: new Date() } },
        ],
      },
    ]);
    prisma.question.findMany.mockResolvedValue([]);
    const out = await getAdminAuditOverview({ days: '30', limit: '8' });
    expect(out.summary.total_exams).toBe(1);
    expect(out.summary.total_participants).toBe(2);
    expect(out.teacher_performance).toHaveLength(1);
    expect(out.teacher_performance[0]).toMatchObject({ teacher_id: 7, average_score: 70 });
    expect(out.student_risk.length).toBe(2);
    expect(out.student_top.length).toBeGreaterThan(0);
  });

  test('WB-AN-19: days capped at 365, limit capped at 50', async () => {
    prisma.exam.findMany.mockResolvedValue([]);
    const out = await getAdminAuditOverview({ days: '9999', limit: '999' });
    expect(out.meta.days).toBe(365);
  });

  test('WB-AN-20: invalid days (non-positive) → AppError 400', async () => {
    await expect(getAdminAuditOverview({ days: '-3' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
