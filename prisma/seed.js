const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Helper functions
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomElements(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

async function main() {
  console.log('🌱 Starting seeding process...\n');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.activityLog.deleteMany();
  await prisma.examResult.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.examQuestion.deleteMany();
  await prisma.examParticipant.deleteMany();
  await prisma.answerOption.deleteMany();
  await prisma.question.deleteMany();
  await prisma.questionBank.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Data cleared\n');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ==================== CREATE ADMINS ====================
  console.log('👤 Creating admins...');
  const admins = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin1',
        password: hashedPassword,
        role: 'admin',
        is_active: true,
        is_super_admin: true,
        admin: { create: { full_name: 'Super Administrator' } },
      },
      include: { admin: true },
    }),
    prisma.user.create({
      data: {
        username: 'admin2',
        password: hashedPassword,
        role: 'admin',
        is_active: true,
        admin: { create: { full_name: 'Administrator Sekunder' } },
      },
      include: { admin: true },
    }),
    prisma.user.create({
      data: {
        username: 'admin_nonaktif',
        password: hashedPassword,
        role: 'admin',
        is_active: false,
        admin: { create: { full_name: 'Administrator Nonaktif' } },
      },
      include: { admin: true },
    }),
  ]);
  console.log(`✅ Created ${admins.length} admins (2 active, 1 inactive)\n`);

  // ==================== CREATE TEACHERS ====================
  console.log('👨‍🏫 Creating teachers...');
  const teacherData = [
    { username: 'guru_mtk', nama: 'Budi Santoso, S.Pd', active: true, nip: '198501012010011001' },
    { username: 'guru_fisika', nama: 'Ani Wijaya, M.Pd', active: true, nip: '198602022011012002' },
    { username: 'guru_kimia', nama: 'Dedi Suryanto, S.Si', active: true, nip: '198703032012011003' },
    { username: 'guru_biologi', nama: 'Rina Kusuma, S.Pd', active: true, nip: '198804042013012004' },
    { username: 'guru_bahasa', nama: 'Siti Nurhaliza, M.Pd', active: true, nip: '198905052014012005' },
    { username: 'guru_sejarah', nama: 'Ahmad Fauzi, S.Pd', active: true, nip: '199006062015011006' },
    { username: 'guru_ekonomi', nama: 'Dewi Lestari, M.Pd', active: true, nip: '199107072016012007' },
    { username: 'guru_nonaktif', nama: 'Guru Nonaktif, S.Pd', active: false, nip: '199208082017011008' },
  ];

  const teachers = [];
  for (const teacherItem of teacherData) {
    const user = await prisma.user.create({
      data: {
        username: teacherItem.username,
        password: hashedPassword,
        role: 'teacher',
        is_active: teacherItem.active,
        teacher: { create: { full_name: teacherItem.nama, nip: teacherItem.nip } },
      },
      include: { teacher: true },
    });
    teachers.push(user);
  }
  console.log(`✅ Created ${teachers.length} teachers (7 active, 1 inactive)\n`);

  // ==================== CREATE STUDENTS ====================
  console.log('👨‍🎓 Creating students...');
  const studentData = [];
  const majors = ['IPA', 'IPS', 'Bahasa'];
  const gradeLevels = ['X', 'XI', 'XII'];
  const firstNames = ['Ahmad', 'Budi', 'Citra', 'Dian', 'Eko', 'Fitri', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lina', 'Maya', 'Nina', 'Omar'];
  const lastNames = ['Pratama', 'Wijaya', 'Kusuma', 'Santoso', 'Putra', 'Putri', 'Saputra', 'Dewi', 'Nugroho', 'Permata'];

  let studentCount = 1;
  for (const gradeLevel of gradeLevels) {
    for (const major of majors) {
      for (let i = 1; i <= 12; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const classNumber = Math.ceil(i / 6);

        studentData.push({
          username: `siswa${studentCount}`,
          nama: `${firstName} ${lastName}`,
          nisn: `00${String(studentCount).padStart(8, '0')}`,
          classroom: `${gradeLevel}-${major}-${classNumber}`,
          gradeLevel: gradeLevel,
          major: major,
          active: studentCount <= 100, // First 100 active, rest inactive
        });
        studentCount++;
      }
    }
  }

  const students = [];
  for (const studentItem of studentData) {
    const user = await prisma.user.create({
      data: {
        username: studentItem.username,
        password: hashedPassword,
        role: 'student',
        is_active: studentItem.active,
        student: {
          create: {
            full_name: studentItem.nama,
            nisn: studentItem.nisn,
            classroom: studentItem.classroom,
            grade_level: studentItem.gradeLevel,
            major: studentItem.major,
          },
        },
      },
      include: { student: true },
    });
    students.push(user);
  }
  console.log(`✅ Created ${students.length} students (100 active, ${students.length - 100} inactive)\n`);

  // ==================== CREATE QUESTIONS ====================
  console.log('📝 Creating questions (Single Choice, Multiple Choice, Essay)...');

  const questionTemplates = {
    Matematika: [
      { text: 'Berapa hasil dari 2 + 2?', options: ['2', '3', '4', '5', '6'], correct: [2] },
      { text: 'Tentukan turunan dari f(x) = 3x² + 2x - 1', options: ['6x + 2', '6x - 2', '3x + 2', '6x + 1', '3x - 1'], correct: [0] },
      { text: 'Nilai dari sin 90° adalah...', options: ['0', '0.5', '1', '√2/2', '√3/2'], correct: [2] },
      { text: 'Manakah yang merupakan bilangan prima?', options: ['2', '3', '4', '5', '6'], correct: [0, 1, 3] },
      { text: 'Jika a = 5 dan b = 3, berapa nilai dari a² - b²?', options: ['8', '16', '25', '34', '64'], correct: [1] },
    ],
    Fisika: [
      { text: 'Satuan SI untuk gaya adalah...', options: ['Joule', 'Newton', 'Watt', 'Pascal', 'Kelvin'], correct: [1] },
      { text: 'Hukum Newton I menyatakan tentang...', options: ['Gaya dan percepatan', 'Inersia', 'Aksi-reaksi', 'Gravitasi', 'Momentum'], correct: [1] },
      { text: 'Yang termasuk besaran vektor adalah...', options: ['Gaya', 'Kecepatan', 'Massa', 'Percepatan', 'Waktu'], correct: [0, 1, 3] },
    ],
    Kimia: [
      { text: 'Simbol kimia untuk air adalah...', options: ['H₂O', 'CO₂', 'O₂', 'H₂', 'NaCl'], correct: [0] },
      { text: 'Jumlah proton dalam atom disebut...', options: ['Nomor massa', 'Nomor atom', 'Isotop', 'Ion', 'Elektron'], correct: [1] },
      { text: 'Yang termasuk gas mulia adalah...', options: ['Helium', 'Neon', 'Oksigen', 'Argon', 'Nitrogen'], correct: [0, 1, 3] },
    ],
    Biologi: [
      { text: 'Organel yang berfungsi sebagai pusat sel adalah...', options: ['Mitokondria', 'Ribosom', 'Nukleus', 'Lisosom', 'Golgi'], correct: [2] },
      { text: 'Proses fotosintesis terjadi di...', options: ['Mitokondria', 'Kloroplas', 'Nukleus', 'Ribosom', 'Vakuola'], correct: [1] },
      { text: 'Yang termasuk organ pencernaan adalah...', options: ['Lambung', 'Usus', 'Jantung', 'Hati', 'Paru-paru'], correct: [0, 1, 3] },
    ],
    'Bahasa Indonesia': [
      { text: 'Kata baku dari "apotek" adalah...', options: ['Apotik', 'Apotek', 'Apothek', 'Apotex', 'Apotec'], correct: [0] },
      { text: 'Kalimat yang mengandung subjek, predikat, dan objek disebut...', options: ['Kalimat tunggal', 'Kalimat majemuk', 'Kalimat lengkap', 'Kalimat inti', 'Kalimat sempurna'], correct: [2] },
      { text: 'Yang termasuk imbuhan adalah...', options: ['ber-', 'me-', 'di-', '-an', '-kan'], correct: [0, 1, 2, 3, 4] },
    ],
    Sejarah: [
      { text: 'Proklamasi kemerdekaan Indonesia dibacakan pada tanggal...', options: ['17 Agustus 1945', '17 Agustus 1944', '18 Agustus 1945', '16 Agustus 1945', '19 Agustus 1945'], correct: [0] },
      { text: 'Kerajaan Hindu pertama di Indonesia adalah...', options: ['Majapahit', 'Kutai', 'Sriwijaya', 'Mataram Kuno', 'Singasari'], correct: [1] },
    ],
    Ekonomi: [
      { text: 'Ilmu ekonomi mempelajari tentang...', options: ['Uang', 'Kelangkaan', 'Perdagangan', 'Produksi', 'Distribusi'], correct: [1] },
      { text: 'Kebutuhan primer manusia meliputi...', options: ['Sandang', 'Pangan', 'Papan', 'Mobil', 'Perhiasan'], correct: [0, 1, 2] },
    ],
  };

  const subjectData = {
    Matematika: { teacherId: teachers[0].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA', 'IPS'] },
    Fisika: { teacherId: teachers[1].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA'] },
    Kimia: { teacherId: teachers[2].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA'] },
    Biologi: { teacherId: teachers[3].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA'] },
    'Bahasa Indonesia': { teacherId: teachers[4].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA', 'IPS', 'Bahasa'] },
    Sejarah: { teacherId: teachers[5].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPA', 'IPS', 'Bahasa'] },
    Ekonomi: { teacherId: teachers[6].teacher.teacher_id, gradeLevels: ['X', 'XI', 'XII'], majors: ['IPS'] },
  };

  // ==================== CREATE QUESTION BANKS ====================
  console.log('🏦 Creating question banks...');
  const questionBanks = {}; // key: `${subject}-${gradeLevel}-${major}` => bank object
  let bankCount = 0;

  for (const [subjectName, config] of Object.entries(subjectData)) {
    for (const gradeLevel of config.gradeLevels) {
      for (const majorItem of config.majors) {
        const bankName = `${subjectName} - ${gradeLevel} - ${majorItem}`;
        const bank = await prisma.questionBank.create({
          data: {
            bank_name: bankName,
            description: `Bank soal ${subjectName} untuk kelas ${gradeLevel} jurusan ${majorItem}`,
            subject: subjectName,
            grade_level: gradeLevel,
            major: majorItem,
            teacher_id: config.teacherId,
          },
        });
        questionBanks[`${subjectName}-${gradeLevel}-${majorItem}`] = bank;
        bankCount++;
      }
    }
  }
  console.log(`✅ Created ${bankCount} question banks\n`);

  // ==================== CREATE QUESTIONS (assigned to banks) ====================
  const questions = [];
  let questionCount = 0;

  for (const [subjectName, config] of Object.entries(subjectData)) {
    const templates = questionTemplates[subjectName] || questionTemplates['Matematika'];

    for (const gradeLevel of config.gradeLevels) {
      for (const majorItem of config.majors) {
        const bankKey = `${subjectName}-${gradeLevel}-${majorItem}`;
        const bank = questionBanks[bankKey];

        // Create 10 Single Choice questions
        for (let i = 0; i < 10; i++) {
          const template = templates[i % templates.length];
          const question = await prisma.question.create({
            data: {
              question_type: 'SINGLE_CHOICE',
              question_text: `[${gradeLevel}-${majorItem}] ${template.text}`,
              subject: subjectName,
              grade_level: gradeLevel,
              major: majorItem,
              question_explanation: `Pembahasan untuk soal ${subjectName} tingkat ${gradeLevel}`,
              teacher_id: config.teacherId,
              question_bank_id: bank.question_bank_id,
              answer_options: {
                create: template.options.map((opt, idx) => ({
                  label: String.fromCharCode(65 + idx),
                  option_text: opt,
                  is_correct: template.correct[0] === idx,
                })),
              },
            },
          });
          questions.push(question);
          questionCount++;
        }

        // Create 5 Multiple Choice questions
        for (let i = 0; i < 5; i++) {
          const template = templates.find(t => t.correct.length > 1) || templates[0];
          const correctAnswers = template.correct.length > 1 ? template.correct : [0, 1];

          const question = await prisma.question.create({
            data: {
              question_type: 'MULTIPLE_CHOICE',
              question_text: `[${gradeLevel}-${majorItem}] [MULTIPLE] ${template.text} (Pilih semua yang benar)`,
              subject: subjectName,
              grade_level: gradeLevel,
              major: majorItem,
              question_explanation: `Pembahasan untuk soal PG Multiple ${subjectName}`,
              teacher_id: config.teacherId,
              question_bank_id: bank.question_bank_id,
              answer_options: {
                create: template.options.map((opt, idx) => ({
                  label: String.fromCharCode(65 + idx),
                  option_text: opt,
                  is_correct: correctAnswers.includes(idx),
                })),
              },
            },
          });
          questions.push(question);
          questionCount++;
        }

        // Create 5 Essay questions
        for (let i = 0; i < 5; i++) {
          const question = await prisma.question.create({
            data: {
              question_type: 'ESSAY',
              question_text: `[${gradeLevel}-${majorItem}] Jelaskan secara detail tentang konsep ${subjectName} terkait topik ${i + 1}. Berikan contoh dan analisis yang mendalam.`,
              subject: subjectName,
              grade_level: gradeLevel,
              major: majorItem,
              question_explanation: `Pembahasan essay ${subjectName}`,
              teacher_id: config.teacherId,
              question_bank_id: bank.question_bank_id,
            },
          });
          questions.push(question);
          questionCount++;
        }
      }
    }
  }
  console.log(`✅ Created ${questionCount} questions (Single Choice, Multiple Choice, Essay)\n`);

  // ==================== CREATE EXAMS (All Statuses) ====================
  console.log('📋 Creating exams with various statuses...');

  const now = new Date();
  const examTemplates = [];

  // SCHEDULED (Future)
  for (let i = 0; i < 3; i++) {
    examTemplates.push({
      name: `Ujian Tengah Semester Matematika ${i + 1}`,
      subject: 'Matematika',
      gradeLevel: ['X', 'XI', 'XII'][i],
      major: 'IPA',
      teacherId: teachers[0].teacher.teacher_id,
      status: 'SCHEDULED',
      startDate: new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
      duration: 90,
      shuffle: i % 2 === 0,
    });
  }

  // ONGOING (Current)
  for (let i = 0; i < 3; i++) {
    const startTime = new Date(now.getTime() - 30 * 60 * 1000); // Started 30 min ago
    const endTime = new Date(now.getTime() + 60 * 60 * 1000); // Ends in 1 hour

    examTemplates.push({
      name: `Ujian Berlangsung Fisika ${i + 1}`,
      subject: 'Fisika',
      gradeLevel: ['X', 'XI', 'XII'][i],
      major: 'IPA',
      teacherId: teachers[1].teacher.teacher_id,
      status: 'ONGOING',
      startDate: startTime,
      endDate: endTime,
      duration: 90,
      shuffle: true,
    });
  }

  // ENDED (Past)
  for (let i = 0; i < 3; i++) {
    examTemplates.push({
      name: `Ujian Akhir Semester Kimia ${i + 1}`,
      subject: 'Kimia',
      gradeLevel: ['X', 'XI', 'XII'][i],
      major: 'IPA',
      teacherId: teachers[2].teacher.teacher_id,
      status: 'ENDED',
      startDate: new Date(now.getTime() - (i + 2) * 24 * 60 * 60 * 1000),
      duration: 90,
      shuffle: false,
    });
  }

  // Additional exams for other subjects
  examTemplates.push(
    { name: 'Ujian Biologi Kelas X', subject: 'Biologi', gradeLevel: 'X', major: 'IPA', teacherId: teachers[3].teacher.teacher_id, status: 'ENDED', startDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), duration: 90, shuffle: false },
    { name: 'Ujian Bahasa Indonesia', subject: 'Bahasa Indonesia', gradeLevel: 'XI', major: 'IPA', teacherId: teachers[4].teacher.teacher_id, status: 'ONGOING', startDate: new Date(now.getTime() - 20 * 60 * 1000), duration: 90, shuffle: true },
    { name: 'Ujian Sejarah', subject: 'Sejarah', gradeLevel: 'XII', major: 'IPS', teacherId: teachers[5].teacher.teacher_id, status: 'SCHEDULED', startDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), duration: 90, shuffle: false },
    { name: 'Ujian Ekonomi', subject: 'Ekonomi', gradeLevel: 'XI', major: 'IPS', teacherId: teachers[6].teacher.teacher_id, status: 'ENDED', startDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), duration: 90, shuffle: true }
  );

  const exams = [];
  for (const template of examTemplates) {
    const startDate = template.startDate;
    const endDate = template.endDate || new Date(startDate.getTime() + template.duration * 60 * 1000);

    const exam = await prisma.exam.create({
      data: {
        exam_name: template.name,
        subject: template.subject,
        grade_level: template.gradeLevel,
        major: template.major,
        start_date: startDate,
        end_date: endDate,
        duration_minutes: template.duration,
        is_shuffle_questions: template.shuffle,
        exam_status: template.status,
        teacher_id: template.teacherId,
      },
    });
    exams.push(exam);
  }
  console.log(`✅ Created ${exams.length} exams (SCHEDULED, ONGOING, ENDED)\n`);

  // ==================== ASSIGN QUESTIONS TO EXAMS ====================
  console.log('🔗 Assigning questions to exams...');
  let examQuestionCount = 0;

  for (const exam of exams) {
    const matchingQuestions = questions.filter(s => s.subject === exam.subject && s.grade_level === exam.grade_level && s.major === exam.major);

    const pgSingleQuestions = matchingQuestions.filter(s => s.question_type === 'SINGLE_CHOICE').slice(0, 8);
    const pgMultipleQuestions = matchingQuestions.filter(s => s.question_type === 'MULTIPLE_CHOICE').slice(0, 2);
    const essayQuestions = matchingQuestions.filter(s => s.question_type === 'ESSAY').slice(0, 3);
    const selectedQuestions = [...pgSingleQuestions, ...pgMultipleQuestions, ...essayQuestions];

    for (let i = 0; i < selectedQuestions.length; i++) {
      await prisma.examQuestion.create({
        data: {
          exam_id: exam.exam_id,
          question_id: selectedQuestions[i].question_id,
          score_weight: selectedQuestions[i].question_type === 'ESSAY' ? 20 : selectedQuestions[i].question_type === 'MULTIPLE_CHOICE' ? 15 : 10,
          sequence: i + 1,
        },
      });
      examQuestionCount++;
    }
  }
  console.log(`✅ Created ${examQuestionCount} exam-question assignments\n`);

  // ==================== ASSIGN STUDENTS TO EXAMS ====================
  console.log('👥 Assigning students to exams...');
  let examParticipantCount = 0;

  for (const exam of exams) {
    const matchingStudents = students.filter(s => s.student.grade_level === exam.grade_level && s.student.major === exam.major && s.is_active);

    for (const studentItem of matchingStudents) {
      await prisma.examParticipant.create({
        data: {
          exam_id: exam.exam_id,
          student_id: studentItem.student.student_id,
          exam_status: 'NOT_STARTED',
          is_blocked: false,
        },
      });
      examParticipantCount++;
    }
  }
  console.log(`✅ Created ${examParticipantCount} exam-participant assignments\n`);

  // ==================== CREATE COMPLETED EXAMS WITH ALL STATUSES ====================
  console.log('✍️ Creating sample completed exams with various statuses...');

  let answerCount = 0;
  let resultCount = 0;

  // Process ENDED exams
  const endedExams = exams.filter(u => u.exam_status === 'ENDED');

  for (const exam of endedExams) {
    const examParticipants = await prisma.examParticipant.findMany({
      where: { exam_id: exam.exam_id },
      take: 8,
    });

    const examQuestions = await prisma.examQuestion.findMany({
      where: { exam_id: exam.exam_id },
      include: { question: { include: { answer_options: true } } },
    });

    for (let idx = 0; idx < examParticipants.length; idx++) {
      const participant = examParticipants[idx];

      // Various statuses: COMPLETED, GRADED, some IN_PROGRESS
      let status;
      let startTime = null;
      let endTime = null;
      let isBlocked = false;
      let blockReason = null;
      let unlockCode = null;

      if (idx < 5) {
        // GRADED - Completed and graded
        status = 'GRADED';
        startTime = new Date(exam.start_date.getTime() + Math.floor(Math.random() * 10) * 60 * 1000);
        endTime = new Date(startTime.getTime() + (40 + Math.floor(Math.random() * 30)) * 60 * 1000);
      } else if (idx < 7) {
        // COMPLETED - Completed but not graded yet (has essay)
        status = 'COMPLETED';
        startTime = new Date(exam.start_date.getTime() + Math.floor(Math.random() * 10) * 60 * 1000);
        endTime = new Date(startTime.getTime() + (45 + Math.floor(Math.random() * 25)) * 60 * 1000);
      } else {
        // IN_PROGRESS - Started but abandoned (blocked student)
        status = 'IN_PROGRESS';
        startTime = new Date(exam.start_date.getTime() + Math.floor(Math.random() * 15) * 60 * 1000);
        isBlocked = true;
        blockReason = 'Terdeteksi tab switching berulang kali';
        unlockCode = `UNLOCK${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }

      await prisma.examParticipant.update({
        where: { exam_participant_id: participant.exam_participant_id },
        data: {
          exam_status: status,
          start_time: startTime,
          end_time: endTime,
          is_blocked: isBlocked,
          block_reason: blockReason,
          unlock_code: unlockCode,
        },
      });

      // Create answers
      if (status === 'GRADED' || status === 'COMPLETED') {
        let totalScore = 0;
        let totalWeight = 0;
        let hasUngradedEssay = false;

        for (const examQuestion of examQuestions) {
          totalWeight += examQuestion.score_weight;

          if (examQuestion.question.question_type === 'SINGLE_CHOICE') {
            const isCorrect = Math.random() > 0.25;
            const correctOption = examQuestion.question.answer_options.find(o => o.is_correct);
            const incorrectOption = examQuestion.question.answer_options.find(o => !o.is_correct);
            const selectedOption = isCorrect ? correctOption : incorrectOption;

            await prisma.answer.create({
              data: {
                exam_participant_id: participant.exam_participant_id,
                question_id: examQuestion.question_id,
                mc_option_ids: JSON.stringify([selectedOption.option_id.toString()]),
                is_correct: isCorrect,
              },
            });

            if (isCorrect) totalScore += examQuestion.score_weight;
            answerCount++;
          } else if (examQuestion.question.question_type === 'MULTIPLE_CHOICE') {
            const correctOptions = examQuestion.question.answer_options.filter(o => o.is_correct);
            const isCorrect = Math.random() > 0.4;
            const selectedOptions = isCorrect ? correctOptions : getRandomElements(examQuestion.question.answer_options, 2);

            await prisma.answer.create({
              data: {
                exam_participant_id: participant.exam_participant_id,
                question_id: examQuestion.question_id,
                mc_option_ids: JSON.stringify(selectedOptions.map(o => o.option_id.toString())),
                is_correct: isCorrect,
              },
            });

            if (isCorrect) totalScore += examQuestion.score_weight;
            answerCount++;
          } else if (examQuestion.question.question_type === 'ESSAY') {
            const manualScore = status === 'GRADED' ? 70 + Math.floor(Math.random() * 26) : null;
            const earnedScore = manualScore ? (manualScore / 100) * examQuestion.score_weight : 0;

            if (!manualScore) hasUngradedEssay = true;

            await prisma.answer.create({
              data: {
                exam_participant_id: participant.exam_participant_id,
                question_id: examQuestion.question_id,
                essay_answer_text: 'Ini adalah contoh jawaban essay dari siswa. Jawaban ini berisi penjelasan detail mengenai topik yang ditanyakan dengan analisis yang mendalam dan contoh-contoh yang relevan.',
                manual_score: manualScore,
              },
            });

            if (manualScore) totalScore += earnedScore;
            answerCount++;
          }
        }

        // Create exam result only for GRADED
        if (status === 'GRADED') {
          const finalScore = (totalScore / totalWeight) * 100;
          await prisma.examResult.create({
            data: {
              exam_participant_id: participant.exam_participant_id,
              final_score: Math.round(finalScore * 100) / 100,
              submit_date: endTime,
            },
          });
          resultCount++;
        }
      } else if (status === 'IN_PROGRESS') {
        // Partial answers for blocked students
        const partialQuestions = getRandomElements(examQuestions, Math.floor(examQuestions.length / 2));

        for (const examQuestion of partialQuestions) {
          if (examQuestion.question.question_type === 'SINGLE_CHOICE') {
            const randomOption = getRandomElements(examQuestion.question.answer_options, 1)[0];
            await prisma.answer.create({
              data: {
                exam_participant_id: participant.exam_participant_id,
                question_id: examQuestion.question_id,
                mc_option_ids: JSON.stringify([randomOption.option_id.toString()]),
                is_correct: randomOption.is_correct,
              },
            });
            answerCount++;
          }
        }
      }
    }
  }

  // Process ONGOING exams - some started
  const ongoingExams = exams.filter(u => u.exam_status === 'ONGOING');

  for (const exam of ongoingExams) {
    const examParticipants = await prisma.examParticipant.findMany({
      where: { exam_id: exam.exam_id },
      take: 5,
    });

    for (let idx = 0; idx < examParticipants.length; idx++) {
      const participant = examParticipants[idx];

      if (idx < 3) {
        // IN_PROGRESS - Currently working
        const startTime = new Date(exam.start_date.getTime() + Math.floor(Math.random() * 20) * 60 * 1000);

        await prisma.examParticipant.update({
          where: { exam_participant_id: participant.exam_participant_id },
          data: {
            exam_status: 'IN_PROGRESS',
            start_time: startTime,
          },
        });

        // Create partial answers
        const examQuestions = await prisma.examQuestion.findMany({
          where: { exam_id: exam.exam_id },
          include: { question: { include: { answer_options: true } } },
          take: 3,
        });

        for (const examQuestion of examQuestions) {
          if (examQuestion.question.question_type === 'SINGLE_CHOICE') {
            const randomOption = getRandomElements(examQuestion.question.answer_options, 1)[0];
            await prisma.answer.create({
              data: {
                exam_participant_id: participant.exam_participant_id,
                question_id: examQuestion.question_id,
                mc_option_ids: JSON.stringify([randomOption.option_id.toString()]),
                is_correct: randomOption.is_correct,
              },
            });
            answerCount++;
          }
        }
      }
      // else: Keep as NOT_STARTED
    }
  }

  console.log(`✅ Created ${answerCount} answers`);
  console.log(`✅ Created ${resultCount} exam results\n`);

  // ==================== CREATE ACTIVITY LOGS ====================
  console.log('📊 Creating activity logs...');

  let logCount = 0;

  // LOGIN logs for various users
  const activeUsers = [...students.slice(0, 30), ...teachers.slice(0, 5), admins[0], admins[1]];
  for (const user of activeUsers) {
    const loginTime = randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now);
    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: 'LOGIN',
        description: `User ${user.username} berhasil login`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          login_time: loginTime.toISOString(),
        }),
        created_at: loginTime,
      },
    });
    logCount++;
  }

  // LOGOUT logs
  for (let i = 0; i < 10; i++) {
    const user = activeUsers[i];
    const logoutTime = randomDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000), now);
    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: 'LOGOUT',
        description: `User ${user.username} logout dari sistem`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          logout_time: logoutTime.toISOString(),
        }),
        created_at: logoutTime,
      },
    });
    logCount++;
  }

  // START_UJIAN and FINISH_UJIAN logs for completed exams
  for (const exam of endedExams) {
    const examParticipants = await prisma.examParticipant.findMany({
      where: {
        exam_id: exam.exam_id,
        exam_status: { in: ['COMPLETED', 'GRADED'] },
      },
      include: { student: { include: { user: true } } },
    });

    for (const participant of examParticipants) {
      // START_UJIAN log
      await prisma.activityLog.create({
        data: {
          user_id: participant.student.user.id,
          exam_participant_id: participant.exam_participant_id,
          activity_type: 'START_UJIAN',
          description: `Siswa ${participant.student.full_name} memulai ujian ${exam.exam_name}`,
          ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          metadata: JSON.stringify({
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            subject: exam.subject,
          }),
          created_at: participant.start_time,
        },
      });
      logCount++;

      // FINISH_UJIAN or AUTO_FINISH_UJIAN log
      const isAutoFinish = Math.random() > 0.7;
      await prisma.activityLog.create({
        data: {
          user_id: participant.student.user.id,
          exam_participant_id: participant.exam_participant_id,
          activity_type: isAutoFinish ? 'AUTO_FINISH_UJIAN' : 'FINISH_UJIAN',
          description: isAutoFinish ? `Ujian ${exam.exam_name} diselesaikan otomatis karena waktu habis` : `Siswa ${participant.student.full_name} menyelesaikan ujian ${exam.exam_name}`,
          ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          metadata: JSON.stringify({
            exam_id: exam.exam_id,
            exam_name: exam.exam_name,
            is_auto_finish: isAutoFinish,
          }),
          created_at: participant.end_time,
        },
      });
      logCount++;
    }
  }

  // BLOCK_STUDENT logs
  const blockedParticipants = await prisma.examParticipant.findMany({
    where: { is_blocked: true },
    include: { student: { include: { user: true } }, exam: true },
  });

  for (const participant of blockedParticipants) {
    await prisma.activityLog.create({
      data: {
        user_id: participant.student.user.id,
        exam_participant_id: participant.exam_participant_id,
        activity_type: 'BLOCK_STUDENT',
        description: `Siswa ${participant.student.full_name} diblokir: ${participant.block_reason}`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          exam_id: participant.exam_id,
          exam_name: participant.exam.exam_name,
          block_reason: participant.block_reason,
          unlock_code: participant.unlock_code,
        }),
        created_at: participant.start_time,
      },
    });
    logCount++;
  }

  // Additional activity types
  const additionalActivities = [
    { type: 'CREATE_UJIAN', description: 'Guru membuat ujian baru' },
    { type: 'UPDATE_UJIAN', description: 'Guru mengupdate ujian' },
    { type: 'DELETE_UJIAN', description: 'Guru menghapus ujian' },
    { type: 'CREATE_SOAL', description: 'Guru membuat soal baru' },
    { type: 'UPDATE_SOAL', description: 'Guru mengupdate soal' },
    { type: 'GRADE_ESSAY', description: 'Guru menilai jawaban essay' },
    { type: 'VIEW_HASIL', description: 'Siswa melihat hasil ujian' },
    { type: 'EXPORT_HASIL', description: 'Guru mengexport hasil ujian' },
  ];

  for (let i = 0; i < 20; i++) {
    const activity = additionalActivities[Math.floor(Math.random() * additionalActivities.length)];
    const user =
      activity.type.includes('GURU') || activity.type.includes('CREATE') || activity.type.includes('UPDATE') || activity.type.includes('DELETE') || activity.type.includes('GRADE') || activity.type.includes('EXPORT')
        ? teachers[Math.floor(Math.random() * 5)]
        : students[Math.floor(Math.random() * 20)];

    await prisma.activityLog.create({
      data: {
        user_id: user.id,
        activity_type: activity.type,
        description: `${user.username}: ${activity.description}`,
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        metadata: JSON.stringify({
          username: user.username,
          role: user.role,
          timestamp: randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now).toISOString(),
        }),
        created_at: randomDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now),
      },
    });
    logCount++;
  }

  console.log(`✅ Created ${logCount} activity logs\n`);

  // ==================== SUMMARY ====================
  console.log('📊 =============== SEEDING SUMMARY ===============');
  console.log(`✅ Admins: ${admins.length} (2 active, 1 inactive)`);
  console.log(`✅ Teachers: ${teachers.length} (7 active, 1 inactive)`);
  console.log(`✅ Students: ${students.length} (100 active, ${students.length - 100} inactive)`);
  console.log(`✅ Questions: ${questionCount} (Single Choice, Multiple Choice, Essay)`);
  console.log(`✅ Exams: ${exams.length} (SCHEDULED, ONGOING, ENDED)`);
  console.log(`✅ Exam-Question Assignments: ${examQuestionCount}`);
  console.log(`✅ Exam-Participant Assignments: ${examParticipantCount}`);
  console.log(`   - NOT_STARTED: Multiple`);
  console.log(`   - IN_PROGRESS: Multiple (including blocked)`);
  console.log(`   - COMPLETED: Multiple (completed, awaiting grading)`);
  console.log(`   - GRADED: Multiple (fully graded)`);
  console.log(`   - Blocked Students: ${blockedParticipants.length}`);
  console.log(`✅ Answers: ${answerCount}`);
  console.log(`✅ Exam Results: ${resultCount}`);
  console.log(`✅ Activity Logs: ${logCount}`);
  console.log(`   - LOGIN, LOGOUT, START_UJIAN, FINISH_UJIAN, AUTO_FINISH_UJIAN`);
  console.log(`   - BLOCK_STUDENT, CREATE_UJIAN, UPDATE_UJIAN, GRADE_ESSAY, etc.`);
  console.log('================================================================\n');

  console.log('🎉 Seeding completed successfully!\n');
  console.log('📝 Default password for all users: password123\n');
  console.log('👤 Sample Accounts:');
  console.log('   Admin: admin1 / password123');
  console.log('   Teacher: guru_mtk / password123');
  console.log('   Student: siswa1 / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
