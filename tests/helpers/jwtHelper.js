const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-sprint4-cbt';

const makeToken = (payload, options = {}) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '1d', algorithm: 'HS256', ...options });

const adminToken = () =>
  makeToken({ id: 1, role: 'admin', is_super_admin: false });

const superAdminToken = () =>
  makeToken({ id: 1, role: 'admin', is_super_admin: true });

const teacherToken = () =>
  makeToken({ id: 2, role: 'teacher', is_super_admin: false });

const studentToken = () =>
  makeToken({ id: 3, role: 'student', is_super_admin: false });

const expiredToken = () =>
  makeToken({ id: 1, role: 'admin', is_super_admin: false }, { expiresIn: '-1s' });

module.exports = { makeToken, adminToken, superAdminToken, teacherToken, studentToken, expiredToken };
