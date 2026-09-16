(() => {
  // ═══ A. URL 监听（Bug 2）═══
  if (!window.__probeUrlArmed) {
    window.__probeUrlArmed = true;
    for (const n of ['pushState', 'replaceState']) {
      const orig = history[n].bind(history);
      history[n] = (...a) => { console.log('[probe] URL变化', n, location.href); return orig(...a); };
    }
    window.addEventListener('popstate', () => console.log('[probe] URL变化 popstate', location.href));
  }

  const RE = /^\/([^\/]+)\/status\/(\d+)/;
  const vis = (el) => !!el && el.getClientRects().length > 0;

  // ═══ B. 决定性：detector 现在会把这条 URL 认成什么 id ═══
  window.probeId = () => {
    const m = location.pathname.match(RE);
    const r = {
      pathname: location.pathname,
      reMatched: !!m,
      urlBranchId: m ? m[2] : null,
      branch: m ? 'URL 分支（正常）' : '⚠️ Modal 兜底 getReplyModalTweet()',
    };
    if (!m) {
      const dlg = [...document.querySelectorAll('[role="dialog"],[aria-labelledby="modal-header"]')].filter(vis);
      for (const d of dlg) {
        const a = d.querySelector('article[data-testid="tweet"]');
        if (!a) continue;
        const href = a.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
        r.modalId = href.match(/\/status\/(\d+)/)?.[1] ?? '(拿不到 → 合成 modal-<hash>，可能每帧都变)';
        break;
      }
    }
    console.log('[probe] id 判定', r);
    return r;
  };

  // ═══ C. composer 到底用哪个编辑器（查祖先链，别信全局命中）═══
  const isReply = (el) => /reply|回帖|回复|回覆|发布你的回复/.test(
    ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-placeholder') || '')).toLowerCase());

  window.probeFind = () => {
    const all = [...document.querySelectorAll('div[contenteditable="true"][role="textbox"]')].filter(vis);
    const inDlg = all.filter((b) => b.closest('[role="dialog"]'));
    const pool = inDlg.length ? inDlg : all;
    return pool.find(isReply) ?? pool[pool.length - 1] ?? null;
  };

  window.probeEditor = () => {
    const el = window.probeFind();
    const chain = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      chain.push({ cls: (typeof n.className === 'string' ? n.className : '').slice(0, 60), ce: n.getAttribute?.('contenteditable') });
      if (chain.length >= 12) break;
    }
    const r = {
      draftAncestor: chain.some((c) => /DraftEditor/.test(c.cls)),
      pmAncestor: chain.some((c) => /ProseMirror/.test(c.cls)),
      composerAttrs: el ? [...el.attributes].map((a) => a.name).join(',') : null,
      hasDraftContents: !!el?.__draftEditorContents,
      chain: chain.filter((c) => c.cls).slice(0, 6),
    };
    console.log('[probe] 编辑器身份', r);
    return r;
  };

  // ═══ D. 作用域对照：fill 选哪个框 / 验收读哪个按钮 ═══
  const btnSel = '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]';
  const st = (b) => (b ? (!b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true') : null);
  window.probeBtn = (el) => {
    const scope = el?.closest('[role="dialog"]');
    return {
      scoped: scope ? [...scope.querySelectorAll(btnSel)].filter(vis)[0] ?? null : null,
      global: [...document.querySelectorAll(btnSel)].filter(vis)[0] ?? null,
    };
  };

  window.probeComposers = () => {
    const el = window.probeFind();
    const { scoped, global } = window.probeBtn(el);
    const r = {
      visibleComposers: [...document.querySelectorAll('div[contenteditable="true"][role="textbox"]')].filter(vis).length,
      target: el ? { aria: el.getAttribute('aria-label'), inDialog: !!el.closest('[role="dialog"]') } : null,
      scopedBtn: scoped ? { testid: scoped.getAttribute('data-testid'), enabled: st(scoped) } : null,
      globalBtn: global ? { testid: global.getAttribute('data-testid'), enabled: st(global), inDialog: !!global.closest('[role="dialog"]') } : null,
    };
    console.log('[probe] 作用域对照', r);
    if (scoped && global && scoped !== global && st(scoped) !== st(global)) {
      console.warn('[probe] ⚠️ 两个按钮状态不一致 → fill.ts 的验收探针取错了目标');
    }
    return r;
  };

  // ═══ E. 四策略实测（清空按 DraftJS 配方连做两遍）═══
  const clearTwice = (el) => {
    for (let i = 0; i < 2; i++) {
      try { document.execCommand('selectAll', false); document.execCommand('delete', false); } catch {}
    }
  };
  const STRATS = [
    ['1-全选+insertText', (e, t) => { e.focus(); try { document.execCommand('selectAll', false); } catch {} document.execCommand('insertText', false, t); }],
    ['2-合成paste', (e, t) => {
      const dt = new DataTransfer(); dt.setData('text/plain', t);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      if (!ev.clipboardData) Object.defineProperty(ev, 'clipboardData', { value: dt, configurable: true });
      console.log('[probe]   paste isTrusted =', ev.isTrusted);
      e.dispatchEvent(ev);
    }],
    ['3-逐行+insertLineBreak', (e, t) => {
      const lines = t.split('\n'); e.focus();
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) document.execCommand('insertLineBreak');
        if (lines[i]) document.execCommand('insertText', false, lines[i]);
      }
    }],
    ['4-分块写入(dev.to配方,不含换行)', (e, t) => {
      e.focus(); clearTwice(e);
      const flat = t.replace(/\n/g, '');
      for (let i = 0; i < flat.length; i += 25) document.execCommand('insertText', false, flat.slice(i, i + 25));
    }],
  ];

  window.probeFill = async (text) => {
    text = text ?? '第一行\n第二行\n\n第三行';
    const el = window.probeFind();
    if (!el) return console.warn('[probe] 没找到 composer —— 先点开回复框 / 发帖框');
    const squash = (s) => s.replace(/[\s​]+/g, '');
    console.log('[probe] 目标框', el.getAttribute('aria-label'), '| inDialog', !!el.closest('[role="dialog"]'));

    for (const [name, run] of STRATS) {
      el.focus(); clearTwice(el);
      await new Promise((r) => setTimeout(r, 80));
      const cleared = st(window.probeBtn(el).scoped);
      try { run(el, text); } catch (e) { console.warn('[probe] 策略抛错', name, e); }
      await new Promise((r) => setTimeout(r, 200));
      console.log('[probe] ' + name, {
        clearedEnabled: cleared,
        filledEnabled: st(window.probeBtn(el).scoped),
        textMatch: squash(el.textContent || '') === squash(text),
        brCount: el.querySelectorAll('br').length,
        rawNewline: [...el.childNodes].some((n) => (n.textContent || '').includes('\n')),
        html: el.innerHTML.slice(0, 160),
      });
      console.log('[probe] ↑★手动按 3~4 次退格★ 能删 = 这条被 DraftJS 认账（2500ms 后测下一条）');
      await new Promise((r) => setTimeout(r, 2500));
    }
  };

  console.log('[probe2] 就绪。顺序：点开评论图标 → probeId() → probeComposers() → probeEditor() → probeFill()');
})();
