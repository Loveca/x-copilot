/**
 * 提示词模板：全部以 Markdown 源文件维护在 extension/prompts/，
 * 构建期由 Vite 的 `?raw` 内联成字符串常量（运行时零 IO、零异步）。
 *
 * 改提示词 = 改 .md 文件 → 重新构建。开发时 HMR 自动生效。
 *
 * 模板语法（极简，不引入模板引擎）：
 *   {{var}}                变量替换（取不到则替换成空串）
 *   {{#if var}}...{{/if}}  变量为"非空"时保留该段，否则整段删除
 *   不支持嵌套 {{#if}}（模板里请避免嵌套）
 */
import genReplyTpl from '@/prompts/gen_reply.md?raw';
import genPostTpl from '@/prompts/gen_post.md?raw';
import genQuickTopicTpl from '@/prompts/gen_quick_topic.md?raw';

export const PROMPT_TEMPLATES = {
  /** 回复模式 */
  reply: genReplyTpl,
  /** 发帖模式 */
  post: genPostTpl,
  /** 灵感区「随便聊聊」的话题生成 */
  quickTopic: genQuickTopicTpl,
} as const;

export type PromptTemplateName = keyof typeof PROMPT_TEMPLATES;

export type TemplateVars = Record<string, string | number | undefined | null>;

function isTruthy(v: TemplateVars[string]): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/** 渲染单个模板字符串 */
export function renderTemplate(tpl: string, vars: TemplateVars): string {
  // 1) 条件块：{{#if key}} … {{/if}}（非贪婪，不支持嵌套）
  const withIf = tpl.replace(
    /\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key: string, body: string) => (isTruthy(vars[key]) ? body : '')
  );
  // 2) 变量替换
  const filled = withIf.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
  // 3) 清掉因条件块删除后残留的多余空行，并去掉首尾空白
  return filled.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 按名字渲染模板 */
export function renderPrompt(name: PromptTemplateName, vars: TemplateVars): string {
  return renderTemplate(PROMPT_TEMPLATES[name], vars);
}
