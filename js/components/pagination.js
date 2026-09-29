export const PAGE_SIZES = [20, 50, 100, 500];

export function paginateRows(items, requestedPage = 1, requestedSize = 20) {
  const pageSize = PAGE_SIZES.includes(Number(requestedSize)) ? Number(requestedSize) : 20;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 0 : Math.min(Math.max(1, Math.trunc(Number(requestedPage)) || 1), totalPages);
  const offset = page === 0 ? 0 : (page - 1) * pageSize;
  const rows = items.slice(offset, offset + pageSize);

  return {
    rows,
    page,
    pageSize,
    total,
    totalPages,
    start: rows.length ? offset + 1 : 0,
    end: rows.length ? offset + rows.length : 0,
  };
}
