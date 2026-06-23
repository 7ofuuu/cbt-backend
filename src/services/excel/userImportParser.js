const ExcelJS = require('exceljs');

const IMPORT_COLUMNS = {
  student: ['full_name', 'username', 'password', 'classroom', 'grade_level', 'major', 'nisn'],
  teacher: ['full_name', 'username', 'password', 'subject', 'is_coordinator', 'nip'],
  admin: ['full_name', 'username', 'password'],
};

const cellText = (cell) => {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim();
  return String(v).trim();
};

// Parse sheet pertama; baris 1 = header. Map tiap baris jadi objek {header: value}.
const parseUserSheet = async (buffer, role) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell((cell, col) => { headers[col] = cellText(cell); });
  if (headers.filter(Boolean).length === 0) return [];

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let hasValue = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const val = cellText(row.getCell(col));
      obj[h] = val;
      if (val) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
};

module.exports = { parseUserSheet, IMPORT_COLUMNS };
