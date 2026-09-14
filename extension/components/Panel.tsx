import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Panel({ open, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="xc-panel">
      <div className="xc-header">
        <div className="xc-logo">✦</div>
        <div className="xc-title">X Copilot</div>
        <button className="xc-close" onClick={onClose} title="关闭">
          ✕
        </button>
      </div>
      <div className="xc-body">{children}</div>
    </div>
  );
}
