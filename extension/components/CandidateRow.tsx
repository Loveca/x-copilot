import type { ReplyCandidate } from '@/types';

interface Props {
  candidate: ReplyCandidate;
  /** 是否已填入（整行高亮 + 右侧变勾） */
  filled: boolean;
  onFill: (reply: ReplyCandidate) => void;
}

/**
 * 一条候选。样式对齐面板设计稿：
 * 上方小字风格标签，下方正文，右侧 chevron，**点整行即填入**。
 * （button 内只能用 phrasing content，所以子元素一律用 span + display:block）
 */
export function CandidateRow({ candidate, filled, onFill }: Props) {
  return (
    <button
      type="button"
      className={'xc-cand-row' + (filled ? ' filled' : '')}
      onClick={() => onFill(candidate)}
      title={filled ? '已填入发帖框' : '点这一行填入发帖框'}
    >
      <span className="xc-cand-row-body">
        <span className="xc-cand-row-style">{candidate.style}</span>
        <span className="xc-cand-row-text">{candidate.text}</span>
      </span>
      <span className="xc-cand-row-arrow" aria-hidden="true">
        {filled ? '✓' : '›'}
      </span>
    </button>
  );
}
