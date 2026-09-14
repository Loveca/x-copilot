// X Copilot Options 页脚本（外部文件：MV3 CSP 禁止扩展页面使用内联 script）
(function () {
  'use strict';

  var DEFAULTS = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiKey: '' };
  var KEY = 'llmConfig';

  var $apiKey = document.getElementById('api-key');
  var $model = document.getElementById('model');
  var $baseUrl = document.getElementById('base-url');
  var $status = document.getElementById('status');
  var $save = document.getElementById('save');

  function setStatus(text, ok) {
    $status.textContent = text;
    $status.className = 'status ' + (ok ? 'ok' : 'err');
  }

  chrome.storage.local.get(KEY).then(function (res) {
    var cfg = Object.assign({}, DEFAULTS, res[KEY] || {});
    $apiKey.value = cfg.apiKey || '';
    $model.value = cfg.model || '';
    $baseUrl.value = cfg.baseUrl || '';
  });

  $save.addEventListener('click', function () {
    if (!$apiKey.value.trim()) {
      setStatus('API Key 不能为空。', false);
      return;
    }
    var cfg = {
      apiKey: $apiKey.value.trim(),
      model: $model.value.trim() || DEFAULTS.model,
      baseUrl: $baseUrl.value.trim() || DEFAULTS.baseUrl,
    };
    chrome.storage.local.set({ llmConfig: cfg }).then(function () {
      setStatus('✓ 已保存，配置立即生效。', true);
    }).catch(function () {
      setStatus('保存失败，请重试。', false);
    });
  });
})();
