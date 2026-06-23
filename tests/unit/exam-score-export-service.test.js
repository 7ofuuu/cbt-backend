/**
 * White Box Test: Exam Score Export Service
 * Target: src/services/excel/examScoreExportService.js
 */
const ExcelJS = require('exceljs');
const {
  buildExamScoreWorkbook,
  buildExportFilename,
  STATUS_LABELS,
} = require('../../src/services/excel/examScoreExportService');

const exam = { exam_name: 'UAS Matematika', subject: 'Matematika', grade_level: 'XII', major: 'IPA' };
const participants = [
  { full_name: 'Budi', nisn: '111', classroom: 'XII-IPA-1', final_score: 90, exam_status: 'GRADED', submit_date: new Date('2026-06-01T08:00:00Z') },
  { full_name: 'Ani', nisn: '222', classroom: 'XII-IPA-1', final_score: null, exam_status: 'NOT_STARTED', submit_date: null },
];

const readBack = async (wb) => {
  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded.worksheets[0];
};

describe('buildExamScoreWorkbook', () => {
  test('EXP-01: ada header tabel yang diharapkan', async () => {
    const ws = await readBack(await buildExamScoreWorkbook({ exam, participants }));
    const flat = ws.getSheetValues().flat().filter(Boolean).map(String);
    ['No', 'Nama Siswa', 'NISN', 'Kelas', 'Nilai Akhir', 'Status', 'Tanggal Selesai']
      .forEach((h) => expect(flat).toContain(h));
  });

  test('EXP-02: tiap peserta jadi satu baris data', async () => {
    const ws = await readBack(await buildExamScoreWorkbook({ exam, participants }));
    const flat = ws.getSheetValues().flat().filter(Boolean).map(String);
    expect(flat).toContain('Budi');
    expect(flat).toContain('Ani');
  });

  test('EXP-03: status dipetakan ke label Indonesia', async () => {
    const ws = await readBack(await buildExamScoreWorkbook({ exam, participants }));
    const flat = ws.getSheetValues().flat().filter(Boolean).map(String);
    expect(flat).toContain(STATUS_LABELS.GRADED);
    expect(flat).toContain(STATUS_LABELS.NOT_STARTED);
  });

  test('EXP-04: nilai kosong saat final_score null', async () => {
    const ws = await readBack(await buildExamScoreWorkbook({ exam, participants }));
    const flat = ws.getSheetValues().flat().filter(Boolean).map(String);
    // 90 ada, tapi tidak ada teks "null"
    expect(flat).toContain('90');
    expect(flat).not.toContain('null');
  });
});

describe('buildExportFilename', () => {
  test('EXP-05: sanitasi nama + tanggal', () => {
    const name = buildExportFilename('UAS / Matematika', new Date('2026-06-24T00:00:00Z'));
    expect(name).toMatch(/^Nilai_UAS_Matematika_\d{8}\.xlsx$/);
    expect(name).not.toContain('/');
  });
});
