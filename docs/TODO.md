# TODO

## [BUG] 设置页拖拽排序不生效（已改用上下箭头，拖拽待排查）

**状态**：暂时用上下箭头按钮替代，拖拽逻辑保留问题记录待查。

### 现象

回复风格列表的拖拽排序无任何反应（按住手柄拖动，行不动、不换位、不落盘）。

### 已尝试

1. HTML5 原生 DnD（`draggable` + `dragstart/dragover/drop/dragend`）——完全无反应，怀疑事件被行内表单控件（开关、按钮、checkbox）吞掉。
2. pointer 事件方案（手柄 `pointerdown` + document `pointermove/pointerup` + 实时换位）——**用户实测仍不生效**。

### 待排查方向

- 是否 `pointerdown` 的 `e.preventDefault()` 阻止了后续事件，或 handle 元素被 `renderStyles()` 重建导致监听丢失
- 是否 Chrome 扩展 options 页（chrome-extension:// 上下文）对 pointer 事件有额外限制
- 建议：先加 `console.log` 在 pointerdown/pointermove 里确认事件是否真的触发，再决定是事件层还是重排逻辑的问题
- 参考实现：也可以完全不依赖拖拽，改成"点击进入排序模式，点击目标位置交换"（无手势依赖，最稳）

### 相关提交

- `f3023a7` 拖拽改用 pointer 事件（未解决）
- 上下箭头方案为当前的可用实现

---

## [BUG] 详情页点评论图标会重复触发生成（未解决）

**状态**：待解决。两次修复尝试（32c0441 / 964cffd）均无效，代码已回滚到 32c0441 状态（仅保留 null 确认期，无幂等保护）。

### 现象

进入帖子详情页（URL 为 `/handle/status/<id>`），Panel 自动生成一次评论后，**点击评论图标弹出 Reply Modal 会再次触发生成**。预期：URL 和 id 都没变，应完全静默复用已有结果。

注意：`/home` 时间线里点评论图标 → Modal 检测 + 自动生成，这条链路是正常的。只有详情页的重复触发有问题。

### 已排除 / 已尝试

1. **32c0441**：瞬态 null 确认期（400ms 复查）——原假设是 Modal 挂载瞬间 article 全部卸载导致误判离开。无效。
2. **964cffd**：`inFlightIdRef` 同 id 在途幂等跳过 + 离开不取消在途生成。**理论上任何同 id 重复触发都会被跳过，但用户实测仍然重新生成**。已回滚。

### 关键疑点

964cffd 的幂等保护生效的前提是「重复触发走 `runGenerate` 且 `target.id` 一致」。仍然重新生成意味着存在未知的第三条路径，候选假设：

- **H1：详情页点评论图标时 URL 变化了**（如 pushState 到 `/i/web/status/<id>` 或其他变体）→ id 相同但 detector 判定「变化」→ emit → 缓存未命中（首次生成还在途中）→ 再次生成。**验证方法最简单**：看 Console 日志里 `current tweet changed:` 是否在点评论图标时出现、后面的 id 是什么。
- **H2：Modal 里的 article 被_detector 当成了另一条 tweet**（比如 reply modal 的 article 结构不同导致 id 提取不同）——但详情页 URL 优先，不该走 Modal 分支。除非 URL 同时变化（与 H1 合并）。
- **H3：App 的 detector useEffect 因依赖变化重建**，新 detector 的 `lastId` 从 null 起步，初始 check 重新 emit 并触发自动生成。`runGenerate`/`cancelGeneration` 都是 `useCallback([])`，理论上稳定，但需确认。

### 下一步（按顺序）

1. 刷新扩展 + X 页面，打开 Console 过滤 `[X Copilot]`，复现一次：进帖子 → 生成完成 → 点评论图标。
2. 完整记录日志序列，重点看：
   - 点评论图标那一刻是否出现 `current tweet changed:`
   - 出现的话，新 id 和之前的 id 是否一致（不一致 → H1/H2；一致但依然生成了 → H3）
3. 根据日志定位到具体层后修复：
   - H1/H2 → 在 detector 里对 `/i/web/status/` 或 URL 变体做归一化
   - H3 → 用 ref 持有 detector，或把 observe 的 emit 改为模块级单例
4. 修复时建议**同时保留两层防护**：检测层正确归一化 + 动作层幂等（964cffd 的 inFlightIdRef 思路本身没错，单独回滚它可能只是因为它防的不是这条路径）。

### 相关提交（历史已丢失，见下方说明）

- `a5de818` reply modal 检测（正常工作的部分，勿动）
- `ef87262` 检测加固 + `[X Copilot]` console.debug 日志（排查靠它）
- `32c0441` null 确认期（保留中）
- `964cffd` 幂等保护（已回滚，待定位后带根因重新引入）
