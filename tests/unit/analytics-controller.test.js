/**
 * White Box Test: Analytics Controller
 * WB-23
 * Target: src/controllers/analyticsController.js
 *   getQuestionStats, getDashboardStats, getTeacherPerformanceOverviewHandler,
 *   getCoordinatorAuditOverviewHandler
 */
jest.mock('../../src/services/analyticsService', () => ({
  getQuestionStatistics: jest.fn(),
  getDashboardSummary: jest.fn(),
  getTeacherPerformanceOverview: jest.fn(),
  getAdminAuditOverview: jest.fn(),
}));

const svc = require('../../src/services/analyticsService');
const ctrl = require('../../src/controllers/analyticsController');

const teacher = { teacher_id: 1, subject: 'IPA', is_coordinator: false };
const coord = { teacher_id: 2, subject: 'IPA', is_coordinator: true };

const makeReqRes = (overrides = {}) => {
  const req = { body: {}, params: {}, query: {}, teacher, ...overrides };
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

// ─── getQuestionStats ─────────────────────────────────────────────────────────

describe('getQuestionStats', () => {
  test('WB-ANC-01: invalid question_type → 400', async () => {
    const { next } = await run(ctrl.getQuestionStats, { query: { question_type: 'FOO' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ANC-02: invalid sort_by → 400', async () => {
    const { next } = await run(ctrl.getQuestionStats, { query: { sort_by: 'banana' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ANC-03: invalid order → 400', async () => {
    const { next } = await run(ctrl.getQuestionStats, { query: { order: 'sideways' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-ANC-04: valid → delegates to service, returns result', async () => {
    svc.getQuestionStatistics.mockResolvedValue({ data: [], pagination: {} });
    const { res } = await run(ctrl.getQuestionStats, { query: { question_type: 'ESSAY', sort_by: 'correct_rate', order: 'asc' } });
    expect(svc.getQuestionStatistics).toHaveBeenCalledWith(
      expect.objectContaining({ question_type: 'ESSAY' }),
      teacher,
      expect.objectContaining({ page: 1 })
    );
    expect(res.json).toHaveBeenCalledWith({ data: [], pagination: {} });
  });
});

// ─── getDashboardStats ────────────────────────────────────────────────────────

describe('getDashboardStats', () => {
  test('WB-ANC-05: returns summary from service', async () => {
    svc.getDashboardSummary.mockResolvedValue({ questions: { total: 5 } });
    const { res } = await run(ctrl.getDashboardStats);
    expect(res.json).toHaveBeenCalledWith({ questions: { total: 5 } });
  });

  test('WB-ANC-06: propagates service error to next', async () => {
    const { AppError } = require('../../src/utils/asyncHandler');
    svc.getDashboardSummary.mockRejectedValue(new AppError('no subject', 400));
    const { next } = await run(ctrl.getDashboardStats);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── getTeacherPerformanceOverviewHandler ─────────────────────────────────────

describe('getTeacherPerformanceOverviewHandler', () => {
  test('WB-ANC-07: passes query params through to service', async () => {
    svc.getTeacherPerformanceOverview.mockResolvedValue({ meta: {} });
    await run(ctrl.getTeacherPerformanceOverviewHandler, { query: { days: '30', subject: 'IPA', exam_id: '1' } });
    expect(svc.getTeacherPerformanceOverview).toHaveBeenCalledWith(teacher, { days: '30', subject: 'IPA', exam_id: '1' });
  });
});

// ─── getCoordinatorAuditOverviewHandler ───────────────────────────────────────

describe('getCoordinatorAuditOverviewHandler', () => {
  test('WB-ANC-08: non-coordinator → 403', async () => {
    const { next } = await run(ctrl.getCoordinatorAuditOverviewHandler, { teacher });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(svc.getAdminAuditOverview).not.toHaveBeenCalled();
  });

  test('WB-ANC-09: coordinator → delegates to admin audit overview', async () => {
    svc.getAdminAuditOverview.mockResolvedValue({ summary: {} });
    const { res } = await run(ctrl.getCoordinatorAuditOverviewHandler, { teacher: coord, query: { days: '7', limit: '5' } });
    expect(svc.getAdminAuditOverview).toHaveBeenCalledWith({ days: '7', limit: '5' });
    expect(res.json).toHaveBeenCalledWith({ summary: {} });
  });
});
