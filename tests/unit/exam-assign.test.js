/**
 * White Box Test: Exam Student Assignment
 * WB-5 — SB-59
 * Target: src/controllers/examController.js → assignStudentToExam, reassignStudents
 */
jest.mock('../../src/config/db');
jest.mock('../../src/services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
  getIpAddress: jest.fn().mockReturnValue('127.0.0.1'),
  getUserAgent: jest.fn().mockReturnValue('jest'),
}));
jest.mock('../../src/services/examService');
jest.mock('../../src/services/subjectAccessService');
jest.mock('../../src/services/userService', () => ({
  buildPagination: jest.fn().mockReturnValue({ skip: 0, take: 20, page: 1, limit: 20 }),
  paginatedResponse: jest.fn(),
  formatUserData: jest.fn(),
  createUserWithProfile: jest.fn(),
  SALT_ROUNDS: 12,
}));

const prisma = require('../../src/config/db');
const examService = require('../../src/services/examService');
const subjectAccessService = require('../../src/services/subjectAccessService');
const { AppError } = require('../../src/utils/asyncHandler');

// Import the specific handlers after mocks
const { assignStudentToExam, reassignStudents } = require('../../src/controllers/examController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockTeacher = { teacher_id: 1, full_name: 'Guru Satu', subject: 'Matematika', is_coordinator: false };
const mockExam = { exam_id: 1, exam_name: 'Ujian Test', subject: 'Matematika', exam_status: 'SCHEDULED' };

const makeReqRes = (body = {}, user = { id: 2, role: 'teacher' }) => {
  const req = { body, user, teacher: mockTeacher, headers: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
};

const flush = () => new Promise(resolve => setImmediate(resolve));

const callHandler = async (handler, req, res, next) => {
  handler(req, res, next);
  await flush();
};

// ─── assignStudentToExam ──────────────────────────────────────────────────────

describe('assignStudentToExam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    examService.getExamOrFail.mockResolvedValue(mockExam);
    subjectAccessService.validateSubjectAccess.mockReturnValue(undefined); // no throw
  });

  test('WB-EA-01: missing exam_id → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ grade_level: '10' });
    await callHandler(assignStudentToExam, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EA-02: missing grade_level → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ exam_id: 1 });
    await callHandler(assignStudentToExam, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EA-03: getExamOrFail throws (exam not found) → error propagated', async () => {
    examService.getExamOrFail.mockRejectedValue(new AppError('Ujian tidak ditemukan', 404));
    const { req, res, next } = makeReqRes({ exam_id: 999, grade_level: '10' });
    await callHandler(assignStudentToExam, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EA-04: subject access denied → AppError 403 propagated', async () => {
    subjectAccessService.validateSubjectAccess.mockImplementation(() => {
      throw new AppError('Akses ditolak', 403);
    });
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '10' });
    await callHandler(assignStudentToExam, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('WB-EA-05: no students match criteria → AppError 404', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '11', major: 'IPS' });
    await callHandler(assignStudentToExam, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('WB-EA-06: students found → createMany called, returns assigned count', async () => {
    prisma.student.findMany.mockResolvedValue([{ student_id: 1 }, { student_id: 2 }]);
    prisma.examParticipant.createMany.mockResolvedValue({ count: 2 });
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '10' });
    await callHandler(assignStudentToExam, req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ students_added: 2 }));
    expect(prisma.examParticipant.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });
});

// ─── reassignStudents ─────────────────────────────────────────────────────────

describe('reassignStudents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    examService.getExamOrFail.mockResolvedValue(mockExam);
    examService.guardExamStatus.mockReturnValue(undefined); // no throw
    subjectAccessService.validateSubjectAccess.mockReturnValue(undefined);
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    prisma.examParticipant.deleteMany.mockResolvedValue({ count: 3 });
    prisma.student.findMany.mockResolvedValue([{ student_id: 10 }, { student_id: 11 }]);
    prisma.examParticipant.createMany.mockResolvedValue({ count: 2 });
  });

  test('WB-EA-07: missing exam_id → AppError 400', async () => {
    const { req, res, next } = makeReqRes({ grade_level: '10' });
    await callHandler(reassignStudents, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('WB-EA-08: guardExamStatus throws (exam ONGOING/ENDED) → error propagated', async () => {
    examService.guardExamStatus.mockImplementation(() => {
      throw new AppError('Exam sedang berlangsung', 409);
    });
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '10' });
    await callHandler(reassignStudents, req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('WB-EA-09: NOT_STARTED participants deleted, new students assigned', async () => {
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '10' });
    await callHandler(reassignStudents, req, res, next);

    // deleteMany called with NOT_STARTED filter only (IN_PROGRESS preserved)
    expect(prisma.examParticipant.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ exam_status: 'NOT_STARTED' }),
      })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ assigned: 2 }));
  });

  test('WB-EA-10: no new students after reassign → assigned = 0, removed = N', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    prisma.examParticipant.createMany.mockResolvedValue({ count: 0 });
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '12' });
    await callHandler(reassignStudents, req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ assigned: 0 }));
  });

  test('WB-EA-11: transaction is used for atomicity', async () => {
    const { req, res, next } = makeReqRes({ exam_id: 1, grade_level: '10' });
    await callHandler(reassignStudents, req, res, next);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
