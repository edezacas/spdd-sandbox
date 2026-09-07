export interface Author {
  id: string;
  name: string;
}

const authors: Author[] = [];

export function addAuthor(author: Author): Author {
  authors.push(author);
  return author;
}

export function getAuthor(id: string): Author | undefined {
  return authors.find((a) => a.id === id);
}

export function listAuthors(): Author[] {
  return [...authors];
}

/** Result envelope of the paginated author query. */
export interface AuthorsPage {
  items: Author[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const MAX_PAGE_SIZE = 100;

/**
 * Returns one page of authors in insertion order. `page` is 1-based; `pageSize`
 * is capped at 100. A page beyond the last one returns an empty `items` array
 * (never throws) — the web layer answers `200` with an empty page for it.
 * Enforces its own numeric contract by throwing (precedent: `loan.ts`), because
 * the web layer validates external input before calling it.
 */
export function listAuthorsPage(page: number, pageSize: number): AuthorsPage {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Invalid page: ${page}`);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`Invalid pageSize: ${pageSize}`);
  }
  const total = authors.length;
  const totalPages = Math.ceil(total / pageSize); // 0 when the repository is empty
  const start = (page - 1) * pageSize;
  const items = authors.slice(start, start + pageSize);
  return { items, page, pageSize, total, totalPages };
}
