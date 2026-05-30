/**
 * Response helpers — opt-in shape for new endpoints.
 *
 * Existing endpoints return mixed shapes (`{ data }`, `{ subject }`,
 * `{ message, data }`, …) and the dashboard depends on those literal keys,
 * so we cannot migrate them all without coordinated client work. New
 * endpoints should prefer these helpers so they converge on:
 *
 *   200 OK         -> { success: true, data }
 *   201 Created    -> { success: true, data }
 *   List/paginated -> { success: true, data, pagination: { ... } }
 *
 * Error responses still flow through AppError + errorHandler in asyncHandler.
 */

const ok = (res, data, status = 200) => {
  res.status(status).json({ success: true, data });
};

const created = (res, data) => ok(res, data, 201);

const paginated = (res, items, total, page, limit) => {
  res.json({
    success: true,
    data: items,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  });
};

module.exports = { ok, created, paginated };
