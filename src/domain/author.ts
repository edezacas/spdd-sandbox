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
