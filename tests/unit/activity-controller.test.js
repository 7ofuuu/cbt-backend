/**
 * White Box Test: Activity Controller + Activity Log Controller
 * WB-22
 * Target: src/controllers/activityController.js (admin exam monitoring + block/unlock)
 *         src/controllers/activityLogController.js (log query endpoints)
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const activityCtrl = require('../../src/controllers/activityController');
const logCtrl = require('../../src/controllers/activityLogController');

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
};
const flush = () => new Promise((r) => setImmediate(r));
const run = async (handler, overrides) => {
  const ctx = makeReqRes(overrides);
  handler(ctx.req, ctx.res, ctx.next);
  await flush();
  return ctx;
};

beforeEach(() => jest.clearAllMocks());

// ─── getAllActivities ─────────────────────────────────────────────────────────

describe('getAllActivities', () => {
  test('WB-AC-01: maps exams with computed status + exam_type label', async () => {
    const HOUR = 60 * 60 * 1000;
    prisma.exam.findMany.mockResolvedValue([
      { exam_id: 1, exam_name: 'Ujian Akhir Matematika', subject: 'MTK', major: 'IPA', grade_level: '10', start_date: new Date(Date.now() - HOUR), end_date: new Date(Date.now() + HOUR), duration_minutes: 60, _count: { exam_participants: 5 }, teacher: { teacher_id: 1, full_name: 'G' } },
    ]);
    const { res } = await run(activityCtrl.getAllActivities, { query: {} });
    const data = res.json.mock.calls[0][0].data[0];
    expect(data.exam_type).toBe('Ujian Akhir Semester');
    expect(data.status).toBe('Sedang ONGOING');
    expect(data.participant_count).toBe(5);
  });

  test('WB-AC-02: filter by major builds where clause (excludes "all")', async () => {
    prisma.exam.findMany.mockResolvedValue([]);
    await run(activityCtrl.getAllActivities, { query: { major: 'IPA', classroom: 'all' } });
    expect(prisma.exam.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { major: 'IPA' } }));
  });
});

// ─── getExamParticipants ──────────────────────────────────────────────────────

describe('getExamParticipants', () => {
  test('WB-AC-03: exam not found → 404', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);
    const { next } = await run(activityCtrl.getExamParticipants, { params: { examId: '1' }, query: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-AC-04: valid → returns participants + access_password (null before H-1)', async () => {
    prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_name: 'UTS', subject: 'IPA', grade_level: '10', major: 'IPA', start_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), end_date: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), duration_minutes: 60, access_password: null });
    prisma.examParticipant.findMany.mockResolvedValue([
      { exam_participant_id: 1, is_blocked: true, exam_status: 'IN_PROGRESS', student: { full_name: 'A', grade_level: '10', major: 'IPA', classroom: 'X' } },
    ]);
    const { res } = await run(activityCtrl.getExamParticipants, { params: { examId: '1' }, query: { status: 'BLOCKED' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.participants[0].status).toBe('Blocked');
    expect(payload.data.exam.access_password).toBeNull();
    expect(prisma.examParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ is_blocked: true }) }));
  });
});

// ─── getParticipantDetail ─────────────────────────────────────────────────────

describe('getParticipantDetail', () => {
  test('WB-AC-05: not found → 404', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    const { next } = await run(activityCtrl.getParticipantDetail, { params: { examParticipantId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-AC-06: valid → status label derived', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, exam_status: 'COMPLETED', student: { full_name: 'A', grade_level: '10', classroom: 'X', major: 'IPA' }, exam: { subject: 'IPA', exam_name: 'UTS' } });
    const { res } = await run(activityCtrl.getParticipantDetail, { params: { examParticipantId: '1' } });
    expect(res.json.mock.calls[0][0].data.status).toBe('Submitted');
  });
});

// ─── blockParticipant ─────────────────────────────────────────────────────────

describe('blockParticipant', () => {
  test('WB-AC-07: missing block_reason → 400', async () => {
    const { next } = await run(activityCtrl.blockParticipant, { params: { examParticipantId: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AC-08: participant not found → 404', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    const { next } = await run(activityCtrl.blockParticipant, { params: { examParticipantId: '1' }, body: { block_reason: 'cheat' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-AC-09: valid → blocks participant', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1 });
    prisma.examParticipant.update.mockResolvedValue({ exam_participant_id: 1, is_blocked: true, block_reason: 'cheat', student: { full_name: 'A' } });
    const { res } = await run(activityCtrl.blockParticipant, { params: { examParticipantId: '1' }, body: { block_reason: 'cheat' } });
    expect(res.json.mock.calls[0][0].data.is_blocked).toBe(true);
  });
});

// ─── generateUnlockCode ───────────────────────────────────────────────────────

describe('generateUnlockCode', () => {
  test('WB-AC-10: not found → 404', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue(null);
    const { next } = await run(activityCtrl.generateUnlockCode, { params: { examParticipantId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-AC-11: not blocked → 400', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1, is_blocked: false });
    const { next } = await run(activityCtrl.generateUnlockCode, { params: { examParticipantId: '1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AC-12: blocked → generates unique 6-char code', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1, is_blocked: true });
    prisma.examParticipant.findFirst.mockResolvedValue(null); // code unique
    prisma.examParticipant.update.mockResolvedValue({ exam_participant_id: 1, unlock_code: 'ABC123', student: { full_name: 'A' } });
    const { res } = await run(activityCtrl.generateUnlockCode, { params: { examParticipantId: '1' } });
    const updateArg = prisma.examParticipant.update.mock.calls[0][0];
    expect(updateArg.data.unlock_code).toHaveLength(6);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

// ─── unblockParticipant ───────────────────────────────────────────────────────

describe('unblockParticipant', () => {
  test('WB-AC-13: missing unlock_code → 400', async () => {
    const { next } = await run(activityCtrl.unblockParticipant, { params: { examParticipantId: '1' }, body: {} });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AC-14: wrong unlock_code → 400', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1, is_blocked: true, unlock_code: 'RIGHT1' });
    const { next } = await run(activityCtrl.unblockParticipant, { params: { examParticipantId: '1' }, body: { unlock_code: 'wrong1' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AC-15: valid code (case-insensitive) → unblocks', async () => {
    prisma.examParticipant.findUnique.mockResolvedValue({ exam_participant_id: 1, is_blocked: true, unlock_code: 'ABC123' });
    prisma.examParticipant.update.mockResolvedValue({ exam_participant_id: 1, is_blocked: false, student: { full_name: 'A' } });
    const { res } = await run(activityCtrl.unblockParticipant, { params: { examParticipantId: '1' }, body: { unlock_code: 'abc123' } });
    expect(res.json.mock.calls[0][0].data.is_blocked).toBe(false);
  });
});

// ═══ Activity Log Controller ═══════════════════════════════════════════════════

describe('activityLogController.getActivityLogs', () => {
  test('WB-AL-C1: invalid user_id → 400', async () => {
    const { next } = await run(logCtrl.getActivityLogs, { query: { user_id: 'abc' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AL-C2: invalid start_date → 400', async () => {
    const { next } = await run(logCtrl.getActivityLogs, { query: { start_date: 'not-a-date' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AL-C3: valid filters → returns logs + count', async () => {
    prisma.activityLog.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { res } = await run(logCtrl.getActivityLogs, { query: { activity_type: 'LOGIN' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 2 }));
  });
});

describe('activityLogController.getLogsByUser', () => {
  test('WB-AL-C4: invalid userId → 400', async () => {
    const { next } = await run(logCtrl.getLogsByUser, { params: { userId: 'x' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-AL-C5: valid → returns logs', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    const { res } = await run(logCtrl.getLogsByUser, { params: { userId: '5' }, query: {} });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user_id: 5, count: 1 }));
  });
});

describe('activityLogController.getActiveUsers', () => {
  test('WB-AL-C6: formats raw rows (BigInt + is_active coercion)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { user_id: 7n ?? 7, username: 'admin', full_name: 'Admin', role: 'admin', is_active: 1, last_login: 'd', ip_address: '1.1.1.1', user_agent: 'UA' },
    ]);
    const { res } = await run(logCtrl.getActiveUsers, { query: { hours: '24' } });
    const payload = res.json.mock.calls[0][0];
    expect(payload.total_active).toBe(1);
    expect(payload.users[0].user_id).toBe(7);
    expect(payload.users[0].is_active).toBe(true);
  });
});
