import type { ReplyCandidate } from '@/types';

interface Props {
  reply: ReplyCandidate;
  filled: boolean;
  onFill: () => void;
}

export function ReplyCard({ reply, filled, onFill }: Props) {
  return (
    <div className="xc-card">
      <div className="xc-card-head">
        <span className="xc-badge">{reply.style}</span>
      </div>
      <div className="xc-card-text">{reply.text}</div>
      <button className={`xc-fill-btn${filled ? ' ok' : ''}`} onClick={onFill}>
        {filled ? '✓ 已填入' : '填入'}
      </button>
    </div>
  );
}
