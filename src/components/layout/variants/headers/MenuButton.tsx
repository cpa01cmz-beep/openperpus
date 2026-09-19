'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

type MenuButtonProps = {
  /** id of the server-rendered collapsible panel (aria-controls target). */
  menuId: string;
  /** Full toggle-button class list (preserves per-variant breakpoint). */
  toggleClassName: string;
};

/**
 * MenuButton — the only client island in the header.
 * Owns open/setOpen; drives the server-rendered panel by id so variants
 * keep their exact DOM order and Tailwind classes:
 * - toggles the panel's `hidden` class (panel keeps its own md:/lg:hidden)
 * - closes the panel on any click inside (replaces per-link onClick,
 *   which server components cannot serialize)
 */
export default function MenuButton({ menuId, toggleClassName }: MenuButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.getElementById(menuId)?.classList.toggle('hidden', !open);
  }, [menuId, open]);

  useEffect(() => {
    const panel = document.getElementById(menuId);
    if (!panel) return;
    const close = () => setOpen(false);
    panel.addEventListener('click', close);
    return () => panel.removeEventListener('click', close);
  }, [menuId]);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={menuId}
      aria-label={open ? 'Tutup menu' : 'Buka menu'}
      className={toggleClassName}
    >
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );
}
