import { getBook } from "./book";

export interface Loan {
  id: string;
  bookId: string;
  borrower: string;
  returnedAt: Date | null;
}

const loans: Loan[] = [];

export function borrowBook(bookId: string, borrower: string): Loan {
  if (!getBook(bookId)) {
    throw new Error(`Unknown book: ${bookId}`);
  }
  const alreadyOut = loans.find((l) => l.bookId === bookId && l.returnedAt === null);
  if (alreadyOut) {
    throw new Error(`Book already on loan: ${bookId}`);
  }
  const loan: Loan = {
    id: `${bookId}-${Date.now()}`,
    bookId,
    borrower,
    returnedAt: null,
  };
  loans.push(loan);
  return loan;
}

export function returnBook(loanId: string): Loan {
  const loan = loans.find((l) => l.id === loanId);
  if (!loan) {
    throw new Error(`Unknown loan: ${loanId}`);
  }
  loan.returnedAt = new Date();
  return loan;
}

export function listLoans(): Loan[] {
  return [...loans];
}
