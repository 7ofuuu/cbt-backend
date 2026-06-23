/**
 * White Box Test: userImportParser
 * Target: src/services/excel/userImportParser.js
 */
const ExcelJS = require('exceljs');
const { parseUserSheet, IMPORT_COLUMNS } = require('../../src/services/excel/userImportParser');

const makeBuffer = async (headers, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
};

test('IMP-01: parse baris jadi objek sesuai header', async () => {
  const headers = IMPORT_COLUMNS.admin; // ['full_name','username','password']
  const buf = await makeBuffer(headers, [['Admin A', 'admina', 'secret1']]);
  const rows = await parseUserSheet(buf, 'admin');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ full_name: 'Admin A', username: 'admina', password: 'secret1' });
});

test('IMP-02: baris kosong diabaikan', async () => {
  const headers = IMPORT_COLUMNS.admin;
  const buf = await makeBuffer(headers, [['Admin A', 'admina', 'secret1'], ['', '', '']]);
  const rows = await parseUserSheet(buf, 'admin');
  expect(rows).toHaveLength(1);
});

test('IMP-03: file tanpa data -> array kosong', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Data');
  const buf = await wb.xlsx.writeBuffer();
  const rows = await parseUserSheet(buf, 'admin');
  expect(rows).toHaveLength(0);
});
