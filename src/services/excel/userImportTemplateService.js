const ExcelJS = require('exceljs');
const { IMPORT_COLUMNS } = require('./userImportParser');
const { applyHeaderRowStyle, setColumnWidths } = require('./excelStyles');

const EXAMPLES = {
  student: [
    ['Contoh Siswa 1', 'siswa001', 'password123', 'X-IPA-1', 'X', 'IPA', '0012345678'],
    ['Contoh Siswa 2', 'siswa002', 'password123', 'XI-IPS-2', 'XI', 'IPS', ''],
  ],
  teacher: [
    ['Contoh Guru 1', 'guru001', 'password123', 'Matematika', 'false', '100000000000000001'],
    ['Contoh Guru 2', 'guru002', 'password123', 'Fisika', 'true', '100000000000000002'],
  ],
  admin: [
    ['Contoh Admin 1', 'admin001', 'password123'],
    ['Contoh Admin 2', 'admin002', 'password123'],
  ],
};

const buildImportTemplate = async (role) => {
  const columns = IMPORT_COLUMNS[role];
  if (!columns) throw new Error('role tidak valid');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Template');

  const headerRow = ws.getRow(1);
  headerRow.values = columns;
  applyHeaderRowStyle(headerRow);

  (EXAMPLES[role] || []).forEach((ex, i) => { ws.getRow(2 + i).values = ex; });

  setColumnWidths(ws, columns.map(() => 20));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
};

module.exports = { buildImportTemplate };
