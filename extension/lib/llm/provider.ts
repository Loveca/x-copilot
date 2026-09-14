import type { GenerateReplyOptions, ReplyCandidate, TweetContext } from '@/types';

export interface LLMProvider {
  generateReplies(
    context: TweetContext,
    options?: GenerateReplyOptions
  ): Promise<ReplyCandidate[]>;
}
