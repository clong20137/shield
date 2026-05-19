export interface PaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(query: Record<string, unknown>, options: PaginationOptions = {}): Pagination {
  const defaultPageSize = options.defaultPageSize ?? 50;
  const maxPageSize = options.maxPageSize ?? 100;
  const requestedPage = Number.parseInt(String(query.page || '1'), 10);
  const requestedPageSize = Number.parseInt(String(query.pageSize || query.limit || defaultPageSize), 10);
  const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : defaultPageSize));

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function clampLimit(value: unknown, defaultLimit = 100, maxLimit = 500): number {
  const parsed = Number.parseInt(String(value || defaultLimit), 10);
  return Math.min(maxLimit, Math.max(1, Number.isFinite(parsed) ? parsed : defaultLimit));
}
