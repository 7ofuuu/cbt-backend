/**
 * Taxonomy cascade rename — propagates a renamed taxonomy value to the
 * historical string snapshots that older exam/bank/question/student rows
 * carry. Three controller actions (subject, grade level, major) previously
 * spelled this out verbatim; this single helper now owns the pattern so
 * the controllers can describe *what* to rename without the boilerplate.
 *
 * `targets` lists the Prisma delegate plus the field name to update on it.
 * Pass only the tables that actually carry the snapshot for this taxonomy —
 * subjects, for example, do not appear on the Student table.
 *
 * Returns a `{ <key>: count }` map so callers can surface a friendly
 * summary toast in the dashboard.
 */
const prisma = require('../config/db');

const cascadeRename = async ({ field, oldValue, newValue, targets }) => {
  if (!oldValue || !newValue || oldValue === newValue) return {};
  if (!Array.isArray(targets) || targets.length === 0) return {};

  const updates = targets.map(({ model }) =>
    prisma[model].updateMany({
      where: { [field]: oldValue },
      data: { [field]: newValue },
    }),
  );

  const results = await prisma.$transaction(updates);
  return targets.reduce((acc, { key }, i) => {
    acc[key] = results[i].count;
    return acc;
  }, {});
};

module.exports = { cascadeRename };
