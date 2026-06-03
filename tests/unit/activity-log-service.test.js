/**
 * White Box Test: Activity Log Service
 * WB-14
 * Target: src/services/activityLogService.js
 *   createLog, getLogsByUser, getLogsByExamParticipant, getLogsByType,
 *   getAllLogs, getIpAddress, getUserAgent, logFromRequest
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const svc = require('../../src/services/activityLogService');

let consoleSpy;
beforeEach(() => {
  jest.clearAllMocks();
  consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleSpy.mockRestore());

// ─── createLog ────────────────────────────────────────────────────────────────

describe('createLog', () => {
  test('WB-AL-01: issues an INSERT via $executeRaw', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await svc.createLog({ user_id: 1, activity_type: 'LOGIN', description: 'masuk' });
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  test('WB-AL-02: DB error is swallowed (does not throw) to protect main flow', async () => {
    prisma.$executeRaw.mockRejectedValue(new Error('insert failed'));
    await expect(
      svc.createLog({ user_id: 1, activity_type: 'LOGIN', description: 'masuk' })
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ─── getLogsByUser / ByExamParticipant / ByType ──────────────────────────────

describe('query helpers (raw SQL)', () => {
  test('WB-AL-03: getLogsByUser returns rows from $queryRaw', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }]);
    expect(await svc.getLogsByUser(1)).toEqual([{ id: 1 }]);
  });

  test('WB-AL-04: getLogsByUser error → returns [] (graceful)', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('fail'));
    expect(await svc.getLogsByUser(1)).toEqual([]);
  });

  test('WB-AL-05: getLogsByExamParticipant returns rows', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 2 }]);
    expect(await svc.getLogsByExamParticipant(5)).toEqual([{ id: 2 }]);
  });

  test('WB-AL-06: getLogsByType error → returns []', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('fail'));
    expect(await svc.getLogsByType('LOGIN')).toEqual([]);
  });
});

// ─── getAllLogs (filter building) ─────────────────────────────────────────────

describe('getAllLogs', () => {
  test('WB-AL-07: no filters → empty where, default take 100', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);
    await svc.getAllLogs();
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 100 })
    );
  });

  test('WB-AL-08: user_id + activity_type filters applied', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);
    await svc.getAllLogs({ user_id: 3, activity_type: 'LOGIN' });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 3, activity_type: 'LOGIN' } })
    );
  });

  test('WB-AL-09: date range builds created_at gte/lte', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);
    await svc.getAllLogs({ start_date: 'S', end_date: 'E' });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { created_at: { gte: 'S', lte: 'E' } } })
    );
  });

  test('WB-AL-10: custom limit overrides default take', async () => {
    prisma.activityLog.findMany.mockResolvedValue([]);
    await svc.getAllLogs({ limit: 5 });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });

  test('WB-AL-11: DB error → returns []', async () => {
    prisma.activityLog.findMany.mockRejectedValue(new Error('fail'));
    expect(await svc.getAllLogs()).toEqual([]);
  });
});

// ─── getIpAddress / getUserAgent ──────────────────────────────────────────────

describe('request extractors', () => {
  test('WB-AL-12: getIpAddress prefers x-forwarded-for', () => {
    expect(svc.getIpAddress({ headers: { 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' } })).toBe('1.1.1.1');
  });

  test('WB-AL-13: getIpAddress falls back to socket.remoteAddress', () => {
    expect(svc.getIpAddress({ headers: {}, socket: { remoteAddress: '9.9.9.9' } })).toBe('9.9.9.9');
  });

  test('WB-AL-14: getIpAddress → null when nothing available', () => {
    expect(svc.getIpAddress({ headers: {} })).toBeNull();
  });

  test('WB-AL-15: getUserAgent reads header, null when absent', () => {
    expect(svc.getUserAgent({ headers: { 'user-agent': 'jest' } })).toBe('jest');
    expect(svc.getUserAgent({ headers: {} })).toBeNull();
  });
});

// ─── logFromRequest ───────────────────────────────────────────────────────────

describe('logFromRequest', () => {
  test('WB-AL-16: fills user_id/ip/user_agent from req and forwards to createLog', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    const req = { user: { id: 8 }, headers: { 'x-forwarded-for': '5.5.5.5', 'user-agent': 'UA' } };
    await svc.logFromRequest(req, 'CREATE_UJIAN', 'buat ujian', { exam_participant_id: 2 });
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  test('WB-AL-17: missing req.user → still logs without throwing', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await expect(
      svc.logFromRequest({ headers: {} }, 'LOGOUT', 'keluar')
    ).resolves.not.toThrow();
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
