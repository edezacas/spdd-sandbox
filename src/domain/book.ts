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
