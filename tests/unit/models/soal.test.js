const { prisma } = require('../../setup/testDb');
const { createGuru, createSoal } = require('../../setup/testHelpers');

describe('Soal Model Relations', () => {
  let guru;

  beforeEach(async () => {
    const result = await createGuru();
    guru = result.user;
  });

  describe('Guru-Soal Relationship (One-to-Many)', () => {
    it('should create soal with guru relationship', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        teks_soal: 'Test Question',
        mata_pelajaran: 'Matematika'
      });

      expect(soal).toBeDefined();
      expect(soal.guru_id).toBe(guru.guru.guru_id);
      expect(soal.teks_soal).toBe('Test Question');
    });

    it('should allow guru to create multiple soal', async () => {
      const soal1 = await createSoal(guru.guru.guru_id, { teks_soal: 'Question 1' });
      const soal2 = await createSoal(guru.guru.guru_id, { teks_soal: 'Question 2' });
      const soal3 = await createSoal(guru.guru.guru_id, { teks_soal: 'Question 3' });

      const guruWithSoals = await prisma.guru.findUnique({
        where: { guru_id: guru.guru.guru_id },
        include: { soals: true }
      });

      expect(guruWithSoals.soals).toHaveLength(3);
    });

    it('should cascade delete soals when guru is deleted', async () => {
      const soal = await createSoal(guru.guru.guru_id);

      await prisma.user.delete({ where: { id: guru.id } });

      const deletedSoal = await prisma.soal.findUnique({
        where: { soal_id: soal.soal_id }
      });
      expect(deletedSoal).toBeNull();
    });
  });

  describe('Soal-OpsiJawaban Relationship (One-to-Many)', () => {
    it('should create soal pilihan ganda with opsi jawaban', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        opsi_jawaban: [
          { label: 'A', teks_opsi: 'Option A', is_benar: true },
          { label: 'B', teks_opsi: 'Option B', is_benar: false },
          { label: 'C', teks_opsi: 'Option C', is_benar: false },
          { label: 'D', teks_opsi: 'Option D', is_benar: false }
        ]
      });

      expect(soal.opsiJawabans).toHaveLength(4);
      expect(soal.opsiJawabans[0].label).toBe('A');
      expect(soal.opsiJawabans[0].is_benar).toBe(true);
    });

    it('should create soal essay without opsi jawaban', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'ESSAY'
      });

      expect(soal.tipe_soal).toBe('ESSAY');
      expect(soal.opsiJawabans).toHaveLength(0);
    });

    it('should cascade delete opsi jawaban when soal is deleted', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'PILIHAN_GANDA_SINGLE'
      });
      const opsiId = soal.opsiJawabans[0].opsi_id;

      await prisma.soal.delete({ where: { soal_id: soal.soal_id } });

      const deletedOpsi = await prisma.opsiJawaban.findUnique({
        where: { opsi_id: opsiId }
      });
      expect(deletedOpsi).toBeNull();
    });

    it('should allow multiple correct answers for PILIHAN_GANDA_MULTIPLE', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'PILIHAN_GANDA_MULTIPLE',
        opsi_jawaban: [
          { label: 'A', teks_opsi: 'Correct 1', is_benar: true },
          { label: 'B', teks_opsi: 'Wrong', is_benar: false },
          { label: 'C', teks_opsi: 'Correct 2', is_benar: true },
          { label: 'D', teks_opsi: 'Wrong', is_benar: false }
        ]
      });

      const correctAnswers = soal.opsiJawabans.filter(opsi => opsi.is_benar);
      expect(correctAnswers).toHaveLength(2);
    });
  });

  describe('Soal Types and Properties', () => {
    it('should create soal with all properties', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'PILIHAN_GANDA_SINGLE',
        teks_soal: 'What is 2+2?',
        mata_pelajaran: 'Matematika',
        tingkat: '10',
        jurusan: 'IPA',
        soal_gambar: 'https://example.com/image.png',
        soal_pembahasan: '2+2=4 because...'
      });

      expect(soal.tipe_soal).toBe('PILIHAN_GANDA_SINGLE');
      expect(soal.teks_soal).toBe('What is 2+2?');
      expect(soal.mata_pelajaran).toBe('Matematika');
      expect(soal.tingkat).toBe('10');
      expect(soal.jurusan).toBe('IPA');
      expect(soal.soal_gambar).toBe('https://example.com/image.png');
      expect(soal.soal_pembahasan).toBe('2+2=4 because...');
    });

    it('should create soal without optional fields', async () => {
      const soal = await createSoal(guru.guru.guru_id, {
        tipe_soal: 'ESSAY',
        teks_soal: 'Essay question',
        mata_pelajaran: 'Bahasa Indonesia',
        tingkat: '11',
        jurusan: null, // umum
        soal_gambar: null,
        soal_pembahasan: null
      });

      expect(soal.jurusan).toBeNull();
      expect(soal.soal_gambar).toBeNull();
      expect(soal.soal_pembahasan).toBeNull();
    });
  });
});
