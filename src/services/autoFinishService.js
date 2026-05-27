// src/services/autoFinishService.js
const prisma = require('../config/db');
const activityLogService = require('./activityLogService');
const { calculateScore } = require('./scoreService');

/**
 * Check and auto-finish expired ujian sessions
 * This should be called periodically (every minute)
 * OPTIMIZED: Filters by exam end_date at DB level instead of loading ALL sessions
 */
const checkAndFinishExpiredSessions = async () => {
  try {
    const now = new Date();

    // Only fetch sessions whose exam has ended OR whose individual timer has expired.
    // Blocked participants are paused — their timer doesn't tick. They stay in
    // IN_PROGRESS+is_blocked until an admin/teacher unblocks them (or the next
    // scheduler tick after unblock catches them via the normal expiry path).
    const activeSessions = await prisma.examParticipant.findMany({
      where: {
        exam_status: 'IN_PROGRESS',
        start_time: { not: null },
        is_blocked: false,
        // Exam window ended (catch-all)
        exam: {
          end_date: { lt: now },
        },
      },
      include: {
        exam: {
          include: { exam_questions: true },
        },
        student: {
          include: { user: true },
        },
        answers: {
          include: {
            question: {
              include: { answer_options: true },
            },
          },
        },
      },
    });

    // Also fetch sessions where per-student timer expired (start_time + duration < now)
    // but exam window hasn't closed yet. Prisma can't do date arithmetic in WHERE,
    // so we fetch ONGOING exam sessions and filter in-memory.
    const perStudentExpired = await prisma.examParticipant.findMany({
      where: {
        exam_status: 'IN_PROGRESS',
        start_time: { not: null },
        is_blocked: false,
        exam: {
          exam_status: 'ONGOING',
          end_date: { gte: now }, // exam window still open
        },
      },
      include: {
        exam: {
          include: { exam_questions: true },
        },
        student: {
          include: { user: true },
        },
        answers: {
          include: {
            question: {
              include: { answer_options: true },
            },
          },
        },
      },
    });

    // Filter: start_time + duration_minutes < now
    const timedOutSessions = perStudentExpired.filter(ep => {
      const deadline = new Date(ep.start_time.getTime() + ep.exam.duration_minutes * 60000);
      return deadline < now;
    });

    // Combine both sets (no duplicates since conditions are mutually exclusive)
    const allExpired = [...activeSessions, ...timedOutSessions];

    let finishedCount = 0;

    for (const examParticipant of allExpired) {
      try {
        // Calculate score using centralized service
        const { finalScore, hasEssay, allEssayGraded } = calculateScore(
          examParticipant.exam.exam_questions,
          examParticipant.answers
        );

        const newStatus = !hasEssay || allEssayGraded ? 'GRADED' : 'COMPLETED';

        // Atomic update: status + result in transaction
        await prisma.$transaction(async (tx) => {
          await tx.examParticipant.update({
            where: { exam_participant_id: examParticipant.exam_participant_id },
            data: { exam_status: newStatus, end_time: now },
          });

          await tx.examResult.upsert({
            where: { exam_participant_id: examParticipant.exam_participant_id },
            update: { final_score: finalScore, submit_date: now },
            create: {
              exam_participant_id: examParticipant.exam_participant_id,
              final_score: finalScore,
              submit_date: now,
            },
          });
        });

        // Log activity
        await activityLogService.createLog({
          user_id: examParticipant.student.user_id,
          exam_participant_id: examParticipant.exam_participant_id,
          activity_type: 'AUTO_FINISH_UJIAN',
          description: `Ujian otomatis diselesaikan karena waktu habis - ${examParticipant.exam.exam_name}`,
          metadata: {
            exam_id: examParticipant.exam_id,
            final_score: finalScore,
            start_time: examParticipant.start_time,
            end_time: now,
          },
        });

        finishedCount++;
      } catch (error) {
        console.error(`[AutoFinish] Failed to auto-finish participant ${examParticipant.exam_participant_id}:`, error.message);
      }
    }

    if (finishedCount > 0) {
      console.info(`[AutoFinish] Auto-finished ${finishedCount} participant(s)`);
    }

    return finishedCount;
  } catch (error) {
    console.error('[AutoFinish] Service error:', error.message);
    return 0;
  }
};

/**
 * Start auto-finish scheduler
 * Runs every minute
 */
const startAutoFinishScheduler = () => {
  // Run immediately on start
  checkAndFinishExpiredSessions();

  // Then run every 60 seconds
  const intervalId = setInterval(checkAndFinishExpiredSessions, 60000);

  return intervalId;
};

module.exports = {
  checkAndFinishExpiredSessions,
  startAutoFinishScheduler,
};
