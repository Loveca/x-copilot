import type { ReplyCandidate } from '@/types';

interface Props {
  style: string;
  items: ReplyCandidate[];
  filledId: string | null;
  onFill: (reply: ReplyCandidate) => void;
}

/** 一个风格一张卡，卡内列出该风格的多条候选 */
export function ReplyCard({ style, items, filledId, onFill }: Props) {
  return (
    <div className="xc-card">
      <div className="xc-card-head">
        <span className="xc-badge">{style}</span>
      </div>
      <div className="xc-card-items">
        {items.map((reply) => {
          const filled = filledId === reply.id;
          return (
            <div key={reply.id} className="xc-cand">
              <div className="xc-cand-text">{reply.text}</div>
              <button
                className={`xc-fill-btn small${filled ? ' ok' : ''}`}
                onClick={() => onFill(reply)}
              >
                {filled ? '✓ 已填入' : '填入'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
