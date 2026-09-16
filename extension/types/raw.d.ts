/**
 * Vite `?raw` 导入的类型声明。
 * 让 TS 知道 `import tpl from './x.md?raw'` 拿到的是 string。
 * （不依赖 vite/client，避免 tsconfig types 未包含它时报错）
 */
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
