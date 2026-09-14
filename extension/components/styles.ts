export const CSS_TEXT = `
*, *::before, *::after { box-sizing: border-box; }

.xc-host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }

.xc-fab {
  position: fixed;
  z-index: 2147483646;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #1d9bf0 0%, #4d6bfe 100%);
  color: #fff;
  font-size: 20px;
  line-height: 44px;
  text-align: center;
  box-shadow: 0 4px 14px rgba(29, 155, 240, 0.45), 0 1px 3px rgba(0,0,0,0.2);
  user-select: none;
  touch-action: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.xc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(29, 155, 240, 0.55), 0 1px 3px rgba(0,0,0,0.25); }
.xc-fab:active { transform: scale(0.96); }

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
  border: 1px solid #e6e9ec;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.xc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #eff1f3;
  flex-shrink: 0;
}
.xc-logo {
  width: 26px; height: 26px; border-radius: 8px;
  background: linear-gradient(135deg, #1d9bf0 0%, #4d6bfe 100%);
  color: #fff; font-size: 14px; line-height: 26px; text-align: center;
  flex-shrink: 0;
}
.xc-title { font-size: 15px; font-weight: 700; flex: 1; }
.xc-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #8b98a5; padding: 4px 8px; border-radius: 8px;
}
.xc-close:hover { background: #f0f3f4; color: #0f1419; }

.xc-body { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }

.xc-tweet-card {
  background: #f7f9f9;
  border: 1px solid #eff1f3;
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
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #1d9bf0 0%, #4d6bfe 100%);
  transition: opacity 0.15s ease;
}
.xc-generate-btn:hover { opacity: 0.9; }
.xc-generate-btn:disabled { opacity: 0.5; cursor: default; }

.xc-empty, .xc-error {
  text-align: center;
  font-size: 13px;
  color: #8b98a5;
  padding: 20px 8px;
  line-height: 1.6;
}
.xc-error { color: #c0392b; }

.xc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid #eff1f3;
  flex-shrink: 0;
  background: #fbfcfc;
}
.xc-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: #8b98a5;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 8px;
  transition: all 0.15s ease;
}
.xc-settings-btn:hover { background: #f0f3f4; color: #1d9bf0; }
.xc-footer-hint { font-size: 11px; color: #a8b3bd; }

.xc-card {
  border: 1px solid #e6e9ec;
  border-radius: 12px;
  padding: 10px 12px;
  margin-top: 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.xc-card:hover { border-color: #c7dce9; box-shadow: 0 2px 8px rgba(29, 155, 240, 0.08); }
.xc-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.xc-badge {
  font-size: 11px;
  font-weight: 700;
  color: #1d9bf0;
  background: rgba(29, 155, 240, 0.1);
  border-radius: 6px;
  padding: 2px 8px;
}
.xc-card-text { font-size: 13px; line-height: 1.55; color: #0f1419; white-space: pre-wrap; word-break: break-word; }
.xc-fill-btn {
  margin-top: 8px;
  border: 1px solid #cfd9de;
  background: #fff;
  color: #0f1419;
  border-radius: 9999px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}
.xc-fill-btn:hover { background: #0f1419; border-color: #0f1419; color: #fff; }
.xc-fill-btn.ok { border-color: #00a06a; color: #00a06a; background: #f0faf5; }

.xc-toast {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  background: rgba(15, 20, 25, 0.92);
  color: #fff;
  font-size: 12px;
  border-radius: 9999px;
  padding: 7px 16px;
  white-space: nowrap;
  animation: xc-fade-in 0.2s ease;
}
@keyframes xc-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.xc-spin {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  vertical-align: -2px;
  margin-right: 6px;
  animation: xc-spin 0.8s linear infinite;
}
@keyframes xc-spin { to { transform: rotate(360deg); } }
`;
