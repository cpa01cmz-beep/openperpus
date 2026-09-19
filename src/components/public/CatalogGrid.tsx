import type { Book } from '@/lib/types';
import BookCard from './BookCard';

type Props = {
  books: Book[];
  className?: string;
};

/** Server-rendered catalog grid: murni presentasional, tanpa client JS. */
export default function CatalogGrid({
  books,
  className = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5',
}: Props) {
  return (
    <div className={className}>
      {books.map((b) => (
        <BookCard key={b.id} book={b} />
      ))}
    </div>
  );
}
