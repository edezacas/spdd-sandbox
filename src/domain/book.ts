export interface Book {
  id: string;
  title: string;
  authorId: string;
}

const books: Book[] = [];

export function addBook(book: Book): Book {
  books.push(book);
  return book;
}

export function getBook(id: string): Book | undefined {
  return books.find((b) => b.id === id);
}

export function listBooks(): Book[] {
  return [...books];
}

/** Result envelope of the paginated book query. */
export interface BooksPage {
  items: Book[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const MAX_PAGE_SIZE = 100;

/**
 * Returns one page of books in insertion order. `page` is 1-based; `pageSize`
 * is capped at 100. A page beyond the last one returns an empty `items` array
 * (never throws) — the web layer answers `200` with an empty page for it.
 */
export function listBooksPage(page: number, pageSize: number): BooksPage {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Invalid page: ${page}`);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`Invalid pageSize: ${pageSize}`);
  }
  const total = books.length;
  const totalPages = Math.ceil(total / pageSize); // 0 when the repository is empty
  const start = (page - 1) * pageSize;
  const items = books.slice(start, start + pageSize);
  return { items, page, pageSize, total, totalPages };
}
