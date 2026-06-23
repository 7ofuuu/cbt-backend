// Style konstanta + helper bersama untuk semua file Excel (export nilai, template import).
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

const applyHeaderRowStyle = (row) => {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
};

const applyTitleStyle = (cell) => {
  cell.font = { bold: true, size: 14 };
};

const setColumnWidths = (worksheet, widths) => {
  widths.forEach((w, i) => {
    worksheet.getColumn(i + 1).width = w;
  });
};

module.exports = { HEADER_FILL, HEADER_FONT, THIN_BORDER, applyHeaderRowStyle, applyTitleStyle, setColumnWidths };
