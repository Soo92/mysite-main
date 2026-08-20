const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  status: null,
  balance: { index: 0, pages: [] },
  orders: { index: 0, pages: [], filters: null }
};

function number(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

function signed(value, suffix = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${number(n, 2)}${suffix}`;
}

function yyyymmdd(dateValue) {
  return String(dateValue || '').replaceAll('-', '');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `요청 실패 (${response.status})`);
  return body;
}

function notify(message, type = 'info') {
  const el = $('#notice');
  el.textContent = message;
  el.className = `notice ${type}`;
  if (!message) el.classList.add('hidden');
}

function setBusy(button, busy, text = '처리 중…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function emptyRow(tbody, colspan, message) {
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty">${message}</td></tr>`;
}

async function loadStatus() {
  const data = await api('/api/status');
  state.status = data;
  $('#envBadge').textContent = data.environment === 'real' ? '실전' : '모의';
  $('#envBadge').className = `badge ${data.environment === 'real' ? 'real' : 'demo'}`;
  $('#tokenBadge').textContent = data.hasToken ? '토큰 정상' : '토큰 없음';
  $('#tokenBadge').className = `badge ${data.hasToken ? 'ok' : 'muted'}`;
  $('#orderLock').textContent = data.orderEnabled ? '주문 허용' : '주문 잠금';
  $('#orderLock').className = `badge ${data.orderEnabled ? 'warn' : 'muted'}`;
  $('#orderSubmit').disabled = !data.orderEnabled;
}

function renderSummary(summary) {
  const items = [
    ['예수금', summary.dnca_tot_amt],
    ['매입금액', summary.pchs_amt_smtl_amt],
    ['평가금액', summary.evlu_amt_smtl_amt],
    ['총평가', summary.tot_evlu_amt],
    ['평가손익', summary.evlu_pfls_smtl_amt]
  ];
  $('#summaryCards').innerHTML = items.map(([label, value]) => `<article class="card"><span>${label}</span><strong>${number(value)} 원</strong></article>`).join('');
}

function renderBalance(page) {
  renderSummary(page.summary || {});
  const rows = page.holdings || [];
  const tbody = $('#balanceRows');
  if (!rows.length) emptyRow(tbody, 8, '표시할 보유 종목이 없습니다.');
  else {
    tbody.innerHTML = rows.map(row => `<tr><td><strong>${row.prdt_name || row.pdno || '-'}</strong><small>${row.pdno || ''}</small></td><td>${number(row.hldg_qty)}</td><td>${number(row.ord_psbl_qty)}</td><td>${number(row.pchs_avg_pric, 2)}</td><td>${number(row.prpr)}</td><td>${number(row.evlu_amt)}</td><td class="${Number(row.evlu_pfls_amt) >= 0 ? 'up' : 'down'}">${signed(row.evlu_pfls_amt)}</td><td class="${Number(row.evlu_pfls_rt) >= 0 ? 'up' : 'down'}">${signed(row.evlu_pfls_rt, '%')}</td></tr>`).join('');
  }
  $('#balancePage').textContent = `${state.balance.index + 1} 페이지`;
  $('#balancePrev').disabled = state.balance.index === 0;
  $('#balanceNext').disabled = !page.pagination?.hasNext;
}

async function loadBalance(cursor = '', index = 0) {
  const cached = state.balance.pages[index];
  if (cached && cached.cursor === cursor) {
    state.balance.index = index;
    return renderBalance(cached.data);
  }
  notify('잔고를 조회하고 있습니다…');
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const data = await api(`/api/balance${query}`);
  state.balance.index = index;
  state.balance.pages[index] = { cursor, data };
  state.balance.pages.length = index + 1;
  renderBalance(data);
  notify('');
}

function renderOrders(page) {
  const rows = page.orders || [];
  const tbody = $('#orderRows');
  if (!rows.length) emptyRow(tbody, 8, '조회된 주문/체결 내역이 없습니다.');
  else {
    tbody.innerHTML = rows.map(row => {
      const sideName = row.sll_buy_dvsn_cd_name || (row.sll_buy_dvsn_cd === '01' ? '매도' : row.sll_buy_dvsn_cd === '02' ? '매수' : '-');
      return `<tr><td>${row.ord_dt || '-'}</td><td><strong>${row.prdt_name || row.pdno || '-'}</strong><small>${row.pdno || ''}</small></td><td>${sideName}</td><td>${number(row.ord_qty)}</td><td>${number(row.ord_unpr)}</td><td>${number(row.tot_ccld_qty)}</td><td>${number(row.avg_prvs, 2)}</td><td>${row.odno || '-'}</td></tr>`;
    }).join('');
  }
  $('#ordersPage').textContent = `${state.orders.index + 1} 페이지`;
  $('#ordersPrev').disabled = state.orders.index === 0;
  $('#ordersNext').disabled = !page.pagination?.hasNext;
}

async function loadOrders(cursor = '', index = 0) {
  const filters = state.orders.filters;
  if (!filters) return;
  const cached = state.orders.pages[index];
  if (cached && cached.cursor === cursor) {
    state.orders.index = index;
    return renderOrders(cached.data);
  }
  notify('주문/체결 내역을 조회하고 있습니다…');
  const params = new URLSearchParams({ ...filters, cursor });
  const data = await api(`/api/orders?${params}`);
  state.orders.index = index;
  state.orders.pages[index] = { cursor, data };
  state.orders.pages.length = index + 1;
  renderOrders(data);
  notify('');
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  const local = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('#ordersStart').value = local(start);
  $('#ordersEnd').value = local(end);
}

$$('.tab').forEach(button => button.addEventListener('click', () => {
  $$('.tab').forEach(el => el.classList.toggle('active', el === button));
  $$('.panel').forEach(el => el.classList.remove('active'));
  $(`#${button.dataset.tab}Panel`).classList.add('active');
}));

$('#tokenBtn').addEventListener('click', async () => {
  const button = $('#tokenBtn');
  try {
    setBusy(button, true, '발급 중…');
    await api('/api/token', { method: 'POST', body: '{}' });
    await loadStatus();
    notify('접근토큰을 확인했습니다.', 'ok');
  } catch (error) { notify(error.message, 'error'); }
  finally { setBusy(button, false); }
});

$('#balanceReload').addEventListener('click', async () => {
  state.balance = { index: 0, pages: [] };
  try { await loadBalance(); } catch (error) { notify(error.message, 'error'); }
});

$('#balancePrev').addEventListener('click', () => {
  const index = state.balance.index - 1;
  const page = state.balance.pages[index];
  if (page) loadBalance(page.cursor, index).catch(error => notify(error.message, 'error'));
});

$('#balanceNext').addEventListener('click', () => {
  const page = state.balance.pages[state.balance.index]?.data;
  const cursor = page?.pagination?.nextCursor;
  if (cursor) loadBalance(cursor, state.balance.index + 1).catch(error => notify(error.message, 'error'));
});

$('#ordersForm').addEventListener('submit', event => {
  event.preventDefault();
  state.orders = { index: 0, pages: [], filters: { startDate: yyyymmdd($('#ordersStart').value), endDate: yyyymmdd($('#ordersEnd').value), side: $('#ordersSide').value, status: $('#ordersStatus').value, productCode: $('#ordersCode').value.trim() } };
  loadOrders().catch(error => notify(error.message, 'error'));
});

$('#ordersPrev').addEventListener('click', () => {
  const index = state.orders.index - 1;
  const page = state.orders.pages[index];
  if (page) loadOrders(page.cursor, index).catch(error => notify(error.message, 'error'));
});

$('#ordersNext').addEventListener('click', () => {
  const page = state.orders.pages[state.orders.index]?.data;
  const cursor = page?.pagination?.nextCursor;
  if (cursor) loadOrders(cursor, state.orders.index + 1).catch(error => notify(error.message, 'error'));
});

$('#priceBtn').addEventListener('click', async () => {
  const code = $('#tradeCode').value.trim();
  try {
    const data = await api(`/api/price?code=${encodeURIComponent(code)}`);
    const p = data.price || {};
    $('#priceInfo').innerHTML = `<strong>${p.hts_kor_isnm || code}</strong> <b>${number(p.stck_prpr)}원</b> <span class="${Number(p.prdy_vrss) >= 0 ? 'up' : 'down'}">${signed(p.prdy_vrss)} (${signed(p.prdy_ctrt, '%')})</span>`;
    if ($('#orderType').value === '00' && p.stck_prpr) $('#tradePrice').value = Number(p.stck_prpr);
  } catch (error) { notify(error.message, 'error'); }
});

$('#orderType').addEventListener('change', () => {
  const market = $('#orderType').value === '01';
  $('#tradePrice').disabled = market;
  $('#tradePrice').required = !market;
  if (market) $('#tradePrice').value = '0';
});

$('#tradeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const side = $('input[name="side"]:checked').value;
  const productCode = $('#tradeCode').value.trim();
  const quantity = Number($('#tradeQty').value);
  const orderType = $('#orderType').value;
  const price = orderType === '01' ? 0 : Number($('#tradePrice').value);
  const label = side === 'buy' ? '매수' : '매도';
  const priceLabel = orderType === '01' ? '시장가' : `${number(price)}원`;
  if (!confirm(`${productCode} ${quantity}주를 ${priceLabel}로 ${label} 주문할까요?`)) return;
  try {
    setBusy($('#orderSubmit'), true, '주문 전송 중…');
    const result = await api('/api/order', { method: 'POST', body: JSON.stringify({ side, productCode, quantity, price, orderType, exchange: 'KRX' }) });
    $('#orderResult').textContent = JSON.stringify(result.order, null, 2);
    notify(`${label} 주문 요청이 정상 처리되었습니다.`, 'ok');
  } catch (error) { notify(error.message, 'error'); }
  finally {
    setBusy($('#orderSubmit'), false);
    $('#orderSubmit').disabled = !state.status?.orderEnabled;
  }
});

setDefaultDates();
emptyRow($('#balanceRows'), 8, '잔고 조회를 눌러주세요.');
emptyRow($('#orderRows'), 8, '조건을 입력하고 조회하세요.');

(async () => {
  try {
    await loadStatus();
    if (state.status?.configured) await loadBalance();
  } catch (error) {
    notify(error.message, 'error');
  }
})();
