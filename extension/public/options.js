// X Copilot Options 页脚本（外部文件：MV3 CSP 禁止扩展页面使用内联 script）
(function () {
  'use strict';

  var LLM_KEY = 'llmConfig';
  var UI_KEY = 'uiConfig';
  var LLM_DEFAULTS = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiKey: '' };

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

  // 页内状态（任何改动都整份写回 storage，避免互相覆盖）
  var uiState = { autoGenerate: true, styles: clone(DEFAULT_STYLES) };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function clampCount(n) {
    var v = typeof n === 'number' && isFinite(n) ? Math.round(n) : 1;
    return Math.min(Math.max(v, 1), MAX_PER_STYLE);
  }

  function normalizeStyles(stored) {
    var list = Array.isArray(stored) ? stored : [];
    var byKey = {};
    list.forEach(function (s) { if (s && s.key) byKey[s.key] = s; });

    var result = DEFAULT_STYLES.map(function (def) {
      var saved = byKey[def.key];
      delete byKey[def.key];
      return {
        key: def.key,
        label: def.label,
        desc: def.desc,
        enabled: !saved || saved.enabled !== false,
        count: saved ? clampCount(saved.count) : def.count,
      };
    });
    Object.keys(byKey).forEach(function (k) { result.push(byKey[k]); });
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
  var $apiKey = document.getElementById('api-key');
  var $model = document.getElementById('model');
  var $baseUrl = document.getElementById('base-url');
  var $statusLlm = document.getElementById('status-llm');

  function setStatus(el, text, ok) {
    el.textContent = text;
    el.className = 'status ' + (ok ? 'ok' : 'err');
  }

  chrome.storage.local.get(LLM_KEY).then(function (res) {
    var cfg = Object.assign({}, LLM_DEFAULTS, res[LLM_KEY] || {});
    $apiKey.value = cfg.apiKey || '';
    $model.value = cfg.model || '';
    $baseUrl.value = cfg.baseUrl || '';
  });

  document.getElementById('save-llm').addEventListener('click', function () {
    if (!$apiKey.value.trim()) {
      setStatus($statusLlm, 'API Key 不能为空。', false);
      return;
    }
    var cfg = {
      apiKey: $apiKey.value.trim(),
      model: $model.value.trim() || LLM_DEFAULTS.model,
      baseUrl: $baseUrl.value.trim() || LLM_DEFAULTS.baseUrl,
    };
    chrome.storage.local.set({ llmConfig: cfg }).then(function () {
      setStatus($statusLlm, '已保存', true);
    }).catch(function () {
      setStatus($statusLlm, '保存失败，请重试。', false);
    });
  });

  // ---------- 回复风格：拖拽排序 + 数量 + 启用 ----------
  var $list = document.getElementById('style-list');
  var $total = document.getElementById('style-total');
  var $statusStyles = document.getElementById('status-styles');

  var SVG_HANDLE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"/></svg>';

  function renderStyles() {
    $list.innerHTML = '';
    uiState.styles.forEach(function (style, i) {
      var row = document.createElement('div');
      row.className = 'style-row' + (style.enabled ? '' : ' disabled');
      row.setAttribute('data-index', String(i));

      var handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.innerHTML = SVG_HANDLE;
      handle.title = '按住拖动调整顺序';
      attachDrag(row, handle);

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
      minus.textContent = '−';
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
        renderStyles();
        persistStyles();
      });
      plus.addEventListener('click', function () {
        style.count = clampCount(style.count + 1);
        renderStyles();
        persistStyles();
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
        renderStyles();
        persistStyles();
      });

      // 拖拽排序：用 pointer 事件自行管理（HTML5 原生 DnD 在含表单控件的行里不稳定）
      // 拖动过程中实时换位，松手后落盘
      row.appendChild(handle);
      row.appendChild(main);
      row.appendChild(stepper);
      row.appendChild(sw);
      $list.appendChild(row);
    });

    $total.textContent = String(totalCount());
  }

  function attachDrag(row, handle) {
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var startY = e.clientY;
      var dragging = false;
      var fromIndex = Number(row.getAttribute('data-index'));

      function currentIndexOfRow() {
        return Number(row.getAttribute('data-index'));
      }

      function onMove(ev) {
        if (!dragging) {
          if (Math.abs(ev.clientY - startY) < 5) return;
          dragging = true;
          $list.classList.add('dragging-active');
          row.classList.add('dragging');
        }
        ev.preventDefault();

        var rows = Array.prototype.slice.call($list.children);
        var targetIndex = rows.length - 1;
        for (var i = 0; i < rows.length; i++) {
          var rect = rows[i].getBoundingClientRect();
          if (ev.clientY < rect.top + rect.height / 2) {
            targetIndex = i;
            break;
          }
        }

        var from = currentIndexOfRow();
        if (targetIndex !== from) {
          var moved = uiState.styles.splice(from, 1)[0];
          uiState.styles.splice(targetIndex, 0, moved);
          renderStyles();
          var newRow = $list.children[targetIndex];
          if (newRow) newRow.classList.add('dragging');
        }
      }

      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        $list.classList.remove('dragging-active');
        if (dragging) {
          renderStyles();
          persistStyles();
        }
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  function persistStyles() {
    var enabledTotal = totalCount();
    saveUI().then(function () {
      setStatus(
        $statusStyles,
        enabledTotal === 0
          ? '已保存。注意：当前没有任何启用的风格，将无法生成候选。'
          : '已保存，下一条 Tweet 起按新配置生成。',
        enabledTotal !== 0
      );
    }).catch(function () {
      setStatus($statusStyles, '保存失败，请重试。', false);
    });
  }

  document.getElementById('reset-styles').addEventListener('click', function () {
    uiState.styles = clone(DEFAULT_STYLES);
    renderStyles();
    persistStyles();
  });

  // ---------- 自动生成开关 ----------
  var $autoGenerate = document.getElementById('auto-generate');

  $autoGenerate.addEventListener('change', function () {
    uiState.autoGenerate = $autoGenerate.checked;
    saveUI();
  });

  // ---------- 初始化：读取已保存配置 ----------
  chrome.storage.local.get(UI_KEY).then(function (res) {
    var cfg = res[UI_KEY] || {};
    uiState.autoGenerate = cfg.autoGenerate !== false;
    uiState.styles = normalizeStyles(cfg.styles);
    $autoGenerate.checked = uiState.autoGenerate;
    renderStyles();
  });
})();
