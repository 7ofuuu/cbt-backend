/**
 * Black Box Test: Export Nilai Ujian
 * Endpoint: GET /api/exam-results/exam/:exam_id/export
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
const { teacherToken } = require('../helpers/jwtHelper');

const teacherDbUser = { id: 2, role: 'teacher', is_active: true, is_super_admin: false };
const coordProfile = { teacher_id: 1, full_name: 'Koor', subject: 'Matematika', is_coordinator: true, user_id: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(teacherDbUser);
  prisma.teacher.findUnique.mockResolvedValue(coordProfile);
});

test('EXP-BB-01: ujian tidak ada -> 404', async () => {
  prisma.exam.findUnique.mockResolvedValue(null);
  const res = await request(app)
    .get('/api/exam-results/exam/999/export')
    .set('Authorization', `Bearer ${teacherToken()}`);
  expect(res.status).toBe(404);
});

test('EXP-BB-02: guru biasa subject lain -> 403', async () => {
  prisma.teacher.findUnique.mockResolvedValue({ ...coordProfile, is_coordinator: false, subject: 'Fisika' });
  prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_name: 'UAS', subject: 'Matematika', grade_level: 'XII', major: 'IPA' });
  const res = await request(app)
    .get('/api/exam-results/exam/1/export')
    .set('Authorization', `Bearer ${teacherToken()}`);
  expect(res.status).toBe(403);
});

test('EXP-BB-03: sukses -> 200 + content-type spreadsheet', async () => {
  prisma.exam.findUnique.mockResolvedValue({ exam_id: 1, exam_name: 'UAS', subject: 'Matematika', grade_level: 'XII', major: 'IPA' });
  prisma.examParticipant.findMany.mockResolvedValue([
    {
      exam_status: 'GRADED',
      end_time: new Date(),
      student: { full_name: 'Budi', nisn: '111', classroom: 'XII-IPA-1' },
      exam_result: { final_score: 88, submit_date: new Date() },
    },
  ]);
  const res = await request(app)
    .get('/api/exam-results/exam/1/export')
    .set('Authorization', `Bearer ${teacherToken()}`)
    .buffer(true)
    .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('spreadsheetml');
  expect(res.headers['content-disposition']).toContain('attachment');
});
