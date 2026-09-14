export const CSS_TEXT = `
*, *::before, *::after { box-sizing: border-box; }

.xc-host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }

/* X 暗色主题色板：
   bg #000 / surface #16181c / border #2f3336
   text #e7e9ea / muted #71767b / 主操作 = 白底黑字 */

.xc-fab {
  position: fixed;
  z-index: 2147483646;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1px solid #2f3336;
  cursor: pointer;
  background: #000;
  color: #e7e9ea;
  font-size: 20px;
  line-height: 42px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  user-select: none;
  touch-action: none;
  transition: background 0.15s ease, transform 0.15s ease;
}
.xc-fab:hover { background: #16181c; transform: scale(1.06); }
.xc-fab:active { transform: scale(0.96); }

.xc-panel {
  position: fixed;
  z-index: 2147483645;
  top: 16px; right: 16px; bottom: 16px;
  width: 360px;
  display: flex;
  flex-direction: column;
  background: #000;
  color: #e7e9ea;
  border-radius: 16px;
  border: 1px solid #2f3336;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75);
  overflow: hidden;
}

.xc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #2f3336;
  flex-shrink: 0;
}
.xc-logo {
  width: 26px; height: 26px; border-radius: 8px;
  background: #e7e9ea;
  color: #000; font-size: 14px; line-height: 26px; text-align: center;
  flex-shrink: 0;
}
.xc-title { font-size: 15px; font-weight: 700; flex: 1; color: #e7e9ea; }
.xc-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #71767b; padding: 4px 8px; border-radius: 9999px;
}
.xc-close:hover { background: #16181c; color: #e7e9ea; }

.xc-body { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }
.xc-body::-webkit-scrollbar { width: 8px; }
.xc-body::-webkit-scrollbar-thumb { background: #2f3336; border-radius: 4px; }

.xc-tweet-card {
  background: #16181c;
  border: 1px solid #2f3336;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.xc-tweet-author { font-size: 12px; font-weight: 700; color: #e7e9ea; margin-bottom: 4px; }
.xc-tweet-text { font-size: 13px; line-height: 1.5; color: #71767b; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.xc-generate-btn {
  width: 100%;
  border: none;
  border-radius: 9999px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 700;
  color: #000;
  cursor: pointer;
  background: #e7e9ea;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.xc-generate-btn:hover { background: #d7dbdc; }
.xc-generate-btn:disabled { opacity: 0.4; cursor: default; }

.xc-empty, .xc-error {
  text-align: center;
  font-size: 13px;
  color: #71767b;
  padding: 20px 8px;
  line-height: 1.6;
}
.xc-error { color: #f4212e; }

.xc-card {
  border: 1px solid #2f3336;
  border-radius: 12px;
  padding: 10px 12px;
  margin-top: 10px;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.xc-card:hover { background: #16181c; border-color: #536471; }
.xc-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.xc-badge {
  font-size: 11px;
  font-weight: 700;
  color: #e7e9ea;
  background: #16181c;
  border: 1px solid #2f3336;
  border-radius: 9999px;
  padding: 2px 10px;
}
.xc-card-text { font-size: 13px; line-height: 1.55; color: #e7e9ea; white-space: pre-wrap; word-break: break-word; }
.xc-fill-btn {
  margin-top: 8px;
  border: 1px solid #536471;
  background: transparent;
  color: #e7e9ea;
  border-radius: 9999px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}
.xc-fill-btn:hover { background: #e7e9ea; border-color: #e7e9ea; color: #000; }
.xc-fill-btn.ok { border-color: #e7e9ea; color: #e7e9ea; background: #16181c; }

.xc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid #2f3336;
  flex-shrink: 0;
  background: #000;
}
.xc-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: #71767b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 9999px;
  transition: all 0.15s ease;
}
.xc-settings-btn:hover { background: #16181c; color: #e7e9ea; }
.xc-footer-hint { font-size: 11px; color: #536471; }

.xc-toast {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  background: #e7e9ea;
  color: #000;
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
  border: 2px solid rgba(0, 0, 0, 0.25);
  border-top-color: #000;
  border-radius: 50%;
  vertical-align: -2px;
  margin-right: 6px;
  animation: xc-spin 0.8s linear infinite;
}
@keyframes xc-spin { to { transform: rotate(360deg); } }
`;
