/**
 * Exam result formatters - shared between completed and archived list
 * endpoints in examResultController. Both endpoints select the same
 * relations and project them into the same shape; this module is that
 * shape so the controllers don't drift apart over time.
 *
 * Caller is responsible for issuing the Prisma query with
 * EXAM_LIST_INCLUDE; the formatter just maps each row.
 */

// Prisma `include` blob shared by both the active and archived list queries.
// Kept here next to the formatter so changes to the projection update both
// in a single place.
const EXAM_LIST_INCLUDE = {
  teacher: { select: { teacher_id: true, full_name: true } },
  _count: { select: { exam_participants: true, exam_questions: true } },
  exam_participants: {
    where: { exam_status: { in: ['COMPLETED', 'GRADED'] } },
    include: {
      exam_result: { select: { final_score: true, submit_date: true } },
      student: { select: { student_id: true, full_name: true, classroom: true } },
    },
  },
};

const round2 = (n) => Math.round(n * 100) / 100;

const formatParticipantResult = (p) => ({
  exam_participant_id: p.exam_participant_id,
  student: p.student,
  exam_status: p.exam_status,
  start_time: p.start_time,
  end_time: p.end_time,
  final_score: p.exam_result ? round2(p.exam_result.final_score) : null,
  submit_date: p.exam_result?.submit_date || null,
});

const computeStats = (exam) => {
  const scores = exam.exam_participants
    .filter((p) => p.exam_result)
    .map((p) => p.exam_result.final_score);
  return {
    total_participants: exam._count.exam_participants,
    total_completed: exam.exam_participants.length,
    total_questions: exam._count.exam_questions,
    highest_score: scores.length > 0 ? round2(Math.max(...scores)) : 0,
    lowest_score: scores.length > 0 ? round2(Math.min(...scores)) : 0,
    average_score: scores.length > 0
      ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      : 0,
  };
};

// Format a single exam row into the list response shape. Archived rows pass
// `includeArchivedAt: true` to surface `teacher_submitted_at` to the client.
const formatExamForList = (exam, { includeArchivedAt = false } = {}) => {
  const base = {
    exam_id: exam.exam_id,
    exam_name: exam.exam_name,
    subject: exam.subject,
    grade_level: exam.grade_level,
    major: exam.major,
    start_date: exam.start_date,
    end_date: exam.end_date,
    teacher: exam.teacher,
    statistics: computeStats(exam),
    participant_results: exam.exam_participants.map(formatParticipantResult),
  };
  if (!includeArchivedAt) {
    base.duration_minutes = exam.duration_minutes;
    base.exam_status = exam.exam_status;
  } else {
    base.teacher_submitted_at = exam.teacher_submitted_at;
  }
  return base;
};

module.exports = {
  EXAM_LIST_INCLUDE,
  formatExamForList,
};
