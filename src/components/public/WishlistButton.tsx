'use client';

import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { isSaved, toggleWishlist } from '@/lib/wishlist';

type Props = { slug: string; title?: string; onChange?: (saved: boolean) => void };

/** S-roi11: tombol toggle wishlist localStorage (Simpanku). */
export default function WishlistButton({ slug, title, onChange }: Props) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isSaved(slug));
  }, [slug]);

  function onToggle() {
    const next = toggleWishlist(slug).includes(slug);
    setSaved(next);
    onChange?.(next);
  }

  return (
    <Button
      type="button"
      variant={saved ? 'amber' : 'outline'}
      size="sm"
      aria-pressed={saved}
      aria-label={saved ? 'Hapus dari wishlist' : 'Simpan ke wishlist'}
      title={title ?? slug}
      onClick={onToggle}
    >
      {saved ? (
        <>
          <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> Tersimpan
        </>
      ) : (
        <>
          <Bookmark className="h-4 w-4" aria-hidden="true" /> Simpanku
        </>
      )}
    </Button>
  );
}
