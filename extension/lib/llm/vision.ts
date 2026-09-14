/**
 * 帖子图片 → 模型可用的 data URL。
 *
 * 关于模型能力：DeepSeek V4.1 Flash（模型名 `deepseek-flash`）与 Gemini 全系列都是
 * 原生多模态，直接吃图；但第三方托管 / 老模型可能是纯文本的（传图会 400）。
 * 因此这里不做能力白名单，一律尝试带图，由 openai-compat 在收到 400 时降级重试。
 */

/** 单次请求最多带几张图（与取图端上限一致） */
export const MAX_VISION_IMAGES = 4;

const IMAGE_FETCH_TIMEOUT_MS = 8_000;

/**
 * 并行把图片取回来编码成 data URL。
 * - 单张失败 / 超时 → 跳过该张，不阻断整条生成（带图是增强，不是必需）
 * - `credentials: 'omit'`：帖子图是公开资源，不携带任何浏览器凭据
 */
export async function fetchImagesAsDataUrls(urls: string[]): Promise<string[]> {
  const targets = urls.slice(0, MAX_VISION_IMAGES);
  if (targets.length === 0) return [];

  const results = await Promise.all(
    targets.map(async (url): Promise<string | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.size) return null;
        return `data:${blob.type || 'image/jpeg'};base64,${toBase64(await blob.arrayBuffer())}`;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const ok = results.filter((r): r is string => r !== null);
  if (ok.length !== targets.length) {
    console.debug('[X Copilot] images attached:', ok.length, '/', targets.length);
  }
  return ok;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // 分块避免超长参数列表
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
