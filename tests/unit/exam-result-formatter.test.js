/**
 * White Box Test: Exam Result Formatter Service
 * WB-12
 * Target: src/services/examResultFormatter.js (formatExamForList + internal stats)
 * Pure functions over plain objects — no mocks needed.
 */
const { formatExamForList, EXAM_LIST_INCLUDE } = require('../../src/services/examResultFormatter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeParticipant = (score, overrides = {}) => ({
  exam_participant_id: 1,
  student: { student_id: 1, full_name: 'S', classroom: 'X-IPA-1' },
  exam_status: 'COMPLETED',
  start_time: 't1',
  end_time: 't2',
  exam_result: score === null ? null : { final_score: score, submit_date: 'd' },
  ...overrides,
});

const makeExam = (participants, overrides = {}) => ({
  exam_id: 1,
  exam_name: 'UTS',
  subject: 'IPA',
  grade_level: '10',
  major: 'IPA',
  start_date: 's',
  end_date: 'e',
  duration_minutes: 90,
  exam_status: 'ENDED',
  teacher_submitted_at: 'ts',
  teacher: { teacher_id: 1, full_name: 'Guru' },
  _count: { exam_participants: 30, exam_questions: 10 },
  exam_participants: participants,
  ...overrides,
});

// ─── EXAM_LIST_INCLUDE ────────────────────────────────────────────────────────

describe('EXAM_LIST_INCLUDE', () => {
  test('WB-RF-01: only COMPLETED/GRADED participants are included', () => {
    expect(EXAM_LIST_INCLUDE.exam_participants.where).toEqual({ exam_status: { in: ['COMPLETED', 'GRADED'] } });
  });
});

// ─── computeStats (via formatExamForList) ─────────────────────────────────────

describe('formatExamForList — statistics', () => {
  test('WB-RF-02: aggregates highest/lowest/average over scored participants', () => {
    const exam = makeExam([makeParticipant(80), makeParticipant(60), makeParticipant(100)]);
    const out = formatExamForList(exam);
    expect(out.statistics).toMatchObject({
      total_participants: 30,
      total_completed: 3,
      total_questions: 10,
      highest_score: 100,
      lowest_score: 60,
      average_score: 80,
    });
  });

  test('WB-RF-03: participants without a result are excluded from score stats', () => {
    const exam = makeExam([makeParticipant(90), makeParticipant(null)]);
    const out = formatExamForList(exam);
    expect(out.statistics.highest_score).toBe(90);
    expect(out.statistics.lowest_score).toBe(90);
    expect(out.statistics.average_score).toBe(90);
  });

  test('WB-RF-04: no scored participants → all score stats default to 0', () => {
    const exam = makeExam([makeParticipant(null)]);
    const out = formatExamForList(exam);
    expect(out.statistics).toMatchObject({ highest_score: 0, lowest_score: 0, average_score: 0 });
  });

  test('WB-RF-05: scores rounded to 2 decimals', () => {
    const exam = makeExam([makeParticipant(33.333), makeParticipant(66.666)]);
    const out = formatExamForList(exam);
    expect(out.statistics.average_score).toBeCloseTo(50, 2);
    expect(out.statistics.highest_score).toBe(66.67);
  });
});

// ─── participant projection ───────────────────────────────────────────────────

describe('formatExamForList — participant_results', () => {
  test('WB-RF-06: scored participant → final_score rounded, submit_date surfaced', () => {
    const out = formatExamForList(makeExam([makeParticipant(77.777)]));
    expect(out.participant_results[0]).toMatchObject({ final_score: 77.78, submit_date: 'd' });
  });

  test('WB-RF-07: participant without result → final_score null, submit_date null', () => {
    const out = formatExamForList(makeExam([makeParticipant(null)]));
    expect(out.participant_results[0].final_score).toBeNull();
    expect(out.participant_results[0].submit_date).toBeNull();
  });
});

// ─── archived vs active shape ─────────────────────────────────────────────────

describe('formatExamForList — shape variants', () => {
  test('WB-RF-08: active list (default) → includes duration_minutes + exam_status, not teacher_submitted_at', () => {
    const out = formatExamForList(makeExam([makeParticipant(80)]));
    expect(out.duration_minutes).toBe(90);
    expect(out.exam_status).toBe('ENDED');
    expect(out.teacher_submitted_at).toBeUndefined();
  });

  test('WB-RF-09: archived list → includes teacher_submitted_at, not duration/status', () => {
    const out = formatExamForList(makeExam([makeParticipant(80)]), { includeArchivedAt: true });
    expect(out.teacher_submitted_at).toBe('ts');
    expect(out.duration_minutes).toBeUndefined();
    expect(out.exam_status).toBeUndefined();
  });
});
