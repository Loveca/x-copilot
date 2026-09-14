import type { GenerateOptions, ReplyCandidate, TweetContext } from '@/types';

export interface LLMStreamHandlers {
  /** 每解析出一条新候选就回调一次（累计列表） */
  onPartial?: (candidates: ReplyCandidate[]) => void;
  /** 生成过程中的实时进度（已节流） */
  onProgress?: (progress: LLMStreamProgress) => void;
  /** 生成结束后的耗时拆解 */
  onTiming?: (timing: LLMStreamTiming) => void;
}

export interface LLMStreamProgress {
  /** 从请求发出算起的已耗时 */
  elapsedMs: number;
  /** 已收到的正文（content）字符数 */
  receivedChars: number;
  /** 已收到的思维链（reasoning_content）字符数 —— 说明模型在「想」而不是「哑火」 */
  reasoningChars: number;
}

export interface LLMStreamTiming {
  /** 首个 SSE 分片到达（≈连接与网关就绪，不含模型生成） */
  ttfbMs: number;
  /** 模型吐出的第一个正文字符（真正的 TTFT） */
  firstContentMs: number;
  /** 第一条候选解析完成 */
  firstCandidateMs: number;
  /** 全部生成完成 */
  totalMs: number;
  /** 服务端实际使用的模型名（从响应里回读，用于确认配置是否生效） */
  model?: string;
  /** 思维链字符数（若模型返回） */
  reasoningChars?: number;
  /** 正文总字符数 */
  receivedChars?: number;
  /** 本次请求实际随消息发出的图片张数（模型不认图降级重试后为 0） */
  imageCount?: number;
}

export interface LLMProvider {
  generateReplies(
    context: TweetContext,
    options?: GenerateOptions
  ): Promise<ReplyCandidate[]>;

  /** 流式生成：候选按到达顺序逐条回调，返回最终完整列表 */
  generateRepliesStream?(
    context: TweetContext,
    options: GenerateOptions | undefined,
    handlers: LLMStreamHandlers
  ): Promise<ReplyCandidate[]>;
}
