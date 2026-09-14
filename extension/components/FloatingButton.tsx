import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

const DEFAULT_POS = () => ({
  x: window.innerWidth - 76,
  y: Math.round(window.innerHeight * 0.45),
});

interface Props {
  open: boolean;
  onToggle: () => void;
}

export function FloatingButton({ open, onToggle }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef({ dragging: false, moved: false, dx: 0, dy: 0 });

  useEffect(() => {
    browser.storage.local
      .get('floatingPos')
      .then(({ floatingPos }) => {
        if (floatingPos && typeof floatingPos.x === 'number') setPos(floatingPos);
        else setPos(DEFAULT_POS());
      })
      .catch(() => setPos(DEFAULT_POS()));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { dragging: true, moved: false, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.dragging) return;
    const nx = Math.min(Math.max(e.clientX - s.dx, 8), window.innerWidth - 52);
    const ny = Math.min(Math.max(e.clientY - s.dy, 8), window.innerHeight - 52);
    if (Math.abs(nx - pos!.x) > 4 || Math.abs(ny - pos!.y) > 4) s.moved = true;
    setPos({ x: nx, y: ny });
  };

  const onPointerUp = () => {
    const s = dragState.current;
    if (!s.dragging) return;
    s.dragging = false;
    if (s.moved) {
      setPos((p) => {
        if (p) browser.storage.local.set({ floatingPos: p }).catch(() => {});
        return p;
      });
    } else {
      onToggle();
    }
  };

  if (!pos) return null;

  return (
    <button
      className={`xc-fab${open ? ' xc-fab-hidden' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      title={open ? '关闭 X Copilot' : '打开 X Copilot'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      ✦
    </button>
  );
}
