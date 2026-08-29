import { addAuthor } from "./domain/author";
import { addBook } from "./domain/book";
import { borrowBook } from "./domain/loan";

const author = addAuthor({ id: "a1", name: "Ursula K. Le Guin" });
const book = addBook({ id: "b1", title: "The Left Hand of Darkness", authorId: author.id });
const loan = borrowBook(book.id, "Ada");

console.log(`${loan.borrower} borrowed "${book.title}" by ${author.name}`);
