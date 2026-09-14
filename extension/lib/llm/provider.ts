import type { GenerateReplyOptions, ReplyCandidate, TweetContext } from '@/types';

export interface LLMStreamHandlers {
  /** 每解析出一条新候选就回调一次（累计列表） */
  onPartial?: (candidates: ReplyCandidate[]) => void;
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
