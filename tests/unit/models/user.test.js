const { prisma } = require('../../setup/testDb');
const { createAdmin, createGuru, createSiswa } = require('../../setup/testHelpers');

describe('User Model Relations', () => {
  describe('User-Admin Relationship (One-to-One)', () => {
    it('should create user with admin profile', async () => {
      const { user } = await createAdmin({
        username: 'admin1',
        nama_lengkap: 'Admin Test'
      });

      expect(user).toBeDefined();
      expect(user.role).toBe('admin');
      expect(user.admin).toBeDefined();
      expect(user.admin.nama_lengkap).toBe('Admin Test');
    });

    it('should cascade delete admin when user is deleted', async () => {
      const { user } = await createAdmin();
      const adminId = user.admin.admin_id;

      await prisma.user.delete({ where: { id: user.id } });

      const deletedAdmin = await prisma.admin.findUnique({
        where: { admin_id: adminId }
      });
      expect(deletedAdmin).toBeNull();
    });

    it('should enforce one-to-one constraint (unique userId)', async () => {
      const { user } = await createAdmin();

      await expect(
        prisma.admin.create({
          data: {
            nama_lengkap: 'Another Admin',
            userId: user.id // duplicate userId
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('User-Guru Relationship (One-to-One)', () => {
    it('should create user with guru profile', async () => {
      const { user } = await createGuru({
        username: 'guru1',
        nama_lengkap: 'Guru Test'
      });

      expect(user).toBeDefined();
      expect(user.role).toBe('guru');
      expect(user.guru).toBeDefined();
      expect(user.guru.nama_lengkap).toBe('Guru Test');
    });

    it('should cascade delete guru when user is deleted', async () => {
      const { user } = await createGuru();
      const guruId = user.guru.guru_id;

      await prisma.user.delete({ where: { id: user.id } });

      const deletedGuru = await prisma.guru.findUnique({
        where: { guru_id: guruId }
      });
      expect(deletedGuru).toBeNull();
    });
  });

  describe('User-Siswa Relationship (One-to-One)', () => {
    it('should create user with siswa profile', async () => {
      const { user } = await createSiswa({
        username: 'siswa1',
        nama_lengkap: 'Siswa Test',
        kelas: '10A',
        tingkat: '10',
        jurusan: 'IPA'
      });

      expect(user).toBeDefined();
      expect(user.role).toBe('siswa');
      expect(user.siswa).toBeDefined();
      expect(user.siswa.kelas).toBe('10A');
      expect(user.siswa.tingkat).toBe('10');
      expect(user.siswa.jurusan).toBe('IPA');
    });

    it('should cascade delete siswa when user is deleted', async () => {
      const { user } = await createSiswa();
      const siswaId = user.siswa.siswa_id;

      await prisma.user.delete({ where: { id: user.id } });

      const deletedSiswa = await prisma.siswa.findUnique({
        where: { siswa_id: siswaId }
      });
      expect(deletedSiswa).toBeNull();
    });
  });

  describe('User Status Management', () => {
    it('should create user with active status by default', async () => {
      const { user } = await createAdmin();
      expect(user.status_aktif).toBe(true);
    });

    it('should allow creating inactive user', async () => {
      const { user } = await createAdmin({ status_aktif: false });
      expect(user.status_aktif).toBe(false);
    });

    it('should update user status', async () => {
      const { user } = await createAdmin();

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { status_aktif: false }
      });

      expect(updated.status_aktif).toBe(false);
    });
  });

  describe('Username Uniqueness', () => {
    it('should enforce unique username constraint', async () => {
      await createAdmin({ username: 'duplicate_user' });

      await expect(
        createAdmin({ username: 'duplicate_user' })
      ).rejects.toThrow();
    });
  });
});
