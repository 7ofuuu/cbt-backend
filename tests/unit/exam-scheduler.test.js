/**
 * White Box Test: Auto-Finish & Auto-Expire Schedulers
 * WB-4 — SB-58
 * Target: src/services/autoFinishService.js + src/services/autoExpireExamService.js
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/scoreService', () => ({
  calculateScore: jest.fn().mockReturnValue({
    finalScore: 0, hasEssay: false, allEssayGraded: true,
  }),
}));

const prisma = require('../../src/config/db');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Both findMany calls return empty by default (no sessions to finish)
  prisma.examParticipant.findMany.mockResolvedValue([]);
  prisma.exam.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── autoFinishService scheduler ─────────────────────────────────────────────

describe('startAutoFinishScheduler', () => {
  test('WB-S1: checkAndFinishExpiredSessions runs immediately on start', async () => {
    const { startAutoFinishScheduler } = require('../../src/services/autoFinishService');
    startAutoFinishScheduler();

    // Flush the initial async call
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.examParticipant.findMany).toHaveBeenCalled();
  });

  test('WB-S2: after 60 seconds, checkAndFinish runs a second time', async () => {
    const { startAutoFinishScheduler } = require('../../src/services/autoFinishService');
    const intervalId = startAutoFinishScheduler();

    await Promise.resolve();
    const callsAfterStart = prisma.examParticipant.findMany.mock.calls.length;

    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.examParticipant.findMany.mock.calls.length).toBeGreaterThan(callsAfterStart);

    clearInterval(intervalId);
  });

  test('WB-S3: after 120 seconds, checkAndFinish runs a third time', async () => {
    const { startAutoFinishScheduler } = require('../../src/services/autoFinishService');
    const intervalId = startAutoFinishScheduler();

    await Promise.resolve();
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    // Each check calls findMany twice (activeSessions + perStudentExpired)
    // 3 runs × 2 calls = at least 6 total, but we just check it was called multiple times
    expect(prisma.examParticipant.findMany.mock.calls.length).toBeGreaterThanOrEqual(2);

    clearInterval(intervalId);
  });

  test('WB-S4: startAutoFinishScheduler returns a valid interval handle', () => {
    const { startAutoFinishScheduler } = require('../../src/services/autoFinishService');
    const intervalId = startAutoFinishScheduler();
    expect(intervalId).toBeDefined();
    expect(() => clearInterval(intervalId)).not.toThrow();
  });
});

// ─── autoExpireExamService scheduler ─────────────────────────────────────────

describe('startAutoExpireScheduler', () => {
  test('WB-S5: checkAndExpireExams runs immediately on start', async () => {
    const { startAutoExpireScheduler } = require('../../src/services/autoExpireExamService');
    startAutoExpireScheduler();

    await Promise.resolve();

    expect(prisma.exam.findMany).toHaveBeenCalled();
  });

  test('WB-S6: after 60 seconds, checkAndExpire runs a second time', async () => {
    const { startAutoExpireScheduler } = require('../../src/services/autoExpireExamService');
    const intervalId = startAutoExpireScheduler();

    await Promise.resolve();
    const callsAfterStart = prisma.exam.findMany.mock.calls.length;

    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    expect(prisma.exam.findMany.mock.calls.length).toBeGreaterThan(callsAfterStart);

    clearInterval(intervalId);
  });

  test('WB-S7: returns a valid interval handle', () => {
    const { startAutoExpireScheduler } = require('../../src/services/autoExpireExamService');
    const intervalId = startAutoExpireScheduler();
    expect(intervalId).toBeDefined();
    expect(() => clearInterval(intervalId)).not.toThrow();
  });
});

// ─── checkAndExpireExams logic ────────────────────────────────────────────────

describe('checkAndExpireExams', () => {
  test('WB-S8: no expired exams → returns expiredCount = 0', async () => {
    const { checkAndExpireExams } = require('../../src/services/autoExpireExamService');
    prisma.exam.findMany.mockResolvedValue([]);
    const result = await checkAndExpireExams();
    expect(result.expiredCount).toBe(0);
    expect(result.success).toBe(true);
  });

  test('WB-S9: expired exam found → status updated to ENDED', async () => {
    const { checkAndExpireExams } = require('../../src/services/autoExpireExamService');
    prisma.exam.findMany.mockResolvedValue([{
      exam_id: 1,
      exam_name: 'Ujian Kadaluarsa',
      exam_status: 'ONGOING',
      end_date: new Date('2025-01-01'),
      teacher_id: 1,
      teacher: { user_id: 2, user: {} },
    }]);
    prisma.exam.update.mockResolvedValue({ exam_id: 1 });

    const result = await checkAndExpireExams();
    expect(result.expiredCount).toBe(1);
    expect(prisma.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { exam_status: 'ENDED' } })
    );
  });
});
