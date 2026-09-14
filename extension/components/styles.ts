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
  width: 360px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #0f1419;
  border-radius: 16px;
  border: 1px solid #eff3f4;
  box-shadow: 0 12px 40px rgba(15, 20, 25, 0.16);
  overflow: hidden;
}

.xc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #eff3f4;
  flex-shrink: 0;
}
.xc-logo {
  width: 26px; height: 26px; border-radius: 8px;
  background: #0f1419;
  color: #ffffff; font-size: 14px; line-height: 26px; text-align: center;
  flex-shrink: 0;
}
.xc-title { font-size: 15px; font-weight: 700; flex: 1; color: #0f1419; }
.xc-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #536471; padding: 4px 8px; border-radius: 9999px;
}
.xc-close:hover { background: #f7f9f9; color: #0f1419; }

.xc-body { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }
.xc-body::-webkit-scrollbar { width: 8px; }
.xc-body::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 4px; }

.xc-tweet-card {
  background: #f7f9f9;
  border: 1px solid #eff3f4;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.xc-tweet-author { font-size: 12px; font-weight: 700; color: #0f1419; margin-bottom: 4px; }
.xc-tweet-text { font-size: 13px; line-height: 1.5; color: #536471; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.xc-generate-btn {
  width: 100%;
  border: none;
  border-radius: 9999px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  cursor: pointer;
  background: #0f1419;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.xc-generate-btn:hover { background: #272c30; }
.xc-generate-btn:disabled { opacity: 0.4; cursor: default; }

.xc-empty, .xc-error {
  text-align: center;
  font-size: 13px;
  color: #8b98a5;
  padding: 20px 8px;
  line-height: 1.6;
}
.xc-error { color: #f4212e; }

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
.xc-cand-text { flex: 1; min-width: 0; font-size: 13px; line-height: 1.55; color: #0f1419; white-space: pre-wrap; word-break: break-word; }

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

.xc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
