import type { ReplyCandidate } from '@/types';

interface Props {
  style: string;
  items: ReplyCandidate[];
  filledId: string | null;
  onFill: (reply: ReplyCandidate) => void;
}

/**
 * 一个风格一张卡，卡内列出该风格的多条候选。
 *
 * ⚠️ 只用于**回复模式**。发帖模式走 `CandidateRow`（列表行）。
 * 两套并存是用户明确选的（2026-09-15）：按发帖设计稿改成列表行后，
 * 回复模式的观感变差，所以回复回退成卡片，发帖保持列表行。
 */
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
