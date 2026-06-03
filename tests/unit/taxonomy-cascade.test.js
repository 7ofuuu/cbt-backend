/**
 * White Box Test: Taxonomy Cascade Rename Service
 * WB-11
 * Target: src/services/taxonomyCascadeService.js (cascadeRename)
 */
jest.mock('../../src/config/db');

const prisma = require('../../src/config/db');
const { cascadeRename } = require('../../src/services/taxonomyCascadeService');

describe('cascadeRename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops) => Promise.all(ops));
  });

  test('WB-TC-01: oldValue falsy → no-op returns {}', async () => {
    expect(await cascadeRename({ field: 'subject', oldValue: '', newValue: 'X', targets: [{ model: 'exam', key: 'exam' }] })).toEqual({});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('WB-TC-02: newValue falsy → no-op returns {}', async () => {
    expect(await cascadeRename({ field: 'subject', oldValue: 'A', newValue: '', targets: [{ model: 'exam', key: 'exam' }] })).toEqual({});
  });

  test('WB-TC-03: oldValue === newValue → no-op returns {}', async () => {
    expect(await cascadeRename({ field: 'subject', oldValue: 'A', newValue: 'A', targets: [{ model: 'exam', key: 'exam' }] })).toEqual({});
  });

  test('WB-TC-04: empty/invalid targets → no-op returns {}', async () => {
    expect(await cascadeRename({ field: 'subject', oldValue: 'A', newValue: 'B', targets: [] })).toEqual({});
    expect(await cascadeRename({ field: 'subject', oldValue: 'A', newValue: 'B', targets: null })).toEqual({});
  });

  test('WB-TC-05: issues updateMany per target with old→new mapping', async () => {
    prisma.exam.updateMany.mockResolvedValue({ count: 2 });
    prisma.questionBank.updateMany.mockResolvedValue({ count: 5 });
    await cascadeRename({
      field: 'subject',
      oldValue: 'Matematika',
      newValue: 'Math',
      targets: [{ model: 'exam', key: 'exams' }, { model: 'questionBank', key: 'banks' }],
    });
    expect(prisma.exam.updateMany).toHaveBeenCalledWith({ where: { subject: 'Matematika' }, data: { subject: 'Math' } });
    expect(prisma.questionBank.updateMany).toHaveBeenCalledWith({ where: { subject: 'Matematika' }, data: { subject: 'Math' } });
  });

  test('WB-TC-06: returns per-key count map from results', async () => {
    prisma.exam.updateMany.mockResolvedValue({ count: 2 });
    prisma.questionBank.updateMany.mockResolvedValue({ count: 5 });
    const result = await cascadeRename({
      field: 'subject',
      oldValue: 'Matematika',
      newValue: 'Math',
      targets: [{ model: 'exam', key: 'exams' }, { model: 'questionBank', key: 'banks' }],
    });
    expect(result).toEqual({ exams: 2, banks: 5 });
  });

  test('WB-TC-07: runs updates inside a single $transaction', async () => {
    prisma.exam.updateMany.mockResolvedValue({ count: 1 });
    await cascadeRename({ field: 'subject', oldValue: 'A', newValue: 'B', targets: [{ model: 'exam', key: 'e' }] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
