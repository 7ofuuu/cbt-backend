/**
 * Black Box Test: Import User via .xlsx
 * Endpoints: POST /api/users/import, GET /api/users/import/template
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  logFromRequest: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('supertest'),
}));
jest.mock('../../src/services/userService', () => {
  const actual = jest.requireActual('../../src/services/userService');
  return { ...actual, createUserWithProfile: jest.fn() };
});

const ExcelJS = require('exceljs');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/db');
const { createUserWithProfile } = require('../../src/services/userService');
const { adminToken } = require('../helpers/jwtHelper');

const adminDbUser = { id: 1, role: 'admin', is_active: true, is_super_admin: false };

const makeXlsx = async (headers, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(adminDbUser);
  prisma.subject.findMany.mockResolvedValue([]);
  prisma.gradeLevel.findMany.mockResolvedValue([]);
  prisma.major.findMany.mockResolvedValue([]);
});

test('IMP-BB-01: import sukses -> success count', async () => {
  createUserWithProfile.mockImplementation(async (u) => ({ id: 9, username: u.username }));
  const buf = await makeXlsx(['full_name', 'username', 'password'], [['Admin A', 'admina', 'secret1']]);
  const res = await request(app)
    .post('/api/users/import')
    .set('Authorization', `Bearer ${adminToken()}`)
    .field('role', 'admin')
    .attach('file', buf, 'data.xlsx');
  expect(res.status).toBe(201);
  expect(res.body.success).toBe(1);
});

test('IMP-BB-02: tanpa file -> 400', async () => {
  const res = await request(app)
    .post('/api/users/import')
    .set('Authorization', `Bearer ${adminToken()}`)
    .field('role', 'admin');
  expect(res.status).toBe(400);
});

test('IMP-BB-03: template -> 200 + content-type spreadsheet', async () => {
  const res = await request(app)
    .get('/api/users/import/template?role=student')
    .set('Authorization', `Bearer ${adminToken()}`)
    .buffer(true)
    .parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('spreadsheetml');
});
