const { prisma } = require('../../setup/testDb');
const {
  createGuru,
  createSiswa,
  createUjian,
  createSoal,
  assignSoalToUjian,
  assignSiswaToUjian,
  createJawaban
} = require('../../setup/testHelpers');

describe('Ujian Model Relations', () => {
  let guru, siswa;

  beforeEach(async () => {
    const guruResult = await createGuru();
    const siswaResult = await createSiswa();
    guru = guruResult.user;
    siswa = siswaResult.user;
  });

  describe('Guru-Ujian Relationship (One-to-Many)', () => {
    it('should create ujian with guru relationship', async () => {
      const ujian = await createUjian(guru.guru.guru_id, {
        nama_ujian: 'Test Exam'
      });

      expect(ujian).toBeDefined();
      expect(ujian.guru_id).toBe(guru.guru.guru_id);
      expect(ujian.nama_ujian).toBe('Test Exam');
    });

    it('should allow guru to create multiple ujians', async () => {
      await createUjian(guru.guru.guru_id, { nama_ujian: 'Exam 1' });
      await createUjian(guru.guru.guru_id, { nama_ujian: 'Exam 2' });

      const guruWithUjians = await prisma.guru.findUnique({
        where: { guru_id: guru.guru.guru_id },
        include: { ujians: true }
      });

      expect(guruWithUjians.ujians).toHaveLength(2);
    });

    it('should cascade delete ujians when guru is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);

      await prisma.user.delete({ where: { id: guru.id } });

      const deletedUjian = await prisma.ujian.findUnique({
        where: { ujian_id: ujian.ujian_id }
      });
      expect(deletedUjian).toBeNull();
    });
  });

  describe('Ujian-Soal Relationship (Many-to-Many via SoalUjian)', () => {
    it('should assign soal to ujian with bobot and urutan', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal = await createSoal(guru.guru.guru_id);

      const soalUjian = await assignSoalToUjian(
        ujian.ujian_id,
        soal.soal_id,
        10,
        1
      );

      expect(soalUjian).toBeDefined();
      expect(soalUjian.ujian_id).toBe(ujian.ujian_id);
      expect(soalUjian.soal_id).toBe(soal.soal_id);
      expect(soalUjian.bobot_nilai).toBe(10);
      expect(soalUjian.urutan).toBe(1);
    });

    it('should allow multiple soal in one ujian', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal1 = await createSoal(guru.guru.guru_id, { teks_soal: 'Q1' });
      const soal2 = await createSoal(guru.guru.guru_id, { teks_soal: 'Q2' });
      const soal3 = await createSoal(guru.guru.guru_id, { teks_soal: 'Q3' });

      await assignSoalToUjian(ujian.ujian_id, soal1.soal_id, 10, 1);
      await assignSoalToUjian(ujian.ujian_id, soal2.soal_id, 15, 2);
      await assignSoalToUjian(ujian.ujian_id, soal3.soal_id, 20, 3);

      const ujianWithSoals = await prisma.ujian.findUnique({
        where: { ujian_id: ujian.ujian_id },
        include: { soalUjians: true }
      });

      expect(ujianWithSoals.soalUjians).toHaveLength(3);
    });

    it('should cascade delete soalUjian when ujian is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal = await createSoal(guru.guru.guru_id);
      const soalUjian = await assignSoalToUjian(ujian.ujian_id, soal.soal_id);

      await prisma.ujian.delete({ where: { ujian_id: ujian.ujian_id } });

      const deletedSoalUjian = await prisma.soalUjian.findUnique({
        where: { soal_ujian_id: soalUjian.soal_ujian_id }
      });
      expect(deletedSoalUjian).toBeNull();
    });

    it('should cascade delete soalUjian when soal is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal = await createSoal(guru.guru.guru_id);
      const soalUjian = await assignSoalToUjian(ujian.ujian_id, soal.soal_id);

      await prisma.soal.delete({ where: { soal_id: soal.soal_id } });

      const deletedSoalUjian = await prisma.soalUjian.findUnique({
        where: { soal_ujian_id: soalUjian.soal_ujian_id }
      });
      expect(deletedSoalUjian).toBeNull();
    });
  });

  describe('Ujian-Siswa Relationship (Many-to-Many via PesertaUjian)', () => {
    it('should assign siswa to ujian', async () => {
      const ujian = await createUjian(guru.guru.guru_id);

      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      expect(peserta).toBeDefined();
      expect(peserta.ujian_id).toBe(ujian.ujian_id);
      expect(peserta.siswa_id).toBe(siswa.siswa.siswa_id);
      expect(peserta.status_ujian).toBe('BELUM_MULAI');
    });

    it('should allow multiple siswa in one ujian', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const siswa1 = await createSiswa({ username: 'siswa1' });
      const siswa2 = await createSiswa({ username: 'siswa2' });
      const siswa3 = await createSiswa({ username: 'siswa3' });

      await assignSiswaToUjian(ujian.ujian_id, siswa1.user.siswa.siswa_id);
      await assignSiswaToUjian(ujian.ujian_id, siswa2.user.siswa.siswa_id);
      await assignSiswaToUjian(ujian.ujian_id, siswa3.user.siswa.siswa_id);

      const ujianWithPeserta = await prisma.ujian.findUnique({
        where: { ujian_id: ujian.ujian_id },
        include: { pesertaUjians: true }
      });

      expect(ujianWithPeserta.pesertaUjians).toHaveLength(3);
    });

    it('should cascade delete pesertaUjian when ujian is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      await prisma.ujian.delete({ where: { ujian_id: ujian.ujian_id } });

      const deletedPeserta = await prisma.pesertaUjian.findUnique({
        where: { peserta_ujian_id: peserta.peserta_ujian_id }
      });
      expect(deletedPeserta).toBeNull();
    });

    it('should cascade delete pesertaUjian when siswa is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      await prisma.user.delete({ where: { id: siswa.id } });

      const deletedPeserta = await prisma.pesertaUjian.findUnique({
        where: { peserta_ujian_id: peserta.peserta_ujian_id }
      });
      expect(deletedPeserta).toBeNull();
    });
  });

  describe('PesertaUjian-Jawaban Relationship (One-to-Many)', () => {
    it('should create jawaban for peserta', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal = await createSoal(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      const jawaban = await createJawaban(peserta.peserta_ujian_id, soal.soal_id, {
        jawaban_pg_opsi_ids: '["1"]',
        is_correct: true
      });

      expect(jawaban).toBeDefined();
      expect(jawaban.peserta_ujian_id).toBe(peserta.peserta_ujian_id);
      expect(jawaban.soal_id).toBe(soal.soal_id);
    });

    it('should allow multiple jawaban for one peserta', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal1 = await createSoal(guru.guru.guru_id);
      const soal2 = await createSoal(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      await createJawaban(peserta.peserta_ujian_id, soal1.soal_id);
      await createJawaban(peserta.peserta_ujian_id, soal2.soal_id);

      const pesertaWithJawaban = await prisma.pesertaUjian.findUnique({
        where: { peserta_ujian_id: peserta.peserta_ujian_id },
        include: { jawabans: true }
      });

      expect(pesertaWithJawaban.jawabans).toHaveLength(2);
    });

    it('should cascade delete jawaban when pesertaUjian is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const soal = await createSoal(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);
      const jawaban = await createJawaban(peserta.peserta_ujian_id, soal.soal_id);

      await prisma.pesertaUjian.delete({
        where: { peserta_ujian_id: peserta.peserta_ujian_id }
      });

      const deletedJawaban = await prisma.jawaban.findUnique({
        where: { jawaban_id: jawaban.jawaban_id }
      });
      expect(deletedJawaban).toBeNull();
    });
  });

  describe('PesertaUjian-HasilUjian Relationship (One-to-One)', () => {
    it('should create hasil ujian for peserta', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      const hasil = await prisma.hasilUjian.create({
        data: {
          peserta_ujian_id: peserta.peserta_ujian_id,
          nilai_akhir: 85.5
        }
      });

      expect(hasil).toBeDefined();
      expect(hasil.nilai_akhir).toBe(85.5);
      expect(hasil.peserta_ujian_id).toBe(peserta.peserta_ujian_id);
    });

    it('should enforce one-to-one constraint', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);

      await prisma.hasilUjian.create({
        data: {
          peserta_ujian_id: peserta.peserta_ujian_id,
          nilai_akhir: 85
        }
      });

      await expect(
        prisma.hasilUjian.create({
          data: {
            peserta_ujian_id: peserta.peserta_ujian_id,
            nilai_akhir: 90
          }
        })
      ).rejects.toThrow();
    });

    it('should cascade delete hasilUjian when pesertaUjian is deleted', async () => {
      const ujian = await createUjian(guru.guru.guru_id);
      const peserta = await assignSiswaToUjian(ujian.ujian_id, siswa.siswa.siswa_id);
      const hasil = await prisma.hasilUjian.create({
        data: {
          peserta_ujian_id: peserta.peserta_ujian_id,
          nilai_akhir: 80
        }
      });

      await prisma.pesertaUjian.delete({
        where: { peserta_ujian_id: peserta.peserta_ujian_id }
      });

      const deletedHasil = await prisma.hasilUjian.findUnique({
        where: { hasil_ujian_id: hasil.hasil_ujian_id }
      });
      expect(deletedHasil).toBeNull();
    });
  });
});
