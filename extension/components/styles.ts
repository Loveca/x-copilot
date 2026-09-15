export const CSS_TEXT = `
*, *::before, *::after { box-sizing: border-box; }

.xc-host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }

/* X 浅色主题色板：
   bg #fff / surface #f7f9f9 / border #eff3f4 (强边框 #cfd9de)
   text #0f1419 / muted #536471 / hint #8b98a5 / error #f4212e
   主操作 = 黑底白字（对齐 X 浅色模式的 Post 按钮） */

.xc-fab {
  position: fixed;
  z-index: 2147483646;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1px solid #cfd9de;
  cursor: pointer;
  background: #ffffff;
  color: #0f1419;
  font-size: 20px;
  line-height: 42px;
  text-align: center;
  box-shadow: 0 4px 14px rgba(15, 20, 25, 0.18);
  user-select: none;
  touch-action: none;
  transition: background 0.15s ease, transform 0.18s ease, opacity 0.18s ease;
}
.xc-fab:hover { background: #f7f9f9; transform: scale(1.06); }
.xc-fab:active { transform: scale(0.96); }
/* Panel 打开时收起悬浮球，避免与面板同时悬浮 */
.xc-fab.xc-fab-hidden {
  opacity: 0;
  transform: scale(0.6);
  pointer-events: none;
}

.xc-panel {
  position: fixed;
  z-index: 2147483645;
  top: 16px; right: 16px; bottom: 16px;
  width: 400px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #0f1419;
  border-radius: 16px;
  border: 1px solid #eff3f4;
  box-shadow: 0 12px 40px rgba(15, 20, 25, 0.16);
  overflow: hidden;
}

/* 设计稿里头区与内容之间没有分隔线，靠留白区分 */
.xc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 18px 8px;
  flex-shrink: 0;
}
.xc-logo {
  width: 26px; height: 26px; border-radius: 8px;
  background: #0f1419;
  color: #ffffff; font-size: 14px; line-height: 26px; text-align: center;
  flex-shrink: 0;
}
.xc-title { font-size: 15px; font-weight: 700; flex: 1; color: #0f1419; }
/* 模式切换：两个独立胶囊，当前项黑底白字（无外框，对齐设计稿） */
.xc-mode {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.xc-mode-btn {
  border: none;
  background: transparent;
  color: #536471;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.xc-mode-btn:hover:not(:disabled) { background: #f7f9f9; color: #0f1419; }
.xc-mode-btn:disabled { color: #cfd9de; cursor: default; }
.xc-mode-btn.active { background: #0f1419; color: #ffffff; }

.xc-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #536471; padding: 4px 8px; border-radius: 9999px;
}
.xc-close:hover { background: #f7f9f9; color: #0f1419; }

.xc-body { flex: 1; overflow-y: auto; padding: 6px 18px 18px; }
.xc-body::-webkit-scrollbar { width: 8px; }
.xc-body::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 4px; }

.xc-timing {
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: #8b98a5;
  font-variant-numeric: tabular-nums;
}

/* 生成中的实时进度：秒表一直在走，避免看起来像卡死 */
.xc-progress {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  color: #536471;
  font-variant-numeric: tabular-nums;
}
.xc-progress-time {
  display: inline-block;
  min-width: 40px;
  padding: 1px 7px;
  border-radius: 9999px;
  background: #f7f9f9;
  border: 1px solid #eff3f4;
  color: #0f1419;
  font-weight: 700;
}

.xc-tweet-card {
  background: #f7f9f9;
  border: 1px solid #eff3f4;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.xc-tweet-tag {
  font-size: 11px;
  font-weight: 700;
  color: #536471;
  margin-bottom: 5px;
}
.xc-tweet-author { font-size: 12px; font-weight: 700; color: #0f1419; margin-bottom: 4px; }
.xc-tweet-text { font-size: 13px; line-height: 1.5; color: #536471; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* 输入框：细框线 + 12px 圆角。
   之前按设计稿做成完全无边框，但在白面板上边界感太弱，改回细框（2026-09-15） */
.xc-intent {
  width: 100%;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #cfd9de;
  border-radius: 12px;
  background: #ffffff;
  color: #0f1419;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s ease;
  /* 多行输入：宽度固定，高度随文字增长（上限 132px，超出后内部滚动） */
  resize: none;
  overflow-y: auto;
  min-height: 40px;
  max-height: 132px;
  display: block;
}
.xc-intent::-webkit-scrollbar { width: 8px; }
.xc-intent::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 4px; }
.xc-intent::placeholder { color: #8b98a5; }
.xc-intent:focus { border-color: #0f1419; }

/* ── 「灵感来源」区（Post V1）：水贴 / Feed热帖 / 热点 ───────── */

/* 状态 B：出结果后灵感区收起，只留这一行入口 */
.xc-idea-back {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: #536471;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  padding: 8px 0;
  margin: 2px 0 12px;
  cursor: pointer;
  transition: color 0.15s ease;
}
.xc-idea-back:hover { color: #0f1419; }

/* 来源切换：标题一行、胶囊一行；胶囊无边框，选中项黑底白字 */
.xc-idea-rail { margin: 4px 0 8px; }
.xc-idea-title {
  display: block;
  font-size: 12px;
  color: #8b98a5;
  margin-bottom: 4px;
}
.xc-idea-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  /* 抵消胶囊自身的左右内边距，让首个图标与标题左对齐 */
  margin-left: -11px;
}
.xc-idea-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: #536471;
  border-radius: 9999px;
  padding: 7px 11px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.xc-idea-chip svg { flex-shrink: 0; }
.xc-idea-chip:hover:not(:disabled) { background: #f7f9f9; color: #0f1419; }
.xc-idea-chip:disabled { opacity: 0.45; cursor: default; }
.xc-idea-chip.active,
.xc-idea-chip.active:hover { background: #0f1419; color: #ffffff; }

/* 「换一批」：推到行尾，只在「水贴」tab 出现 */
.xc-idea-refresh {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  /* 抵消自身右内边距，让文字右缘与内容区对齐 */
  margin-right: -10px;
  border: none;
  background: transparent;
  color: #536471;
  border-radius: 9999px;
  padding: 7px 10px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.xc-idea-refresh svg { flex-shrink: 0; }
.xc-idea-refresh:hover:not(:disabled) { background: #f7f9f9; color: #0f1419; }
.xc-idea-refresh:disabled { opacity: 0.45; cursor: default; }

/* 展开区（Feed热帖 / 热点） */
.xc-idea-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 10px;
  max-height: 240px;
  overflow-y: auto;
}
.xc-idea-list::-webkit-scrollbar { width: 6px; }
.xc-idea-list::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 3px; }

.xc-idea-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 9px 10px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}
.xc-idea-item:hover { background: #f7f9f9; }
.xc-idea-item-meta { font-size: 11px; font-weight: 700; color: #536471; margin-bottom: 3px; }
.xc-idea-item-text {
  font-size: 13px;
  line-height: 1.45;
  color: #0f1419;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.xc-trend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 9px 10px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}
.xc-trend-item:hover { background: #f7f9f9; }
.xc-trend-rank {
  flex-shrink: 0;
  min-width: 12px;
  font-size: 11px;
  font-weight: 700;
  color: #8b98a5;
}
.xc-trend-topic {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #0f1419;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.xc-trend-cat {
  flex-shrink: 0;
  max-width: 96px;
  font-size: 10px;
  color: #8b98a5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 候选：一个风格一张黑边卡（回复 / 发帖两种模式共用） ─────────
   ⚠️ 与下面的 .xc-cand-row（「随便聊聊」灵感列表）用途不同，别混用。 */
.xc-card {
  border: 1px solid #0f1419;
  border-radius: 12px;
  padding: 10px 12px;
  margin-top: 10px;
  transition: background 0.15s ease;
}
.xc-card:hover { background: #f7f9f9; }
.xc-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.xc-badge {
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  background: #0f1419;
  border: 1px solid #0f1419;
  border-radius: 9999px;
  padding: 2px 10px;
  letter-spacing: 0.01em;
}
.xc-card-text { font-size: 13px; line-height: 1.55; color: #0f1419; white-space: pre-wrap; word-break: break-word; }

/* 同一风格的多条候选合并在一张卡里 */
.xc-cand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #eff3f4;
}
.xc-cand:first-child { border-top: none; padding-top: 2px; }
.xc-cand-text {
  flex: 1;
  min-width: 0;
  /* 15px：与回复模式的候选正文字号统一（2026-09-15 规范） */
  font-size: 15px;
  line-height: 1.55;
  color: #0f1419;
  white-space: pre-wrap;
  word-break: break-word;
}

.xc-fill-btn {
  margin-top: 8px;
  border: 1px solid #cfd9de;
  background: #ffffff;
  color: #0f1419;
  border-radius: 9999px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  white-space: nowrap;
}
.xc-fill-btn.small { margin-top: 0; padding: 5px 12px; }
.xc-fill-btn:hover { background: #0f1419; border-color: #0f1419; color: #ffffff; }
.xc-fill-btn.ok { border-color: #0f1419; color: #ffffff; background: #0f1419; }

/* ── 发帖模式的候选：一条一行，点整行填入（对齐设计稿） ───────── */
.xc-cand-list {
  display: flex;
  flex-direction: column;
  /* 负外边距抵消行内边距，让正文与上方标题左对齐 */
  margin: 6px -8px 0;
}
.xc-cand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 11px 8px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}
.xc-cand-row:hover { background: #f7f9f9; }
.xc-cand-row.filled { background: #f7f9f9; }
.xc-cand-row-body { display: block; flex: 1; min-width: 0; }
.xc-cand-row-style { display: block; font-size: 12px; color: #8b98a5; margin-bottom: 5px; }
.xc-cand-row-text {
  display: block;
  font-size: 15px;
  line-height: 1.5;
  color: #0f1419;
  white-space: pre-wrap;
  word-break: break-word;
}
.xc-cand-row-arrow {
  flex-shrink: 0;
  font-size: 17px;
  line-height: 1;
  color: #8b98a5;
}
.xc-cand-row.filled .xc-cand-row-arrow { color: #0f1419; font-weight: 700; }

.xc-generate-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 13px 0;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  cursor: pointer;
  background: #0f1419;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.xc-generate-btn:hover { background: #272c30; }
.xc-generate-btn:disabled { opacity: 0.4; cursor: default; }

/* Spike 用（仅开发者选项打开时出现） */
.xc-spike-btn {
  width: 100%;
  margin-top: 10px;
  border: 1px dashed #cfd9de;
  background: #ffffff;
  color: #536471;
  border-radius: 10px;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}
.xc-spike-btn:hover { border-color: #0f1419; color: #0f1419; }

.xc-empty, .xc-error {
  text-align: center;
  font-size: 13px;
  color: #8b98a5;
  padding: 20px 8px;
  line-height: 1.6;
}
.xc-error { color: #f4212e; }

.xc-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid #eff3f4;
  flex-shrink: 0;
  background: #ffffff;
}
.xc-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: #536471;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 9999px;
  transition: all 0.15s ease;
}
.xc-settings-btn:hover { background: #f7f9f9; color: #0f1419; }

.xc-toast {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  background: #0f1419;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 9999px;
  padding: 7px 16px;
  max-width: 90%;
  text-align: center;
  animation: xc-fade-in 0.2s ease;
}
@keyframes xc-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.xc-spin {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #ffffff;
  border-radius: 50%;
  vertical-align: -2px;
  margin-right: 6px;
  animation: xc-spin 0.8s linear infinite;
}
@keyframes xc-spin { to { transform: rotate(360deg); } }
`;
