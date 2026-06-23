const ExcelJS = require('exceljs');
const { applyHeaderRowStyle, applyTitleStyle, setColumnWidths, THIN_BORDER } = require('./excelStyles');

const STATUS_LABELS = {
  NOT_STARTED: 'Belum Mengerjakan',
  IN_PROGRESS: 'Sedang Mengerjakan',
  COMPLETED: 'Belum Dinilai',
  GRADED: 'Selesai',
};

const TABLE_HEADERS = ['No', 'Nama Siswa', 'NISN', 'Kelas', 'Nilai Akhir', 'Status', 'Tanggal Selesai'];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID') : '-');

const buildExamScoreWorkbook = async ({ exam, participants }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Nilai');

  // Judul
  applyTitleStyle(ws.getCell('A1'));
  ws.getCell('A1').value = `Rekap Nilai - ${exam.exam_name}`;
  ws.getCell('A2').value = `Mata Pelajaran: ${exam.subject}`;
  ws.getCell('A3').value = `Kelas: ${exam.grade_level} ${exam.major || ''}`.trim();
  ws.getCell('A4').value = `Dibuat: ${new Date().toLocaleString('id-ID')}`;

  // Statistik
  const scored = participants.filter((p) => p.final_score != null).map((p) => p.final_score);
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : 0;
  const max = scored.length ? Math.max(...scored) : 0;
  const min = scored.length ? Math.min(...scored) : 0;
  ws.getCell('A6').value = `Total Peserta: ${participants.length}`;
  ws.getCell('A7').value = `Sudah Selesai (Dinilai): ${participants.filter((p) => p.exam_status === 'GRADED').length}`;
  ws.getCell('A8').value = `Rata-rata: ${avg}  |  Tertinggi: ${max}  |  Terendah: ${min}`;

  // Header tabel
  const headerRowIndex = 10;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.values = TABLE_HEADERS;
  applyHeaderRowStyle(headerRow);

  // Baris data
  const sorted = [...participants].sort(
    (a, b) => (a.classroom || '').localeCompare(b.classroom || '') || (a.full_name || '').localeCompare(b.full_name || '')
  );
  sorted.forEach((p, i) => {
    const row = ws.getRow(headerRowIndex + 1 + i);
    row.values = [
      i + 1,
      p.full_name || '-',
      p.nisn || '-',
      p.classroom || '-',
      p.final_score != null ? p.final_score : '',
      STATUS_LABELS[p.exam_status] || p.exam_status || '-',
      fmtDate(p.submit_date),
    ];
    row.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  setColumnWidths(ws, [6, 28, 16, 16, 12, 20, 18]);
  ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  return wb;
};

const buildExportFilename = (examName, date = new Date()) => {
  const safe = String(examName || 'ujian').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `Nilai_${safe}_${ymd}.xlsx`;
};

module.exports = { buildExamScoreWorkbook, buildExportFilename, STATUS_LABELS, TABLE_HEADERS };
