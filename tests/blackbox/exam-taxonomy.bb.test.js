/**
 * Black Box Test: Validasi taksonomi saat create exam
 * Endpoint: POST /api/exams
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
const coord = { teacher_id: 1, full_name: 'Koor', subject: 'Matematika', is_coordinator: true, user_id: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(teacherDbUser);
  prisma.teacher.findUnique.mockResolvedValue(coord);
  prisma.subject.findMany.mockResolvedValue([{ name: 'Matematika' }]);
  prisma.gradeLevel.findMany.mockResolvedValue([{ value: 'X' }, { value: 'XI' }]);
  prisma.major.findMany.mockResolvedValue([{ value: 'IPA' }]);
});

const body = (over = {}) => ({
  exam_name: 'UTS', subject: 'Matematika', grade_level: 'X', major: 'IPA',
  start_date: '2026-07-01T08:00:00Z', end_date: '2026-07-01T10:00:00Z', duration_minutes: 90, ...over,
});

test('EXT-01: grade_level tak terdaftar -> 400', async () => {
  const res = await request(app).post('/api/exams')
    .set('Authorization', `Bearer ${teacherToken()}`)
    .send(body({ grade_level: 'ZZ' }));
  expect(res.status).toBe(400);
});

test('EXT-02: subject tak terdaftar (koordinator pilih subject asing) -> 400', async () => {
  const res = await request(app).post('/api/exams')
    .set('Authorization', `Bearer ${teacherToken()}`)
    .send(body({ subject: 'Astronomi' }));
  expect(res.status).toBe(400);
});

test('EXT-03: taksonomi valid -> 201', async () => {
  prisma.exam.create.mockResolvedValue({ exam_id: 1, exam_name: 'UTS', subject: 'Matematika', grade_level: 'X', major: 'IPA' });
  prisma.student.findMany.mockResolvedValue([]);
  prisma.examParticipant.createMany.mockResolvedValue({ count: 0 });
  const res = await request(app).post('/api/exams')
    .set('Authorization', `Bearer ${teacherToken()}`)
    .send(body());
  expect(res.status).toBe(201);
});
