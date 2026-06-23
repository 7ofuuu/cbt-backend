const multer = require('multer');
const { AppError } = require('../utils/asyncHandler');

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // sebagian browser mengirim ini utk .xlsx
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = file.originalname.toLowerCase().endsWith('.xlsx');
    if (okExt && XLSX_MIMES.has(file.mimetype)) return cb(null, true);
    if (okExt) return cb(null, true); // andalkan ekstensi jika mime tak pasti
    cb(new AppError('File harus berformat .xlsx', 400));
  },
});

const uploadSpreadsheet = upload.single('file');

module.exports = { uploadSpreadsheet };
