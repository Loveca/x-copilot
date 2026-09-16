/* probe3：记录「打开/切换帖子」期间 detector 视角下的逐帧状态
   用途：抓瞬态 null（URL 仍指向推文、但 article 已卸载）等时序问题。
   注：原本用于排查「详情页点评论图标重复生成」，该问题已判定为非 bug 结案；
        本脚本作为通用诊断保留 —— 以后遇到「识别/切换帖子时序异常」可复用。

   用法：在 x.com 打开 Console 粘贴 → probeWatch() → 去做那个会出问题的操作 → probeStop() */
(() => {
  const RE = /^\/([^/]+)\/status\/(\d+)/;
  const vis = (el) => !!el && el.getClientRects().length > 0;

  // 复刻 tweet-detector 的判定，逐帧记录
  const snapshot = () => {
    const m = location.pathname.match(RE);
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    let id = null;
    let branch = 'none';
    if (m) {
      branch = 'URL';
      id = articles.length ? m[2] : null; // ← articles 为空时 detector 返回 null
    } else {
      const dlgs = [...document.querySelectorAll('[role="dialog"],[aria-labelledby="modal-header"]')].filter(vis);
      for (const d of dlgs) {
        const a = d.querySelector('article[data-testid="tweet"]');
        if (!a) continue;
        const href = a.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
        id = href.match(/\/status\/(\d+)/)?.[1] ?? 'modal-hash';
        branch = 'Modal';
        break;
      }
      if (!id) branch = 'none(no-dialog)';
    }
    return {
      t: Date.now(),
      path: location.pathname,
      articles: articles.length,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(vis).length,
      id,
      branch,
    };
  };

  window.__log = [];
  window.__stop = false;

  window.probeWatch = async () => {
    __stop = false;
    __log = [];
    console.log('%c[probe3] 记录中… 现在去做那个操作', 'color:#0a0;font-weight:bold');
    const t0 = Date.now();
    let prev = null;
    while (!__stop && Date.now() - t0 < 20000) {
      const s = snapshot();
      const key = s.path + '|' + s.articles + '|' + s.id + '|' + s.branch;
      if (key !== prev) {
        prev = key;
        __log.push(s);
        const flag =
          s.id === null && s.branch === 'URL' && s.articles === 0
            ? '  ⚠️ 瞬态 null（articles=0 但 URL 仍指向推文）→ detector 会发 null'
            : '';
        console.log(
          `[probe3] +${String(Date.now() - t0).padStart(5)}ms  articles=${String(s.articles).padStart(2)}`,
          `dialogs=${s.dialogs}  id=${s.id ?? 'null'}  [${s.branch}]${flag}`
        );
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log('[probe3] 记录结束，共', __log.length, '次状态变化');
    const nulls = __log.filter((s) => s.id === null && s.branch === 'URL');
    console.log(
      nulls.length
        ? `[probe3] 抓到 ${nulls.length} 次「URL 仍在但 articles=0」的瞬态 null`
        : '[probe3] 没抓到瞬态 null —— 走的是另一条路径'
    );
    return __log;
  };

  window.probeStop = () => {
    __stop = true;
  };
  console.log('[probe3] 就绪：probeWatch() 开始记录，probeStop() 结束');
})();
