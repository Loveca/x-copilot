// X Copilot Options 页脚本（外部文件：MV3 CSP 禁止扩展页面使用内联 script）
(function () {
  'use strict';

  var LLM_KEY = 'llmConfig';
  var UI_KEY = 'uiConfig';
  var LLM_DEFAULTS = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiKey: '' };
  var UI_DEFAULTS = { autoGenerate: true };

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

  // ---------- 常规：模型服务 ----------
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

  // ---------- 交互：自动生成开关（切换即保存） ----------
  var $autoGenerate = document.getElementById('auto-generate');

  chrome.storage.local.get(UI_KEY).then(function (res) {
    var cfg = Object.assign({}, UI_DEFAULTS, res[UI_KEY] || {});
    $autoGenerate.checked = cfg.autoGenerate !== false;
  });

  $autoGenerate.addEventListener('change', function () {
    chrome.storage.local.set({ uiConfig: { autoGenerate: $autoGenerate.checked } });
  });
})();
