const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const activityLogService = require('../services/activityLogService');

const SALT_ROUNDS = 12;

// Helper: format user data with profile
const formatUserData = (user) => {
  const userData = {
    id: user.id,
    username: user.username,
    role: user.role,
    is_active: user.is_active,
    is_super_admin: user.is_super_admin || false,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  switch (user.role) {
    case 'admin':
      userData.admin = user.admin ? {
        admin_id: user.admin.admin_id,
        full_name: user.admin.full_name,
      } : null;
      userData.profile = userData.admin;
      break;
    case 'teacher':
      userData.teacher = user.teacher ? {
        teacher_id: user.teacher.teacher_id,
        full_name: user.teacher.full_name,
        nip: user.teacher.nip,
      } : null;
      userData.profile = userData.teacher;
      break;
    case 'student':
      userData.student = user.student ? {
        student_id: user.student.student_id,
        full_name: user.student.full_name,
        nisn: user.student.nisn,
        classroom: user.student.classroom,
        grade_level: user.student.grade_level,
        major: user.student.major,
      } : null;
      userData.profile = userData.student;
      break;
  }

  return userData;
};

// Get All Users with pagination (Admin only)
const getAllUsers = async (req, res) => {
  const { role, is_active, username, per_page = 10, page = 1 } = req.query;

  try {
    const filters = {};
    if (role) filters.role = role;
    if (is_active !== undefined) filters.is_active = is_active === 'true' || is_active === '1';
    if (username) filters.username = username;

    const perPage = parseInt(per_page);
    const currentPage = parseInt(page);
    const skip = (currentPage - 1) * perPage;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        include: { admin: true, teacher: true, student: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.user.count({ where: filters }),
    ]);

    const data = users.map(formatUserData);
    const lastPage = Math.ceil(total / perPage);

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      users: data,
      data,
      pagination: {
        current_page: currentPage,
        last_page: lastPage,
        per_page: perPage,
        total,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Admins with pagination
const getAllAdmins = async (req, res) => {
  const { per_page = 10, page = 1 } = req.query;

  try {
    const perPage = parseInt(per_page);
    const currentPage = parseInt(page);
    const skip = (currentPage - 1) * perPage;
    const filters = { role: 'admin' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        include: { admin: true },
        skip,
        take: perPage,
      }),
      prisma.user.count({ where: filters }),
    ]);

    const data = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
      updated_at: u.updated_at,
      profile: u.admin ? { admin_id: u.admin.admin_id, full_name: u.admin.full_name } : null,
    }));

    res.json({
      success: true,
      message: 'Admin users retrieved successfully',
      data,
      pagination: {
        current_page: currentPage,
        last_page: Math.ceil(total / perPage),
        per_page: perPage,
        total,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Gurus with pagination
const getAllTeachers = async (req, res) => {
  const { per_page = 10, page = 1 } = req.query;

  try {
    const perPage = parseInt(per_page);
    const currentPage = parseInt(page);
    const skip = (currentPage - 1) * perPage;
    const filters = { role: 'teacher' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        include: { teacher: true },
        skip,
        take: perPage,
      }),
      prisma.user.count({ where: filters }),
    ]);

    const data = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
      updated_at: u.updated_at,
      profile: u.teacher ? { teacher_id: u.teacher.teacher_id, full_name: u.teacher.full_name, nip: u.teacher.nip } : null,
    }));

    res.json({
      success: true,
      message: 'Guru users retrieved successfully',
      data,
      pagination: {
        current_page: currentPage,
        last_page: Math.ceil(total / perPage),
        per_page: perPage,
        total,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get All Siswas with pagination, search, and filters
const getAllStudents = async (req, res) => {
  const { per_page = 10, page = 1, search, grade_level, major, classroom } = req.query;

  try {
    const perPage = parseInt(per_page);
    const currentPage = parseInt(page);
    const skip = (currentPage - 1) * perPage;

    const filters = { role: 'student' };
    const siswaFilters = {};

    if (search) siswaFilters.full_name = { contains: search };
    if (grade_level) siswaFilters.grade_level = grade_level;
    if (major) siswaFilters.major = major;
    if (classroom) siswaFilters.classroom = { contains: classroom };

    if (Object.keys(siswaFilters).length > 0) {
      filters.student = siswaFilters;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        include: { student: true },
        skip,
        take: perPage,
      }),
      prisma.user.count({ where: filters }),
    ]);

    const data = users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
      updated_at: u.updated_at,
      profile: u.student ? {
        student_id: u.student.student_id,
        full_name: u.student.full_name,
        nisn: u.student.nisn,
        classroom: u.student.classroom,
        grade_level: u.student.grade_level,
        major: u.student.major,
      } : null,
    }));

    res.json({
      success: true,
      message: 'Siswa users retrieved successfully',
      data,
      pagination: {
        current_page: currentPage,
        last_page: Math.ceil(total / perPage),
        per_page: perPage,
        total,
        from: skip + 1,
        to: Math.min(skip + perPage, total),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Count Users by Role
const countUsersByRole = async (req, res) => {
  try {
    const [adminCount, guruCount, siswaCount, totalCount] = await Promise.all([
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { role: 'teacher' } }),
      prisma.user.count({ where: { role: 'student' } }),
      prisma.user.count(),
    ]);

    res.json({
      success: true,
      message: 'User count by role retrieved successfully',
      data: {
        total: totalCount,
        admin: adminCount,
        teacher: guruCount,
        student: siswaCount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Get User Detail by ID
const getUserDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { admin: true, teacher: true, student: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User detail retrieved successfully',
      data: formatUserData(user),
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update User by ID
const updateUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { admin: true, teacher: true, student: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Super admin can only be edited by themselves
    if (user.is_super_admin && req.user.id !== user.id) {
      return res.status(403).json({ success: false, message: 'Super admin hanya dapat diedit oleh dirinya sendiri' });
    }

    // Update user basic info
    const userUpdateData = {};
    if (req.body.username) userUpdateData.username = req.body.username;
    if (req.body.password) {
      userUpdateData.password = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    }
    if (req.body.is_active !== undefined) userUpdateData.is_active = req.body.is_active;

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: parseInt(id) },
        data: userUpdateData,
      });
    }

    // Update role-specific profile
    if (req.body.profile) {
      const rawProfile = req.body.profile;

      switch (user.role) {
        case 'admin': {
          // Whitelist admin fields
          const adminData = {};
          if (rawProfile.full_name !== undefined) adminData.full_name = rawProfile.full_name;
          if (user.admin && Object.keys(adminData).length > 0) {
            await prisma.admin.update({
              where: { admin_id: user.admin.admin_id },
              data: adminData,
            });
          }
          break;
        }
        case 'teacher': {
          // Whitelist teacher fields
          const teacherData = {};
          if (rawProfile.full_name !== undefined) teacherData.full_name = rawProfile.full_name;
          if (rawProfile.nip !== undefined) teacherData.nip = rawProfile.nip;
          if (user.teacher && Object.keys(teacherData).length > 0) {
            await prisma.teacher.update({
              where: { teacher_id: user.teacher.teacher_id },
              data: teacherData,
            });
          }
          break;
        }
        case 'student': {
          // Whitelist student fields
          const studentData = {};
          if (rawProfile.full_name !== undefined) studentData.full_name = rawProfile.full_name;
          if (rawProfile.nisn !== undefined) studentData.nisn = rawProfile.nisn;
          if (rawProfile.classroom !== undefined) studentData.classroom = rawProfile.classroom;
          if (rawProfile.grade_level !== undefined) studentData.grade_level = rawProfile.grade_level;
          if (rawProfile.major !== undefined) studentData.major = rawProfile.major;

          if (user.student && Object.keys(studentData).length > 0) {
            // Validate classroom format if classroom is being updated
            if (studentData.classroom) {
              const classroom = studentData.classroom;
              const grade_level = studentData.grade_level || user.student.grade_level;
              const major = studentData.major || user.student.major;

              const validTingkats = ['X', 'XI', 'XII'];
              if (studentData.grade_level && !validTingkats.includes(grade_level)) {
                return res.status(400).json({ success: false, message: 'Tingkat tidak valid' });
              }

              const validJurusans = ['IPA', 'IPS', 'Bahasa'];
              if (studentData.major && !validJurusans.includes(major)) {
                return res.status(400).json({ success: false, message: 'Jurusan tidak valid' });
              }

              const kelasPattern = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;
              if (!kelasPattern.test(classroom)) {
                return res.status(400).json({ success: false, message: 'Format classroom tidak valid' });
              }

              const [, kelasTingkat, kelasJurusan] = classroom.match(kelasPattern);
              if (kelasTingkat !== grade_level) {
                return res.status(400).json({ success: false, message: `Tingkat pada classroom (${kelasTingkat}) tidak sesuai dengan grade_level (${grade_level})` });
              }
              if (kelasJurusan !== major) {
                return res.status(400).json({ success: false, message: `Jurusan pada classroom (${kelasJurusan}) tidak sesuai dengan major (${major})` });
              }
            }

            await prisma.student.update({
              where: { student_id: user.student.student_id },
              data: studentData,
            });
          }
          break;
        }
      }
    }

    // Reload user
    const updatedUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { admin: true, teacher: true, student: true },
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: formatUserData(updatedUser),
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Create User (Admin only) - sama seperti register
const createUser = async (req, res) => {
  const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = req.body;

  // Validate required fields
  if (!username || !password || !role || !full_name) {
    return res.status(400).json({
      error: 'Data tidak lengkap. Username, password, role, dan full_name wajib diisi.'
    });
  }

  // Validate role-specific fields
  if (role === 'student' && (!classroom || !grade_level || !major)) {
    return res.status(400).json({
      error: 'Data siswa tidak lengkap. Kelas, grade_level, dan major wajib diisi untuk siswa.'
    });
  }

  // Validate grade_level value
  const validTingkats = ['X', 'XI', 'XII'];
  if (role === 'student' && !validTingkats.includes(grade_level)) {
    return res.status(400).json({
      error: `Tingkat tidak valid. Pilih salah satu: ${validTingkats.join(', ')}`
    });
  }

  // Validate major value
  const validJurusans = ['IPA', 'IPS', 'Bahasa'];
  if (role === 'student' && !validJurusans.includes(major)) {
    return res.status(400).json({
      error: `Jurusan tidak valid. Pilih salah satu: ${validJurusans.join(', ')}`
    });
  }

  // Validate classroom format for siswa (must be "X-IPA-1" or "XII-IPS-2" format)
  if (role === 'student') {
    // Format: grade_level-major-nomor (contoh: XII-IPA-1, X-IPS-2)
    const kelasPattern = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;
    if (!kelasPattern.test(classroom)) {
      return res.status(400).json({
        error: 'Format classroom tidak valid. Gunakan format: grade_level-major-nomor (contoh: XII-IPA-1, X-IPS-2)'
      });
    }

    // Validate consistency: classroom must match grade_level and major
    const [, kelasTingkat, kelasJurusan] = classroom.match(kelasPattern);

    if (kelasTingkat !== grade_level) {
      return res.status(400).json({
        error: `Tingkat pada classroom (${kelasTingkat}) tidak sesuai dengan grade_level yang dipilih (${grade_level})`
      });
    }

    if (kelasJurusan !== major) {
      return res.status(400).json({
        error: `Jurusan pada classroom (${kelasJurusan}) tidak sesuai dengan major yang dipilih (${major})`
      });
    }
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          role,
        },
      });

      if (role === 'student') {
        await tx.student.create({
          data: {
            user_id: newUser.id,
            full_name,
            classroom: classroom,
            grade_level: grade_level,
            major: major,
            ...(nisn !== undefined && { nisn }),
          },
        });
      } else if (role === 'teacher') {
        await tx.teacher.create({
          data: {
            user_id: newUser.id,
            full_name,
            ...(nip !== undefined && { nip }),
          },
        });
      } else if (role === 'admin') {
        await tx.admin.create({
          data: {
            user_id: newUser.id,
            full_name,
          },
        });
      }

      return newUser;
    });

    res.status(201).json({ message: 'User berhasil dibuat', userId: result.id });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Update User Role (Admin only)
const updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  try {
    // Validasi role
    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { admin: true, teacher: true, student: true },
    });

    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Super admin role cannot be changed
    if (user.is_super_admin) {
      return res.status(403).json({ error: 'Role super admin tidak dapat diubah' });
    }

    // Jika role sama, skip
    if (user.role === role) {
      return res.status(400).json({ error: 'Role sudah sama' });
    }

    await prisma.$transaction(async tx => {
      // Hapus profil lama
      if (user.admin) await tx.admin.delete({ where: { user_id: user.id } });
      if (user.teacher) await tx.teacher.delete({ where: { user_id: user.id } });
      if (user.student) await tx.student.delete({ where: { user_id: user.id } });

      // Update role
      await tx.user.update({
        where: { id: parseInt(id) },
        data: { role },
      });

      // Buat profil baru (dengan data default)
      if (role === 'admin') {
        await tx.admin.create({ data: { user_id: user.id, full_name: 'Admin' } });
      } else if (role === 'teacher') {
        await tx.teacher.create({ data: { user_id: user.id, full_name: 'teacher' } });
      } else if (role === 'student') {
        await tx.student.create({
          data: {
            user_id: user.id,
            full_name: 'student',
            classroom: '-',
            grade_level: '-',
            major: '-',
          },
        });
      }
    });

    res.json({ message: 'Role user berhasil diubah' });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Toggle User Status (Admin only)
const toggleUserStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Super admin status cannot be toggled
    if (user.is_super_admin) {
      return res.status(403).json({ error: 'Status super admin tidak dapat diubah' });
    }

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { is_active: !user.is_active },
    });

    res.json({
      message: `User ${updated.is_active ? 'diaktifkan' : 'dinonaktifkan'}`,
      is_active: updated.is_active,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Delete User (Admin only)
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Super admin cannot be deleted by anyone
    if (user.is_super_admin) {
      return res.status(403).json({ error: 'Super admin tidak dapat dihapus' });
    }

    await prisma.user.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Nilai Siswa (Guru) - untuk essay manual
const scoreAnswer = async (req, res) => {
  const { answer_id, manual_score } = req.body;

  try {
    // Validate nilai range
    if (manual_score < 0 || manual_score > 100) {
      return res.status(400).json({ error: 'Nilai harus antara 0-100' });
    }

    const answer = await prisma.answer.findUnique({
      where: { answer_id: answer_id },
      include: {
        question: true,
        exam_participant: {
          include: {
            exam: {
              include: { teacher: true },
            },
          },
        },
      },
    });

    if (!answer) return res.status(404).json({ error: 'Jawaban tidak ditemukan' });

    const updatedAnswer = await prisma.answer.update({
      where: { answer_id: answer_id },
      data: { manual_score: manual_score },
    });

    // Audit log - track which teacher graded which answer
    await activityLogService.createLog({
      user_id: req.user.id,
      activity_type: 'SCORE_ANSWER',
      description: `Teacher scored answer ${answer_id} with ${manual_score} points`,
      metadata: {
        answer_id,
        manual_score,
        exam_id: answer.exam_participant.exam.exam_id,
        question_id: answer.question_id,
      },
    });

    res.json({ message: 'Jawaban berhasil dinilai', answer: updatedAnswer });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Finalisasi Nilai (Guru) - hitung total nilai
const finalizeScore = async (req, res) => {
  const { exam_participant_id } = req.body;

  try {
    const examParticipant = await prisma.examParticipant.findUnique({
      where: { exam_participant_id: exam_participant_id },
      include: {
        exam: {
          include: {
            teacher: true,
            exam_questions: true,
          },
        },
        answers: {
          include: { question: true },
        },
      },
    });

    if (!examParticipant) return res.status(404).json({ error: 'Peserta ujian tidak ditemukan' });

    // Hitung total nilai
    let totalScore = 0;
    let totalWeight = 0;

    for (const answerItem of examParticipant.answers) {
      const examQuestion = examParticipant.exam.exam_questions.find(su => su.question_id === answerItem.question_id);
      if (!examQuestion) continue;

      const weight = examQuestion.score_weight;
      totalWeight += weight;

      // Hitung nilai per soal
      if (answerItem.question.question_type === 'ESSAY') {
        // Untuk essay, gunakan nilai manual
        if (answerItem.manual_score !== null) {
          totalScore += (answerItem.manual_score / 100) * weight;
        }
      } else {
        // Untuk pilihan ganda, gunakan is_correct
        if (answerItem.is_correct) {
          totalScore += weight;
        }
      }
    }

    // Konversi ke skala 0-100
    const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

    // Simpan atau update hasil ujian
    const existingResult = await prisma.examResult.findUnique({
      where: { exam_participant_id: exam_participant_id },
    });

    if (existingResult) {
      await prisma.examResult.update({
        where: { exam_participant_id: exam_participant_id },
        data: { final_score: finalScore },
      });
    } else {
      await prisma.examResult.create({
        data: {
          exam_participant_id: exam_participant_id,
          final_score: finalScore,
        },
      });
    }

    // Update status peserta ujian
    await prisma.examParticipant.update({
      where: { exam_participant_id: exam_participant_id },
      data: { exam_status: 'GRADED' },
    });

    // Audit log - track which teacher finalized which score
    await activityLogService.createLog({
      user_id: req.user.id,
      activity_type: 'FINALIZE_SCORE',
      description: `Teacher finalized score for participant ${exam_participant_id}: ${finalScore.toFixed(2)}`,
      metadata: {
        exam_participant_id,
        final_score: finalScore,
        exam_id: examParticipant.exam.exam_id,
      },
    });

    res.json({
      message: 'Nilai berhasil difinalisasi',
      final_score: finalScore.toFixed(2),
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

// Batch Create Users (Admin only)
const batchCreateUsers = async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Data users harus berupa array dan tidak boleh kosong' });
  }

  const results = {
    success: 0,
    failed: 0,
    total: users.length,
    errors: [],
  };

  try {
    for (const userData of users) {
      try {
        const { username, password, role, full_name, classroom, grade_level, major, nisn, nip } = userData;

        // Validate required fields
        if (!username || !password || !role || !full_name) {
          results.failed++;
          results.errors.push({ username, error: 'Data tidak lengkap' });
          continue;
        }

        // Validate role-specific fields
        if (role === 'student' && (!classroom || !grade_level || !major)) {
          results.failed++;
          results.errors.push({ username, error: 'Data siswa tidak lengkap (classroom, grade_level, major)' });
          continue;
        }

        // Validate grade_level value
        const validTingkats = ['X', 'XI', 'XII'];
        if (role === 'student' && !validTingkats.includes(grade_level)) {
          results.failed++;
          results.errors.push({ username, error: `Tingkat tidak valid: "${grade_level}". Pilih: ${validTingkats.join(', ')}` });
          continue;
        }

        // Validate major value
        const validJurusans = ['IPA', 'IPS', 'Bahasa'];
        if (role === 'student' && !validJurusans.includes(major)) {
          results.failed++;
          results.errors.push({ username, error: `Jurusan tidak valid: "${major}". Pilih: ${validJurusans.join(', ')}` });
          continue;
        }

        // Validate classroom format for siswa (grade_level-major-nomor)
        if (role === 'student') {
          const kelasPattern = /^(X|XI|XII)-(IPA|IPS|Bahasa)-(\d+)$/;
          if (!kelasPattern.test(classroom)) {
            results.failed++;
            results.errors.push({
              username,
              error: `Format classroom tidak valid: "${classroom}". Gunakan format: grade_level-major-nomor (contoh: XII-IPA-1)`
            });
            continue;
          }

          // Validate consistency: classroom must match grade_level and major
          const [, kelasTingkat, kelasJurusan] = classroom.match(kelasPattern);

          if (kelasTingkat !== grade_level) {
            results.failed++;
            results.errors.push({
              username,
              error: `Tingkat pada classroom (${kelasTingkat}) tidak sesuai dengan grade_level (${grade_level})`
            });
            continue;
          }

          if (kelasJurusan !== major) {
            results.failed++;
            results.errors.push({
              username,
              error: `Jurusan pada classroom (${kelasJurusan}) tidak sesuai dengan major (${major})`
            });
            continue;
          }
        }

        // Check if username already exists
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });

        if (existingUser) {
          results.failed++;
          results.errors.push({ username, error: 'Username sudah digunakan' });
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user with transaction
        await prisma.$transaction(async tx => {
          const newUser = await tx.user.create({
            data: {
              username,
              password: hashedPassword,
              role,
            },
          });

          // Create role-specific profile
          if (role === 'student') {
            await tx.student.create({
              data: {
                user_id: newUser.id,
                full_name,
                classroom: classroom,
                grade_level: grade_level,
                major: major,
                ...(nisn !== undefined && { nisn }),
              },
            });
          } else if (role === 'teacher') {
            await tx.teacher.create({
              data: {
                user_id: newUser.id,
                full_name,
                ...(nip !== undefined && { nip }),
              },
            });
          } else if (role === 'admin') {
            await tx.admin.create({
              data: {
                user_id: newUser.id,
                full_name,
              },
            });
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        const errorMsg = error.code === 'P2002'
          ? 'Username sudah digunakan'
          : 'Gagal membuat user';
        results.errors.push({
          username: userData.username,
          error: errorMsg,
        });
      }
    }

    res.status(200).json({
      message: 'Batch import selesai',
      ...results,
    });
  } catch (error) {
    res.status(500).json({ error: 'Terjadi kesalahan internal' });
  }
};

module.exports = {
  getAllUsers,
  getAllAdmins,
  getAllTeachers,
  getAllStudents,
  countUsersByRole,
  getUserDetail,
  updateUser,
  createUser,
  batchCreateUsers,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  scoreAnswer,
  finalizeScore
};
