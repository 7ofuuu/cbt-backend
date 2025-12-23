const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { faker } = require('@faker-js/faker');
const { prisma } = require('./testDb');

/**
 * Generate JWT token untuk testing
 */
function generateToken(userId, role) {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

/**
 * Create dummy admin user
 */
async function createAdmin(overrides = {}) {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.create({
    data: {
      username: overrides.username || faker.internet.userName(),
      password: hashedPassword,
      role: 'admin',
      status_aktif: overrides.status_aktif ?? true,
      admin: {
        create: {
          nama_lengkap: overrides.nama_lengkap || faker.person.fullName()
        }
      }
    },
    include: { admin: true }
  });

  const token = generateToken(user.id, user.role);
  return { user, token };
}

/**
 * Create dummy guru user
 */
async function createGuru(overrides = {}) {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.create({
    data: {
      username: overrides.username || faker.internet.userName(),
      password: hashedPassword,
      role: 'guru',
      status_aktif: overrides.status_aktif ?? true,
      guru: {
        create: {
          nama_lengkap: overrides.nama_lengkap || faker.person.fullName()
        }
      }
    },
    include: { guru: true }
  });

  const token = generateToken(user.id, user.role);
  return { user, token };
}

/**
 * Create dummy siswa user
 */
async function createSiswa(overrides = {}) {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.create({
    data: {
      username: overrides.username || faker.internet.userName(),
      password: hashedPassword,
      role: 'siswa',
      status_aktif: overrides.status_aktif ?? true,
      siswa: {
        create: {
          nama_lengkap: overrides.nama_lengkap || faker.person.fullName(),
          kelas: overrides.kelas || '10A',
          tingkat: overrides.tingkat || '10',
          jurusan: overrides.jurusan || 'IPA'
        }
      }
    },
    include: { siswa: true }
  });

  const token = generateToken(user.id, user.role);
  return { user, token };
}

/**
 * Create dummy soal
 */
async function createSoal(guruId, overrides = {}) {
  const tipeSoal = overrides.tipe_soal || 'PILIHAN_GANDA_SINGLE';
  
  const soal = await prisma.soal.create({
    data: {
      tipe_soal: tipeSoal,
      teks_soal: overrides.teks_soal || faker.lorem.sentence(),
      mata_pelajaran: overrides.mata_pelajaran || 'Matematika',
      tingkat: overrides.tingkat || '10',
      jurusan: overrides.jurusan !== undefined ? overrides.jurusan : 'IPA',
      soal_gambar: overrides.soal_gambar !== undefined ? overrides.soal_gambar : null,
      soal_pembahasan: overrides.soal_pembahasan !== undefined ? overrides.soal_pembahasan : faker.lorem.paragraph(),
      guru_id: guruId,
      opsiJawabans: tipeSoal !== 'ESSAY' ? {
        create: overrides.opsi_jawaban || [
          { label: 'A', teks_opsi: 'Opsi A', is_benar: true },
          { label: 'B', teks_opsi: 'Opsi B', is_benar: false },
          { label: 'C', teks_opsi: 'Opsi C', is_benar: false },
          { label: 'D', teks_opsi: 'Opsi D', is_benar: false }
        ]
      } : undefined
    },
    include: { opsiJawabans: true }
  });

  return soal;
}

/**
 * Create dummy ujian
 */
async function createUjian(guruId, overrides = {}) {
  const now = new Date();
  const ujian = await prisma.ujian.create({
    data: {
      nama_ujian: overrides.nama_ujian || faker.lorem.words(3),
      mata_pelajaran: overrides.mata_pelajaran || 'Matematika',
      tingkat: overrides.tingkat || '10',
      jurusan: overrides.jurusan || 'IPA',
      tanggal_mulai: overrides.tanggal_mulai || new Date(now.getTime() + 24 * 60 * 60 * 1000),
      tanggal_selesai: overrides.tanggal_selesai || new Date(now.getTime() + 48 * 60 * 60 * 1000),
      durasi_menit: overrides.durasi_menit || 120,
      is_acak_soal: overrides.is_acak_soal ?? false,
      guru_id: guruId
    }
  });

  return ujian;
}

/**
 * Assign soal ke ujian
 */
async function assignSoalToUjian(ujianId, soalId, bobot = 10, urutan = 1) {
  return await prisma.soalUjian.create({
    data: {
      ujian_id: ujianId,
      soal_id: soalId,
      bobot_nilai: bobot,
      urutan: urutan
    }
  });
}

/**
 * Assign siswa ke ujian
 */
async function assignSiswaToUjian(ujianId, siswaId) {
  return await prisma.pesertaUjian.create({
    data: {
      ujian_id: ujianId,
      siswa_id: siswaId,
      status_ujian: 'BELUM_MULAI'
    }
  });
}

/**
 * Create jawaban untuk peserta
 */
async function createJawaban(pesertaUjianId, soalId, overrides = {}) {
  return await prisma.jawaban.create({
    data: {
      peserta_ujian_id: pesertaUjianId,
      soal_id: soalId,
      jawaban_essay_text: overrides.jawaban_essay_text || null,
      jawaban_pg_opsi_ids: overrides.jawaban_pg_opsi_ids || null,
      is_correct: overrides.is_correct ?? null,
      nilai_manual: overrides.nilai_manual ?? null
    }
  });
}

module.exports = {
  generateToken,
  createAdmin,
  createGuru,
  createSiswa,
  createSoal,
  createUjian,
  assignSoalToUjian,
  assignSiswaToUjian,
  createJawaban
};
