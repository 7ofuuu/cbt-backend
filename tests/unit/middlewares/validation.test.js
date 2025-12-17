const { validateRegister } = require('../../../src/middlewares/validationMiddleware');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('validateRegister', () => {
    it('should pass validation with valid admin data', () => {
      req.body = {
        username: 'admin123',
        password: 'password123',
        role: 'admin',
        nama: 'Admin Test'
      };

      validateRegister(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should pass validation with valid guru data', () => {
      req.body = {
        username: 'guru123',
        password: 'password123',
        role: 'guru',
        nama: 'Guru Test'
      };

      validateRegister(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should pass validation with valid siswa data', () => {
      req.body = {
        username: 'siswa123',
        password: 'password123',
        role: 'siswa',
        nama: 'Siswa Test',
        kelas: '10A',
        tingkat: '10',
        jurusan: 'IPA'
      };

      validateRegister(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject if username is missing', () => {
      req.body = {
        password: 'password123',
        role: 'admin',
        nama: 'Test'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('username')
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject if username is too short', () => {
      req.body = {
        username: 'abc', // Only 3 characters
        password: 'password123',
        role: 'admin',
        nama: 'Test'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('username')
      });
    });

    it('should reject if password is too short', () => {
      req.body = {
        username: 'admin123',
        password: '12345', // Only 5 characters
        role: 'admin',
        nama: 'Test'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('password')
      });
    });

    it('should reject if role is invalid', () => {
      req.body = {
        username: 'test123',
        password: 'password123',
        role: 'invalid_role',
        nama: 'Test'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('role')
      });
    });

    it('should reject if nama is missing', () => {
      req.body = {
        username: 'test123',
        password: 'password123',
        role: 'admin'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('nama')
      });
    });

    it('should reject siswa without kelas', () => {
      req.body = {
        username: 'siswa123',
        password: 'password123',
        role: 'siswa',
        nama: 'Siswa Test',
        tingkat: '10',
        jurusan: 'IPA'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('kelas')
      });
    });

    it('should reject siswa without tingkat', () => {
      req.body = {
        username: 'siswa123',
        password: 'password123',
        role: 'siswa',
        nama: 'Siswa Test',
        kelas: '10A',
        jurusan: 'IPA'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('tingkat')
      });
    });

    it('should reject siswa without jurusan', () => {
      req.body = {
        username: 'siswa123',
        password: 'password123',
        role: 'siswa',
        nama: 'Siswa Test',
        kelas: '10A',
        tingkat: '10'
      };

      validateRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('jurusan')
      });
    });

    it('should allow admin/guru without kelas, tingkat, jurusan', () => {
      req.body = {
        username: 'admin123',
        password: 'password123',
        role: 'admin',
        nama: 'Admin Test'
        // No kelas, tingkat, jurusan
      };

      validateRegister(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
