import type { GenerateReplyOptions, ReplyCandidate, TweetContext } from '@/types';

export interface LLMStreamHandlers {
  /** 每解析出一条新候选就回调一次（累计列表） */
  onPartial?: (candidates: ReplyCandidate[]) => void;
  /** 生成结束后的耗时拆解 */
  onTiming?: (timing: LLMStreamTiming) => void;
}

export interface LLMStreamTiming {
  /** 首个数据分片到达（含网络往返，近似 TTFT） */
  ttfbMs: number;
  /** 第一条候选解析完成 */
  firstCandidateMs: number;
  /** 全部生成完成 */
  totalMs: number;
}

export interface LLMProvider {
  generateReplies(
    context: TweetContext,
    options?: GenerateReplyOptions
  ): Promise<ReplyCandidate[]>;

  /** 流式生成：候选按到达顺序逐条回调，返回最终完整列表 */
  generateRepliesStream?(
    context: TweetContext,
    options: GenerateReplyOptions | undefined,
    handlers: LLMStreamHandlers
  ): Promise<ReplyCandidate[]>;
}
