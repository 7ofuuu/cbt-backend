const jwt = require('jsonwebtoken');
const { verifyToken, checkRole } = require('../../../src/middlewares/authMiddleware');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('verifyToken', () => {
    it('should reject request without token', () => {
      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token tidak ditemukan'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      req.headers.authorization = 'InvalidToken';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token tidak ditemukan'
      });
    });

    it('should reject request with invalid token', () => {
      req.headers.authorization = 'Bearer invalid_token';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token tidak valid atau expired'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', () => {
      const token = jwt.sign(
        { userId: 1, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(1);
      expect(req.user.role).toBe('admin');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject expired token', () => {
      const token = jwt.sign(
        { userId: 1, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token tidak valid atau expired'
      });
    });
  });

  describe('checkRole', () => {
    it('should reject if user not authenticated', () => {
      const middleware = checkRole('admin');
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject if user role not allowed', () => {
      req.user = { userId: 1, role: 'siswa' };
      const middleware = checkRole('admin', 'guru');

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Akses ditolak. Role tidak sesuai'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow if user role is allowed (single role)', () => {
      req.user = { userId: 1, role: 'admin' };
      const middleware = checkRole('admin');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow if user role is allowed (multiple roles)', () => {
      req.user = { userId: 2, role: 'guru' };
      const middleware = checkRole('admin', 'guru');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should work for siswa role', () => {
      req.user = { userId: 3, role: 'siswa' };
      const middleware = checkRole('siswa');

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow all three roles when specified', () => {
      const middleware = checkRole('admin', 'guru', 'siswa');

      // Test admin
      req.user = { userId: 1, role: 'admin' };
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // Test guru
      next.mockClear();
      req.user = { userId: 2, role: 'guru' };
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // Test siswa
      next.mockClear();
      req.user = { userId: 3, role: 'siswa' };
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
