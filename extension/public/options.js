// X Copilot Options 页脚本（外部文件：MV3 CSP 禁止扩展页面使用内联 script）
(function () {
  'use strict';

  var LLM_KEY = 'llmConfig';
  var UI_KEY = 'uiConfig';
  var LLM_DEFAULTS = {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-flash',
    apiKey: '',
    // DeepSeek V4 / Gemini 的思考模式默认开启，写回复时首条候选要等十几秒
    thinking: false,
  };

  // 服务商预设。注意：与 extension/lib/llm/openai-compat.ts 的 detectProvider() 判定口径保持一致
  var PROVIDERS = [
    {
      key: 'deepseek',
      label: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-flash',
      models: ['deepseek-flash', 'deepseek-v4-pro'],
      modelsDesc:
        '默认 deepseek-flash（即 V4.1 Flash，原生支持图片理解，快且便宜）。注意：deepseek-v4-pro 目前被官方全部路由到 V4.1 Flash 并按 Flash 计费，两者实际是同一个模型。',
      keyPlaceholder: 'sk-...',
      keyDesc:
        '在 <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer">DeepSeek 开放平台</a> 获取，格式 sk-...',
      thinkingDesc:
        '开启后模型先推理再作答（DeepSeek V4 的思考模式，请求默认是开的）。写回复用不到推理，开了首条候选要多等十几秒，所以默认关闭。',
    },
    {
      key: 'gemini',
      label: 'Google Gemini（有免费额度）',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-flash-lite-latest',
      // 2026-09-14 实测免费档可用的模型（按推荐度排序）；gemini-flash-latest 与
      // gemini-pro-latest 免费档当前不可用（503 / 无配额），故不放进来
      models: [
        'gemini-flash-lite-latest',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
      ],
      modelsDesc:
        '默认 gemini-flash-lite-latest（最快、额度最宽）。下列模型为实测免费档可用；若某个报 503（负载过高），换一个即可。',
      keyPlaceholder: 'AIza...',
      keyDesc:
        '在 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> 免费获取，格式 AIza...；免费额度有限流，超了会报错。',
      thinkingDesc:
        'Gemini 同样默认带思考（实测开了要等 7 秒才出首条）。关闭后首条候选 1 秒出头，和 DeepSeek 差不多；注意 Gemini 3 系列无法完全关闭思考，只会退到最低档。',
    },
    {
      key: 'custom',
      label: '自定义',
      baseUrl: '',
      model: '',
      models: [],
      modelsDesc: '任意 OpenAI 兼容服务商的模型名。',
      keyPlaceholder: 'sk-...',
      keyDesc: '任意 OpenAI 兼容服务商的 API Key。',
      thinkingDesc:
        '仅 DeepSeek / Gemini 会自动附加对应的思考模式参数；其他服务商不附加，需要时请自行使用对应服务商的关闭方式。',
    },
  ];

  function providerByKey(key) {
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i].key === key) return PROVIDERS[i];
    }
    return PROVIDERS[PROVIDERS.length - 1];
  }

  function normalizeUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function providerByBaseUrl(baseUrl) {
    var url = normalizeUrl(baseUrl);
    for (var i = 0; i < PROVIDERS.length; i++) {
      if (PROVIDERS[i].baseUrl && normalizeUrl(PROVIDERS[i].baseUrl) === url) return PROVIDERS[i];
    }
    return providerByKey('custom');
  }

  var MAX_PER_STYLE = 3;
  var MAX_TOTAL = 10;

  // 默认风格，需与 extension/lib/config.ts 的 DEFAULT_STYLES 保持一致
  var DEFAULT_STYLES = [
    { key: 'opinion', label: '观点', desc: '明确给出自己的判断或立场', enabled: true, count: 1 },
    { key: 'addition', label: '补充', desc: '补充一个原推没提到的角度或事实面', enabled: true, count: 1 },
    { key: 'counter', label: '反向', desc: '提出有礼貌的相反看法', enabled: true, count: 1 },
    { key: 'short', label: '简短', desc: '一句话，极简，不展开', enabled: true, count: 1 },
    { key: 'casual', label: '水贴', desc: '轻松互动式的一句话，几乎没有信息量但自然', enabled: true, count: 1 },
  ];

  // 默认发帖风格，需与 extension/lib/config.ts 的 DEFAULT_POST_STYLES 保持一致
  // ⚠️ 与上面的 DEFAULT_STYLES（回复风格）是两套独立体系，不复用
  var DEFAULT_POST_STYLES = [
    { key: 'post-opinion', label: '观点', desc: '明确输出一个判断或立场，有主张、不含糊', enabled: true, count: 1 },
    { key: 'post-counterintuitive', label: '反直觉', desc: '抛出一个反常识但站得住的看法，礼貌不抬杠', enabled: true, count: 1 },
    { key: 'post-question', label: '提问互动', desc: '以一个问题收尾，把话筒交给评论区', enabled: true, count: 1 },
    { key: 'post-selfdeprecating', label: '自嘲', desc: '拿自己开涮，松弛、不装', enabled: true, count: 1 },
    { key: 'post-nonsense', label: '废话体', desc: '没什么信息量，但读着顺、有氛围', enabled: true, count: 1 },
  ];

  // 2026-09-15 之前用过的发帖风格 key（post-opinion 新旧同名，不列入）
  var LEGACY_POST_STYLE_KEYS = ['post-counter', 'post-trend', 'post-short', 'post-thread'];

  function migratePostStyles(stored) {
    if (!Array.isArray(stored)) return null;
    for (var i = 0; i < stored.length; i++) {
      if (stored[i] && LEGACY_POST_STYLE_KEYS.indexOf(stored[i].key) >= 0) return null;
    }
    return stored;
  }

  // 默认清理配置，需与 extension/lib/config.ts 的 DEFAULT_CLEANER_CONFIG 保持一致
  var DEFAULT_CLEANER = {
    enabled: true,
    categories: { repeat: true, bot: true, adult: true, gamble: true, scam: true, ad: true },
    whitelistFollowing: true,
    whitelistVerified: true,
    alwaysHideSignatures: [],
    hiddenCount: 0,
  };

  var CLEANER_CATEGORIES = ['repeat', 'bot', 'adult', 'gamble', 'scam', 'ad'];

  // 页内状态（任何改动都整份写回 storage，避免互相覆盖）
  var uiState = {
    autoGenerate: true,
    styles: clone(DEFAULT_STYLES),
    postStyles: clone(DEFAULT_POST_STYLES),
    cleaner: clone(DEFAULT_CLEANER),
    debugTiming: false,
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function clampCount(n) {
    var v = typeof n === 'number' && isFinite(n) ? Math.round(n) : 1;
    return Math.min(Math.max(v, 1), MAX_PER_STYLE);
  }

  // 归一化：**保留存储中的顺序**（顺序是用户显式配置），缺失的风格追加到末尾
  function normalizeStyles(stored, defaults) {
    defaults = defaults || DEFAULT_STYLES;
    var list = Array.isArray(stored) ? stored : [];
    var defaultsByKey = {};
    defaults.forEach(function (d) { defaultsByKey[d.key] = d; });

    var seen = {};
    var result = [];

    list.forEach(function (s) {
      if (!s || !s.key || seen[s.key]) return;
      seen[s.key] = true;
      var def = defaultsByKey[s.key];
      if (def) {
        result.push({
          key: def.key,
          label: def.label,
          desc: def.desc,
          enabled: s.enabled !== false,
          count: clampCount(s.count),
        });
      } else {
        result.push({
          key: s.key,
          label: s.label || s.key,
          desc: s.desc || '',
          enabled: s.enabled !== false,
          count: clampCount(s.count),
        });
      }
    });

    defaults.forEach(function (def) {
      if (!seen[def.key]) result.push(clone(def));
    });

    return result;
  }

  function totalCount() {
    return uiState.styles.reduce(function (sum, s) {
      return sum + (s.enabled ? s.count : 0);
    }, 0);
  }

  function saveUI() {
    return chrome.storage.local.set({ uiConfig: clone(uiState) });
  }

  // ---------- 左侧导航切换 ----------
  var navItems = document.querySelectorAll('.nav-item');
  var panes = document.querySelectorAll('.pane');
  Array.prototype.forEach.call(navItems, function (item) {
    item.addEventListener('click', function () {
      var target = item.getAttribute('data-pane');
      Array.prototype.forEach.call(navItems, function (n) {
        n.classList.toggle('active', n === item);
      });
      Array.prototype.forEach.call(panes, function (p) {
        p.classList.toggle('active', p.id === 'pane-' + target);
      });
    });
  });

  // ---------- 模型配置 ----------
  var $provider = document.getElementById('provider');
  var $apiKey = document.getElementById('api-key');
  var $modelSelect = document.getElementById('model-select');
  var $model = document.getElementById('model');
  var $baseUrl = document.getElementById('base-url');
  var $thinking = document.getElementById('thinking');
  var $statusLlm = document.getElementById('status-llm');
  var $providerDesc = document.getElementById('provider-desc');
  var $apiKeyDesc = document.getElementById('api-key-desc');
  var $modelDesc = document.getElementById('model-desc');
  var $thinkingDesc = document.getElementById('thinking-desc');

  // 各服务商各自记住的 Key，切换服务商时自动回填
  var llmKeys = {};
  var MODEL_CUSTOM = '__custom__';

  function setStatus(el, text, ok) {
    el.textContent = text;
    el.className = 'status ' + (ok ? 'ok' : 'err');
  }

  /** 当前生效的模型名（下拉选中项，或「自定义…」时文本框里的值） */
  function getModelValue() {
    if ($modelSelect.style.display === 'none') return $model.value.trim();
    if ($modelSelect.value === MODEL_CUSTOM) return $model.value.trim();
    return $modelSelect.value;
  }

  /** 按服务商渲染模型控件：有预设就用下拉，选「自定义…」再露出文本框 */
  function renderModelControl(p, currentModel) {
    $modelDesc.textContent = p.modelsDesc || '';
    var models = p.models || [];

    if (models.length === 0) {
      $modelSelect.style.display = 'none';
      $model.value = currentModel || '';
      $model.placeholder = '输入模型名';
      $model.style.display = 'block';
      return;
    }

    $modelSelect.innerHTML = '';
    models.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m === p.model ? m + '（默认）' : m;
      $modelSelect.appendChild(opt);
    });
    // 存的是预设之外的自定义模型名时，补一个选项，避免静默丢失
    if (currentModel && models.indexOf(currentModel) < 0) {
      var extra = document.createElement('option');
      extra.value = currentModel;
      extra.textContent = currentModel + '（当前）';
      $modelSelect.appendChild(extra);
    }
    var custom = document.createElement('option');
    custom.value = MODEL_CUSTOM;
    custom.textContent = '自定义…';
    $modelSelect.appendChild(custom);

    $modelSelect.style.display = 'block';
    if (!currentModel) {
      $modelSelect.value = MODEL_CUSTOM;
      $model.value = '';
      $model.placeholder = '输入模型名';
      $model.style.display = 'block';
    } else {
      $modelSelect.value = currentModel;
      $model.value = currentModel;
      $model.style.display = 'none';
    }
  }

  $modelSelect.addEventListener('change', function () {
    if ($modelSelect.value === MODEL_CUSTOM) {
      $model.value = '';
      $model.placeholder = '输入模型名';
      $model.style.display = 'block';
      $model.focus();
    } else {
      $model.value = $modelSelect.value;
      $model.style.display = 'none';
    }
  });

  function applyProviderHint(p, keepValues) {
    if (!keepValues && p.baseUrl) $baseUrl.value = p.baseUrl;
    $apiKey.placeholder = p.keyPlaceholder || 'sk-...';
    $apiKeyDesc.innerHTML = p.keyDesc;
    $thinkingDesc.textContent = p.thinkingDesc;
    $providerDesc.textContent =
      p.key === 'custom'
        ? '填入任意 OpenAI 兼容服务商的 Base URL 与模型名。'
        : '已按「' + p.label + '」填入 Base URL 与模型，仍可手动修改。';
    renderModelControl(p, keepValues ? $model.value.trim() : p.model || '');
  }

  chrome.storage.local.get(LLM_KEY).then(function (res) {
    var cfg = Object.assign({}, LLM_DEFAULTS, res[LLM_KEY] || {});
    llmKeys = cfg.apiKeys || {};
    $apiKey.value = cfg.apiKey || '';
    $model.value = cfg.model || '';
    $baseUrl.value = cfg.baseUrl || '';
    $thinking.checked = cfg.thinking === true;

    var p = providerByBaseUrl(cfg.baseUrl);
    $provider.value = p.key;
    applyProviderHint(p, true);
  });

  // 切换服务商：填入该服务商的默认 Base URL / 模型，并回填它之前保存过的 Key
  $provider.addEventListener('change', function () {
    var p = providerByKey($provider.value);
    applyProviderHint(p, false);
    $apiKey.value = llmKeys[normalizeUrl($baseUrl.value)] || '';
    setStatus(
      $statusLlm,
      p.key === 'custom' ? '' : '已切换到 ' + p.label + '，确认 API Key 后点「保存」。',
      true
    );
  });

  // ---------- 自定义服务商：动态申请 host 权限 ----------
  // MV3 下 manifest 只声明了内置服务商的 host_permissions；用户填任意 OpenAI
  // 兼容服务的 Base URL 时，必须在保存时动态申请该 origin，否则 background SW
  // 发出的请求会被浏览器拦截（表现为请求直接失败 / CORS 报错）。
  var BUILTIN_LLM_ORIGINS = [
    'https://api.deepseek.com',
    'https://generativelanguage.googleapis.com',
  ];

  function originOfUrl(url) {
    try {
      return new URL(url).origin;
    } catch (e) {
      return '';
    }
  }

  function ensureHostPermission(baseUrl) {
    return new Promise(function (resolve, reject) {
      var origin = originOfUrl(baseUrl);
      if (!origin || BUILTIN_LLM_ORIGINS.indexOf(origin) !== -1) {
        resolve(true);
        return;
      }
      if (!chrome.permissions || !chrome.permissions.request) {
        resolve(true);
        return;
      }
      var pattern = origin + '/*';
      chrome.permissions.contains({ origins: [pattern] }, function (has) {
        if (chrome.runtime.lastError) has = false;
        if (has) {
          resolve(true);
          return;
        }
        chrome.permissions.request({ origins: [pattern] }, function (granted) {
          if (chrome.runtime.lastError) granted = false;
          granted ? resolve(true) : reject(new Error('permission-denied'));
        });
      });
    });
  }

  document.getElementById('save-llm').addEventListener('click', function () {
    var key = $apiKey.value.trim();
    if (!key) {
      setStatus($statusLlm, 'API Key 不能为空。', false);
      return;
    }
    var model = getModelValue();
    if (!model) {
      setStatus($statusLlm, '模型名不能为空。', false);
      return;
    }
    var baseUrl = $baseUrl.value.trim() || LLM_DEFAULTS.baseUrl;
    var urlKey = normalizeUrl(baseUrl);

    // 自定义服务商先申请 host 权限，成功才写入（避免存了却请求不了）
    ensureHostPermission(baseUrl)
      .then(function () {
        // 读改写：保留其他服务商记下的 Key，不覆盖
        return chrome.storage.local.get(LLM_KEY).then(function (res) {
          var prev = res[LLM_KEY] || {};
          var keys = Object.assign({}, prev.apiKeys || {});
          keys[urlKey] = key;
          return chrome.storage.local.set({
            llmConfig: {
              apiKey: key,
              model: model,
              baseUrl: baseUrl,
              thinking: $thinking.checked === true,
              apiKeys: keys,
            },
          });
        });
      })
      .then(function () {
        llmKeys[urlKey] = key;
        setStatus($statusLlm, '已保存', true);
      })
      .catch(function (err) {
        setStatus(
          $statusLlm,
          err && err.message === 'permission-denied'
            ? '未授权该域名，无法向它发请求。请允许授权后重试，或换回内置服务商。'
            : '保存失败，请重试。',
          false
        );
      });
  });

  // 深度思考开关即时生效（读改写，避免覆盖掉 API Key 等字段）
  $thinking.addEventListener('change', function () {
    chrome.storage.local.get(LLM_KEY).then(function (res) {
      var cfg = Object.assign({}, LLM_DEFAULTS, res[LLM_KEY] || {});
      cfg.thinking = $thinking.checked === true;
      if (!cfg.apiKey && $apiKey.value.trim()) cfg.apiKey = $apiKey.value.trim();
      return chrome.storage.local.set({ llmConfig: cfg });
    }).then(function () {
      setStatus(
        $statusLlm,
        $thinking.checked ? '已开启深度思考，首条候选会明显变慢' : '已关闭深度思考',
        true
      );
    }).catch(function () {
      setStatus($statusLlm, '保存失败，请重试。', false);
    });
  });

  // ---------- 回复风格：排序（上下箭头）+ 数量 + 启用 ----------

  var SVG_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  var SVG_DOWN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var $debugLine = document.getElementById('debug-line');
  var logHistory = [];

  function logAction(text) {
    console.debug('[X Copilot options]', text);
    var time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    logHistory.push(text + ' · ' + time);
    if (logHistory.length > 3) logHistory.shift();
    var text = '最近操作：' + logHistory.join('  |  ');
    if ($debugLine) $debugLine.textContent = text;
    var $dbgPost = document.getElementById('debug-line-post');
    if ($dbgPost) $dbgPost.textContent = text;
  }

  // 风格编辑器工厂：回复风格 / 发帖风格共用同一套 UI 逻辑，但配置各自独立存储
  function createStyleEditor(cfg) {
    var $list = document.getElementById(cfg.listId);
    var $total = document.getElementById(cfg.totalId);
    var $status = document.getElementById(cfg.statusId);

    function list() { return uiState[cfg.stateKey]; }

    function enabledTotal() {
      return list().reduce(function (sum, s) { return sum + (s.enabled ? s.count : 0); }, 0);
    }

    function move(from, to, label) {
      logAction(cfg.label + '：' + label + ' ' + (from + 1) + ' → ' + (to + 1));
      if (to < 0 || to >= list().length) return;
      var moved = list().splice(from, 1)[0];
      list().splice(to, 0, moved);
      render();
      persist(label);
    }

    function render() {
      $list.innerHTML = '';
      list().forEach(function (style, i) {
        var row = document.createElement('div');
        row.className = 'style-row' + (style.enabled ? '' : ' disabled');
        row.setAttribute('data-index', String(i));

        var order = document.createElement('div');
        order.className = 'order-buttons';

        var canUp = i > 0;
        var canDown = i < list().length - 1;

        var up = document.createElement('button');
        up.type = 'button';
        up.innerHTML = SVG_UP;
        up.title = canUp ? '上移' : '已在最前';
        if (!canUp) up.className = 'is-disabled';
        up.addEventListener('click', function () {
          if (!canUp) { logAction('上移（已在最前，未执行）'); return; }
          move(i, i - 1, '上移');
        });

        var down = document.createElement('button');
        down.type = 'button';
        down.innerHTML = SVG_DOWN;
        down.title = canDown ? '下移' : '已在最后';
        if (!canDown) down.className = 'is-disabled';
        down.addEventListener('click', function () {
          if (!canDown) { logAction('下移（已在最后，未执行）'); return; }
          move(i, i + 1, '下移');
        });

        order.appendChild(up);
        order.appendChild(down);

        var main = document.createElement('div');
        main.className = 'style-main';
        var label = document.createElement('div');
        label.className = 'style-label';
        label.textContent = style.label + '（第 ' + (i + 1) + ' 位）';
        var desc = document.createElement('div');
        desc.className = 'style-desc';
        desc.textContent = style.desc;
        main.appendChild(label);
        main.appendChild(desc);

        var stepper = document.createElement('div');
        stepper.className = 'stepper';
        var minus = document.createElement('button');
        minus.textContent = '\u2212';
        minus.disabled = !style.enabled || style.count <= 1;
        minus.title = '减少一条';
        var val = document.createElement('span');
        val.textContent = String(style.count);
        var plus = document.createElement('button');
        plus.textContent = '+';
        plus.disabled = !style.enabled || style.count >= MAX_PER_STYLE;
        plus.title = '增加一条';
        stepper.appendChild(minus);
        stepper.appendChild(val);
        stepper.appendChild(plus);

        minus.addEventListener('click', function () {
          style.count = clampCount(style.count - 1);
          render();
          persist('count-');
        });
        plus.addEventListener('click', function () {
          style.count = clampCount(style.count + 1);
          render();
          persist('count+');
        });

        var sw = document.createElement('label');
        sw.className = 'switch';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = style.enabled;
        var slider = document.createElement('span');
        slider.className = 'slider';
        sw.appendChild(cb);
        sw.appendChild(slider);
        cb.addEventListener('change', function () {
          style.enabled = cb.checked;
          render();
          persist('toggle');
        });

        row.appendChild(main);
        row.appendChild(stepper);
        row.appendChild(sw);
        row.appendChild(order);
        $list.appendChild(row);
      });

      $total.textContent = String(enabledTotal());
    }

    function persist(reason) {
      var total = enabledTotal();
      var manual = reason === 'manual';
      saveUI().then(function () {
        logAction('已' + (manual ? '手动' : '自动') + '保存（' + cfg.label + ' ' + list().length + ' 项）');
        setStatus(
          $status,
          total === 0
            ? '已保存。注意：当前没有任何启用的风格，将无法生成候选。'
            : manual
              ? '已手动保存'
              : '已自动保存，下次生成起按新配置输出。',
          total !== 0
        );
      }).catch(function () {
        setStatus($status, '保存失败，请重试。', false);
      });
    }

    document.getElementById(cfg.resetId).addEventListener('click', function () {
      uiState[cfg.stateKey] = clone(cfg.defaults);
      render();
      persist('reset');
    });

    document.getElementById(cfg.saveId).addEventListener('click', function () {
      persist('manual');
    });

    render();
    return { render: render };
  }

  var replyStyleEditor = createStyleEditor({
    stateKey: 'styles',
    defaults: DEFAULT_STYLES,
    listId: 'style-list',
    totalId: 'style-total',
    statusId: 'status-styles',
    resetId: 'reset-styles',
    saveId: 'save-styles',
    label: '回复风格',
  });

  var postStyleEditor = createStyleEditor({
    stateKey: 'postStyles',
    defaults: DEFAULT_POST_STYLES,
    listId: 'post-style-list',
    totalId: 'post-style-total',
    statusId: 'status-post-styles',
    resetId: 'reset-post-styles',
    saveId: 'save-post-styles',
    label: '发帖风格',
  });

  // ---------- 自动生成开关 ----------
  var $autoGenerate = document.getElementById('auto-generate');

  $autoGenerate.addEventListener('change', function () {
    uiState.autoGenerate = $autoGenerate.checked;
    saveUI();
  });

  // ---------- 评论清理（Clean 模块） ----------
  function bindCleanerToggle(id, read, write) {
    var el = document.getElementById(id);
    if (!el) return;
    el.checked = read();
    el.addEventListener('change', function () {
      write(el.checked);
      saveUI();
    });
  }

  function renderCleaner() {
    bindCleanerToggle(
      'cleaner-enabled',
      function () { return uiState.cleaner.enabled; },
      function (v) { uiState.cleaner.enabled = v; }
    );
    CLEANER_CATEGORIES.forEach(function (key) {
      bindCleanerToggle(
        'cleaner-' + key,
        function () { return uiState.cleaner.categories[key] !== false; },
        function (v) { uiState.cleaner.categories[key] = v; }
      );
    });
    bindCleanerToggle(
      'cleaner-whitelist-following',
      function () { return uiState.cleaner.whitelistFollowing !== false; },
      function (v) { uiState.cleaner.whitelistFollowing = v; }
    );
    bindCleanerToggle(
      'cleaner-whitelist-verified',
      function () { return uiState.cleaner.whitelistVerified !== false; },
      function (v) { uiState.cleaner.whitelistVerified = v; }
    );

    var count = document.getElementById('cleaner-count');
    var sig = document.getElementById('cleaner-sig');
    if (count) count.textContent = String(uiState.cleaner.hiddenCount || 0);
    if (sig) sig.textContent = String((uiState.cleaner.alwaysHideSignatures || []).length);
  }

  // ---------- 开发者选项 ----------
  var $debugTiming = document.getElementById('debug-timing');

  $debugTiming.addEventListener('change', function () {
    uiState.debugTiming = $debugTiming.checked;
    saveUI();
  });

  // ---------- 初始化：读取已保存配置 ----------
  chrome.storage.local.get(UI_KEY).then(function (res) {
    var cfg = res[UI_KEY] || {};
    uiState.autoGenerate = cfg.autoGenerate !== false;
    uiState.styles = normalizeStyles(cfg.styles, DEFAULT_STYLES);
    uiState.postStyles = normalizeStyles(migratePostStyles(cfg.postStyles), DEFAULT_POST_STYLES);
    if (replyStyleEditor) replyStyleEditor.render();
    if (postStyleEditor) postStyleEditor.render();
    uiState.debugTiming = cfg.debugTiming === true;
    uiState.cleaner = Object.assign({}, DEFAULT_CLEANER, cfg.cleaner || {}, {
      categories: Object.assign({}, DEFAULT_CLEANER.categories, (cfg.cleaner || {}).categories || {}),
    });
    $autoGenerate.checked = uiState.autoGenerate;
    $debugTiming.checked = uiState.debugTiming;
    renderStyles();
    renderCleaner();
  });
})();
