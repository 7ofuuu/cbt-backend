/**
 * Black Box Test: Analytics Endpoints
 * BB-5 — SB-71 & SB-72
 * Endpoints: /api/analytics/*
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('supertest'),
}));
jest.mock('../../src/services/analyticsService', () => ({
  getDashboardSummary: jest.fn(),
  getTeacherPerformanceOverview: jest.fn(),
  getAdminAuditOverview: jest.fn(),
  getQuestionStatistics: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const analyticsService = require('../../src/services/analyticsService');
const { teacherToken, adminToken } = require('../helpers/jwtHelper');

const mockTeacherDbUser = { id: 2, role: 'teacher', is_active: true, is_super_admin: false };
const mockAdminDbUser = { id: 1, role: 'admin', is_active: true, is_super_admin: false };
const mockTeacher = { teacher_id: 1, full_name: 'Guru', subject: 'Matematika', is_coordinator: false, user_id: 2 };
const mockCoordinator = { teacher_id: 2, full_name: 'Koordinator', subject: 'IPA', is_coordinator: true, user_id: 3 };

// ─── GET /api/analytics/dashboard-summary ────────────────────────────────────

describe('GET /api/analytics/dashboard-summary', () => {
  test('BB-AN1: no auth → 401', async () => {
    const res = await request(app).get('/api/analytics/dashboard-summary');
    expect(res.status).toBe(401);
  });

  test('BB-AN2: admin token (wrong role) → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockAdminDbUser);
    const res = await request(app)
      .get('/api/analytics/dashboard-summary')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  test('BB-AN3: teacher token → 200 with summary data', async () => {
    prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    analyticsService.getDashboardSummary.mockResolvedValue({
      question_counts: { SINGLE_CHOICE: 10, MULTIPLE_CHOICE: 5, ESSAY: 3 },
      exam_count: 4,
      bank_count: 2,
      recent_exam_performance: null,
    });
    const res = await request(app)
      .get('/api/analytics/dashboard-summary')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('question_counts');
  });
});

// ─── GET /api/analytics/teacher-performance ──────────────────────────────────

describe('GET /api/analytics/teacher-performance', () => {
  test('BB-AN4: teacher → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    analyticsService.getTeacherPerformanceOverview.mockResolvedValue({
      trend: [], score_distribution: [], student_watchlist: [], question_alerts: [],
      summary: { completion_rate: 90, pass_rate: 75 },
    });
    const res = await request(app)
      .get('/api/analytics/teacher-performance')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });

  test('BB-AN5: with ?days=30 filter → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    analyticsService.getTeacherPerformanceOverview.mockResolvedValue({
      trend: [], score_distribution: [], student_watchlist: [], question_alerts: [],
      summary: {},
    });
    const res = await request(app)
      .get('/api/analytics/teacher-performance?days=30')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/analytics/coordinator-audit ────────────────────────────────────

describe('GET /api/analytics/coordinator-audit', () => {
  test('BB-AN6: regular teacher → 403 (coordinator only)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher); // is_coordinator: false
    const res = await request(app)
      .get('/api/analytics/coordinator-audit')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  test('BB-AN7: coordinator → 200', async () => {
    // Use a coordinator teacher token (same JWT structure, role=teacher)
    prisma.user.findUnique.mockResolvedValue({ id: 3, role: 'teacher', is_active: true, is_super_admin: false });
    prisma.teacher.findUnique.mockResolvedValue(mockCoordinator); // is_coordinator: true
    analyticsService.getAdminAuditOverview.mockResolvedValue({
      all_exams: [], teacher_performance: [], student_risks: [], candlestick_trend: [],
    });
    const res = await request(app)
      .get('/api/analytics/coordinator-audit')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/analytics/question-stats ───────────────────────────────────────

describe('GET /api/analytics/question-stats', () => {
  test('BB-AN8: teacher → 200 with stats', async () => {
    prisma.user.findUnique.mockResolvedValue(mockTeacherDbUser);
    prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
    analyticsService.getQuestionStatistics.mockResolvedValue({
      data: [], pagination: { total: 0, page: 1, limit: 10 }, filters_applied: {},
    });
    const res = await request(app)
      .get('/api/analytics/question-stats')
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
  });
});
