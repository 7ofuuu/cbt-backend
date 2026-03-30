const prisma = require('../src/config/db');

const GRADE_MAJOR_PREFIX = /^\[(X|XI|XII)-(IPA|IPS|Bahasa)\]\s*/i;
const MULTIPLE_PREFIX = /^\[MULTIPLE\]\s*/i;

function normalizeQuestionText(text) {
  if (!text || typeof text !== 'string') return text;

  let normalized = text.trim();
  normalized = normalized.replace(GRADE_MAJOR_PREFIX, '');
  normalized = normalized.replace(MULTIPLE_PREFIX, '');

  return normalized.trim();
}

async function main() {
  const questions = await prisma.question.findMany({
    select: {
      question_id: true,
      question_text: true,
    },
  });

  const updates = questions
    .map((q) => ({
      question_id: q.question_id,
      oldText: q.question_text,
      newText: normalizeQuestionText(q.question_text),
    }))
    .filter((item) => item.oldText !== item.newText);

  if (updates.length === 0) {
    console.log('No question_text metadata tags found. Nothing to clean.');
    return;
  }

  await prisma.$transaction(
    updates.map((item) =>
      prisma.question.update({
        where: { question_id: item.question_id },
        data: { question_text: item.newText },
      })
    )
  );

  console.log(`Cleaned ${updates.length} question_text row(s).`);
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
