// GitHub Pages frontend configuration.
// After deploying the Cloudflare Worker, replace apiBase with its workers.dev URL.
window.STOCK_CONFIG = {
  apiBase: 'https://REPLACE_ME.workers.dev'
};

// Keep the app code usable both on the local Node server and GitHub Pages.
// Only /api/* calls are redirected; normal page/assets continue to use GitHub Pages.
(() => {
  const nativeFetch = window.fetch.bind(window);

  function dashboardKey() {
    let key = sessionStorage.getItem('stock.dashboardKey') || '';
    if (!key) {
      key = window.prompt('주식 대시보드 접근키를 입력하세요.') || '';
      if (key) sessionStorage.setItem('stock.dashboardKey', key);
    }
    return key;
  }

  window.fetch = (input, init = {}) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      const base = String(window.STOCK_CONFIG?.apiBase || '').replace(/\/$/, '');
      if (!base || base.includes('REPLACE_ME')) {
        return Promise.reject(new Error('Cloudflare Worker API 주소가 아직 설정되지 않았습니다. public/config.js의 apiBase를 설정하세요.'));
      }
      const key = dashboardKey();
      if (!key) return Promise.reject(new Error('대시보드 접근키가 필요합니다.'));
      const headers = new Headers(init.headers || {});
      headers.set('x-dashboard-key', key);
      return nativeFetch(`${base}${input}`, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
})();
