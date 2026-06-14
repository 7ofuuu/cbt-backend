/**
 * White Box Test: Exam Timer Logic (Dual Timer)
 * WB-3 - SB-57
 * Target: src/services/autoFinishService.js (dual timer filtering logic)
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/scoreService', () => ({
  calculateScore: jest.fn(),
}));

const prisma = require('../../src/config/db');
const { calculateScore } = require('../../src/services/scoreService');
const { checkAndFinishExpiredSessions } = require('../../src/services/autoFinishService');

// Fixed "now" for all tests
const FIXED_NOW = new Date('2025-06-01T10:00:00.000Z');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeParticipant = (id, startTimeMs, durationMinutes, examEndDate) => ({
  exam_participant_id: id,
  exam_status: 'IN_PROGRESS',
  exam_id: 100,
  start_time: new Date(startTimeMs),
  exam: {
    exam_id: 100,
    exam_name: 'Ujian Test',
    exam_status: 'ONGOING',
    end_date: new Date(examEndDate),
    duration_minutes: durationMinutes,
    exam_questions: [{ question_id: 1, score_weight: 10 }],
  },
  student: { user_id: 1, user: { username: 'siswa1' } },
  answers: [],
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  jest.clearAllMocks();

  // Default score mock
  calculateScore.mockReturnValue({
    finalScore: 80,
    hasEssay: false,
    allEssayGraded: true,
  });

  // Default transaction mock
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  prisma.examParticipant.update.mockResolvedValue({});
  prisma.examResult.upsert.mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Window-expired sessions (first findMany) ─────────────────────────────────

describe('Exam window expiry (activeSessions)', () => {
  test('WB-T-W1: sessions with exam.end_date < now are fetched and finished', async () => {
    // activeSessions: exam has ended
    const expiredParticipant = makeParticipant(
      1,
      FIXED_NOW.getTime() - 60 * 60000, // started 60 min ago
      120,                               // 120 min duration
      FIXED_NOW.getTime() - 1000        // exam ended 1 second ago
    );
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([expiredParticipant]) // activeSessions
      .mockResolvedValueOnce([]);                   // perStudentExpired (empty)

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(1);
    expect(prisma.examParticipant.update).toHaveBeenCalled();
  });

  test('WB-T-W2: no sessions → finishedCount = 0', async () => {
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(0);
    expect(prisma.examParticipant.update).not.toHaveBeenCalled();
  });
});

// ─── Per-student timer filter (second findMany, in-memory filter) ─────────────

describe('Per-student timer filter', () => {
  test('WB-T1: start + duration < now → session included in timedOut', async () => {
    // Session started 120 min ago, duration = 60 min → deadline was 60 min ago
    const participant = makeParticipant(
      2,
      FIXED_NOW.getTime() - 120 * 60000, // started 120 min ago
      60,                                  // 60 min duration → deadline = 60 min ago
      FIXED_NOW.getTime() + 30 * 60000   // exam window still open
    );
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([])             // activeSessions (empty)
      .mockResolvedValueOnce([participant]); // perStudentExpired

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(1);
  });

  test('WB-T2: start + duration > now → session NOT included (timer still running)', async () => {
    // Session started 30 min ago, duration = 120 min → deadline 90 min in the future
    const participant = makeParticipant(
      3,
      FIXED_NOW.getTime() - 30 * 60000,  // started 30 min ago
      120,                                 // 120 min → 90 min remaining
      FIXED_NOW.getTime() + 90 * 60000   // exam window open
    );
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([participant]);

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(0);
  });

  test('WB-T3: start + duration exactly = now → NOT included (strict < check)', async () => {
    // start_time + duration_minutes * 60000 = now exactly → deadline < now is FALSE
    const participant = makeParticipant(
      4,
      FIXED_NOW.getTime() - 60 * 60000,  // started 60 min ago
      60,                                  // 60 min → deadline = exactly now
      FIXED_NOW.getTime() + 60 * 60000
    );
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([participant]);

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(0);
  });

  test('WB-T4: combined expired sessions (both sets) → total count is sum', async () => {
    const windowExpired = makeParticipant(
      5,
      FIXED_NOW.getTime() - 60 * 60000,
      120,
      FIXED_NOW.getTime() - 1000          // exam window ended
    );
    const timerExpired = makeParticipant(
      6,
      FIXED_NOW.getTime() - 120 * 60000,
      60,
      FIXED_NOW.getTime() + 30 * 60000   // exam window still open
    );
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([windowExpired])
      .mockResolvedValueOnce([timerExpired]);

    const count = await checkAndFinishExpiredSessions();
    expect(count).toBe(2);
  });
});

// ─── Status determination after score calculation ─────────────────────────────

describe('Status determination (GRADED vs COMPLETED)', () => {
  const makeExpiredParticipant = (id) => makeParticipant(
    id,
    FIXED_NOW.getTime() - 120 * 60000,
    60,
    FIXED_NOW.getTime() - 1000
  );

  test('WB-T5: hasEssay = false → newStatus = GRADED', async () => {
    calculateScore.mockReturnValue({ finalScore: 80, hasEssay: false, allEssayGraded: true });
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([makeExpiredParticipant(7)])
      .mockResolvedValueOnce([]);

    await checkAndFinishExpiredSessions();
    expect(prisma.examParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ exam_status: 'GRADED' }) })
    );
  });

  test('WB-T6: hasEssay = true, allEssayGraded = true → newStatus = GRADED', async () => {
    calculateScore.mockReturnValue({ finalScore: 75, hasEssay: true, allEssayGraded: true });
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([makeExpiredParticipant(8)])
      .mockResolvedValueOnce([]);

    await checkAndFinishExpiredSessions();
    expect(prisma.examParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ exam_status: 'GRADED' }) })
    );
  });

  test('WB-T7: hasEssay = true, allEssayGraded = false → newStatus = COMPLETED', async () => {
    calculateScore.mockReturnValue({ finalScore: 50, hasEssay: true, allEssayGraded: false });
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([makeExpiredParticipant(9)])
      .mockResolvedValueOnce([]);

    await checkAndFinishExpiredSessions();
    expect(prisma.examParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ exam_status: 'COMPLETED' }) })
    );
  });
});

// ─── Transaction and result upsert ───────────────────────────────────────────

describe('Transaction and result persistence', () => {
  test('WB-T-TX: transaction is called for each expired session', async () => {
    const p1 = makeParticipant(10, FIXED_NOW.getTime() - 60 * 60000, 120, FIXED_NOW.getTime() - 1000);
    const p2 = makeParticipant(11, FIXED_NOW.getTime() - 60 * 60000, 120, FIXED_NOW.getTime() - 1000);
    prisma.examParticipant.findMany
      .mockResolvedValueOnce([p1, p2])
      .mockResolvedValueOnce([]);

    await checkAndFinishExpiredSessions();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.examResult.upsert).toHaveBeenCalledTimes(2);
  });
});
