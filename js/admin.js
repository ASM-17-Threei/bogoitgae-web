'use strict';

// ============ 토큰 저장 ============
const tokens = {
  get access() { return localStorage.getItem('adminAccessToken'); },
  get refresh() { return localStorage.getItem('adminRefreshToken'); },
  save(pair) {
    localStorage.setItem('adminAccessToken', pair.accessToken);
    localStorage.setItem('adminRefreshToken', pair.refreshToken);
  },
  clear() {
    localStorage.removeItem('adminAccessToken');
    localStorage.removeItem('adminRefreshToken');
  },
};

// ============ 뷰 전환 ============
function showView(name) {
  for (const id of ['view-login', 'view-forbidden', 'view-app']) {
    document.getElementById(id).hidden = id !== `view-${name}`;
  }
}

function startApp() {
  showView('app');
  switchTab('users');
}

// ============ 토스트 ============
let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = isError ? 'toast error' : 'toast';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ============ 카카오 OIDC ============
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randB64url(len) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return b64url(a);
}

function kakaoAuthorizeUrl(state) {
  const p = new URLSearchParams({
    client_id: ADMIN_CONFIG.KAKAO_CLIENT_ID,
    redirect_uri: ADMIN_CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: 'openid',
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

// state = 로그인 CSRF 방어 (sessionStorage 왕복). code 탈취 방어는 백엔드의 client_secret이 담당.
function beginKakaoLogin() {
  const state = randB64url(32);
  sessionStorage.setItem('kakaoState', state);
  location.href = kakaoAuthorizeUrl(state);
}

// 카카오 REST 키에 클라이언트 시크릿이 켜져 있어 code→id_token 교환은 백엔드만 가능 — code만 넘긴다
async function loginWithCode(code) {
  const res = await fetch(`${ADMIN_CONFIG.API_BASE_URL}/auth/login/kakao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(`로그인 실패: ${body.error.code}`);
  tokens.save(body.data); // LoginResponse { accessToken, refreshToken, isNewUser }
}

async function tryRefresh() {
  if (!tokens.refresh) return false;
  try {
    const res = await fetch(`${ADMIN_CONFIG.API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    });
    const body = await res.json();
    if (!body.success) return false;
    tokens.save(body.data);
    return true;
  } catch {
    return false;
  }
}

function logout() {
  tokens.clear();
  showView('login');
}

// ============ 초기화 ============
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-kakao').addEventListener('click', beginKakaoLogin);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout2').addEventListener('click', logout);
  document.getElementById('tab-nav').addEventListener('click', (e) => {
    if (e.target.dataset.tab) switchTab(e.target.dataset.tab);
  });
  // 닫기 버튼이 없어서 백드롭 클릭으로 닫기 (Esc는 dialog 기본 지원)
  const dlg = document.getElementById('detail');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });

  const qs = new URLSearchParams(location.search);
  const code = qs.get('code');
  if (code) {
    history.replaceState(null, '', location.pathname); // code 재사용 방지
    const savedState = sessionStorage.getItem('kakaoState');
    sessionStorage.removeItem('kakaoState');
    try {
      if (!savedState || qs.get('state') !== savedState) throw new Error('state 불일치 — 로그인을 다시 시도하세요');
      await loginWithCode(code);
    } catch (e) {
      toast(e.message, true);
    }
  }
  if (tokens.access) startApp();
  else showView('login');
});

// ============ API 래퍼 ============
async function api(path, opts = {}, retried = false) {
  const res = await fetch(ADMIN_CONFIG.API_BASE_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens.access}`,
      ...opts.headers,
    },
  });
  if (res.status === 401 && !retried) {
    if (await tryRefresh()) return api(path, opts, true);
    logout();
    throw new Error('세션 만료');
  }
  if (res.status === 403) {
    showView('forbidden');
    throw new Error('권한 없음');
  }
  const body = await res.json();
  if (!body.success) {
    toast(`${body.error.code}: ${body.error.message}`, true);
    throw new Error(body.error.code);
  }
  return body.data;
}

// ============ 렌더 헬퍼 ============
// XSS 방어의 핵심 — 데이터는 반드시 textContent로만 DOM에 들어간다.
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (cls) e.className = cls;
  return e;
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString('ko-KR', { hour12: false }) : '—';
}

// 목록 화면(renderTable)과 상세 dialog(subTable)가 공유하는 테이블 빌더
function buildTable(cols, rows, { onRow, emptyText = '데이터 없음' } = {}) {
  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  for (const c of cols) hr.append(el('th', c.label));
  thead.append(hr);
  const tbody = el('tbody');
  if (rows.length === 0) {
    const tr = el('tr');
    const td = el('td', emptyText, 'muted');
    td.colSpan = cols.length;
    tr.append(td);
    tbody.append(tr);
  }
  for (const row of rows) {
    const tr = el('tr', null, onRow ? 'clickable' : '');
    for (const c of cols) {
      const v = c.fmt ? c.fmt(row[c.key], row) : row[c.key];
      tr.append(el('td', v ?? '—', c.trunc ? 'trunc' : ''));
    }
    if (onRow) tr.addEventListener('click', () => onRow(row));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}

function renderTable(cols, rows, onRow) {
  const wrap = document.getElementById('table-wrap');
  wrap.replaceChildren(buildTable(cols, rows, { onRow }));
}

function renderPager(pageData, onMove) {
  const pager = document.getElementById('pager');
  pager.replaceChildren();
  const prev = el('button', '← 이전', 'btn btn-sm');
  const next = el('button', '다음 →', 'btn btn-sm');
  prev.disabled = pageData.page <= 0;
  next.disabled = pageData.page >= pageData.totalPages - 1;
  prev.addEventListener('click', () => onMove(pageData.page - 1));
  next.addEventListener('click', () => onMove(pageData.page + 1));
  pager.append(prev,
    el('span', `${pageData.totalPages === 0 ? 0 : pageData.page + 1} / ${pageData.totalPages}페이지 (총 ${pageData.totalElements}건)`, 'muted'),
    next);
}

// ============ 셀프체크 — 브라우저 콘솔에서 adminSelfCheck() 실행 ============
function adminSelfCheck() {
  console.assert(el('td', '<img src=x onerror=alert(1)>').innerHTML === '&lt;img src=x onerror=alert(1)&gt;', 'XSS 이스케이프 실패');
  console.assert(el('td', null).textContent === '', 'null 처리 실패');
  console.assert(fmtDate(null) === '—', 'fmtDate null 실패');
  console.assert(fmtDate('2026-01-02T03:04:05Z').includes('2026'), 'fmtDate 파싱 실패');
  const u = kakaoAuthorizeUrl('st');
  console.assert(u.startsWith('https://kauth.kakao.com/oauth/authorize?') && u.includes('scope=openid') && u.includes('state=st'), '카카오 URL 실패');
  console.assert(b64url(new Uint8Array([251, 239])).indexOf('=') === -1, 'b64url 패딩 제거 실패');
  const savedFilters = S.filters;
  S.filters = { q: '멍', status: '' };
  console.assert(listQuery().includes('q=%EB%A9%8D') && !listQuery().includes('status'), 'listQuery 빈 필터 제외 실패');
  S.filters = savedFilters;
  const cols = [{ key: 'a', label: 'A' }];
  console.assert(buildTable(cols, []).querySelector('td').textContent === '데이터 없음', 'buildTable 빈 목록 실패');
  console.assert(buildTable(cols, [{ a: 1 }], { onRow: () => {} }).querySelector('tr.clickable') !== null, 'buildTable onRow 클래스 실패');
  console.assert(buildTable(cols, [{ a: null }]).querySelector('tbody td').textContent === '—', 'buildTable null 대시 실패');
  console.log('adminSelfCheck 통과');
}

// ============ 탭 프레임 ============
const S = { tab: 'users', page: 0, filters: {} };
const TABS = {}; // 각 탭이 { load } 를 등록한다

function switchTab(name) {
  S.tab = name;
  S.page = 0;
  S.filters = {};
  for (const b of document.querySelectorAll('#tab-nav .tab')) {
    b.classList.toggle('active', b.dataset.tab === name);
  }
  TABS[name].load().catch(() => {});
}

function listQuery() {
  const p = new URLSearchParams({ page: S.page, size: 20 });
  for (const [k, v] of Object.entries(S.filters)) if (v) p.set(k, v);
  return p.toString();
}

// defs: [{name, label, type:'text'|'select'|'date', options?}] — 적용 시 S.filters 갱신 후 reload
function renderFilters(defs, extraNode) {
  const box = document.getElementById('filters');
  box.replaceChildren();
  if (extraNode) box.append(extraNode);
  const inputs = [];
  for (const d of defs) {
    let input;
    if (d.type === 'select') {
      input = el('select');
      input.append(new Option(d.label + ' 전체', ''));
      for (const o of d.options) input.append(new Option(o, o));
    } else {
      input = el('input');
      input.type = d.type;
      input.placeholder = d.label;
    }
    input.name = d.name;
    input.value = S.filters[d.name] || ''; // load()가 페이지 이동마다 재렌더해서, 복원 안 하면 적용 중인 필터가 UI에서 사라짐
    inputs.push(input);
    box.append(input);
  }
  const apply = el('button', '적용', 'btn btn-sm btn-primary');
  apply.addEventListener('click', () => {
    S.filters = Object.fromEntries(inputs.map((i) => [i.name, i.value]));
    S.page = 0;
    TABS[S.tab].load().catch(() => {});
  });
  box.append(apply);
}

function movePage(page) {
  S.page = page;
  TABS[S.tab].load().catch(() => {});
}

function openDialog(node) {
  const body = document.getElementById('detail-body');
  body.replaceChildren(node);
  document.getElementById('detail').showModal();
}

function dl(pairs) {
  const box = el('dl');
  for (const [k, v] of pairs) box.append(el('dt', k), el('dd', v ?? '—'));
  return box;
}

function subTable(title, cols, rows) {
  const frag = document.createDocumentFragment();
  frag.append(el('h2', title), buildTable(cols, rows, { emptyText: '없음' }));
  return frag;
}

// ============ 유저 탭 ============
const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'];

TABS.users = {
  async load() {
    renderFilters([
      { name: 'q', label: '검색어', type: 'text' },
      { name: 'status', label: '상태', type: 'select', options: USER_STATUSES },
    ]);
    const data = await api(`/admin/users?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'nickname', label: '닉네임' },
      { key: 'provider', label: '가입경로' },
      { key: 'status', label: '상태' },
      { key: 'role', label: '역할' },
      { key: 'createdAt', label: '가입일', fmt: fmtDate },
      { key: 'lastActiveAt', label: '최근 활동', fmt: fmtDate },
    ], data.items, (row) => openUserDetail(row.id));
    renderPager(data, movePage);
  },
};

async function openUserDetail(userId) {
  const u = await api(`/admin/users/${userId}`);
  const frag = document.createDocumentFragment();
  frag.append(el('h2', `유저 #${u.id} — ${u.nickname}`));
  frag.append(dl([
    ['가입경로', u.provider], ['상태', u.status], ['역할', u.role],
    ['가입일', fmtDate(u.createdAt)],
  ]));
  frag.append(subTable('강아지', [
    { key: 'id', label: 'ID' }, { key: 'name', label: '이름' }, { key: 'breed', label: '견종' },
  ], u.dogs));
  frag.append(subTable('카메라', [
    { key: 'id', label: 'ID' }, { key: 'name', label: '이름' },
    { key: 'pairedAt', label: '페어링', fmt: fmtDate },
  ], u.cameras));

  // 상태 변경 — 이 페이지의 유일한 쓰기 동작
  const row = el('div', null, 'status-row');
  const sel = el('select');
  for (const s of USER_STATUSES) sel.append(new Option(s, s, false, s === u.status));
  const btn = el('button', '상태 변경', 'btn btn-sm btn-primary');
  btn.addEventListener('click', async () => {
    if (sel.value === u.status) return toast('현재 상태와 동일합니다', true);
    if (!confirm(`유저 #${u.id} 상태를 ${u.status} → ${sel.value} 로 변경할까요?`)) return;
    await api(`/admin/users/${u.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: sel.value }),
    });
    toast('상태가 변경되었습니다');
    document.getElementById('detail').close();
    TABS.users.load().catch(() => {});
  });
  row.append(sel, btn);
  frag.append(row);
  openDialog(frag);
}

// ============ 피드백 탭 ============
TABS.feedbacks = {
  async load() {
    renderFilters([
      { name: 'reasonCode', label: '신고 사유', type: 'select', options: ['NOT_DOG_SOUND', 'WRONG_CATEGORY', 'NORMAL_BEHAVIOR', 'ETC'] },
    ]);
    const data = await api(`/admin/feedbacks?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'eventId', label: '이벤트' },
      { key: 'eventCategory', label: '카테고리' },
      { key: 'sourceType', label: '소스' },
      { key: 'reasonCode', label: '사유' },
      { key: 'detail', label: '내용', trunc: true },
      { key: 'reporterNickname', label: '신고자' },
      { key: 'createdAt', label: '신고일', fmt: fmtDate },
    ], data.items, (row) => openFeedbackDetail(row.id));
    renderPager(data, movePage);
  },
};

async function openFeedbackDetail(feedbackId) {
  const f = await api(`/admin/feedbacks/${feedbackId}`);
  const frag = document.createDocumentFragment();
  frag.append(el('h2', `피드백 #${f.id}`));
  frag.append(dl([
    ['이벤트', `#${f.eventId} ${f.eventCategory} (${f.sourceType})`],
    ['신뢰도', f.confidence], ['길이(초)', f.durationSec],
    ['감지 시각', fmtDate(f.detectedAt)],
    ['신고 사유', f.reasonCode], ['내용', f.detail],
    ['신고자', `#${f.reporterUserId} ${f.reporterNickname}`],
    ['신고일', fmtDate(f.createdAt)],
  ]));
  // href는 textContent 방어 밖이라 javascript: 스킴 차단이 별도로 필요
  let safeUrl = null;
  try {
    const u = new URL(f.playbackUrl);
    if (u.protocol === 'https:' || u.protocol === 'http:') safeUrl = u.href;
  } catch { /* null·비URL이면 링크 미표시 */ }
  if (safeUrl) {
    const a = el('a', '클립 재생 ↗');
    a.href = safeUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    frag.append(a);
  } else {
    frag.append(el('p', '클립 없음 또는 만료', 'muted'));
  }
  openDialog(frag);
}

// ============ 이벤트 분석 탭 ============
TABS.analyses = {
  async load() {
    renderFilters([
      { name: 'severity', label: '심각도', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH'] },
      { name: 'from', label: '시작일', type: 'date' },
      { name: 'to', label: '종료일', type: 'date' },
    ]);
    const data = await api(`/admin/event-analyses?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'eventId', label: '이벤트' },
      { key: 'clipId', label: '클립' },
      { key: 'modelName', label: '모델' },
      { key: 'promptVersion', label: '프롬프트' },
      { key: 'verdict', label: '판정' },
      { key: 'severity', label: '심각도' },
      { key: 'summary', label: '요약', trunc: true },
      { key: 'latencyMs', label: '지연(ms)' },
      { key: 'tokenCost', label: '토큰비용' },
      { key: 'analyzedAt', label: '분석 시각', fmt: fmtDate },
    ], data.items);
    renderPager(data, movePage);
  },
};

// ============ 알림 로그 탭 ============
let notifSub = 'reports'; // 'reports' | 'events'

TABS.notifications = {
  async load() {
    const toggle = el('div');
    for (const [key, label] of [['reports', '리포트'], ['events', '이벤트']]) {
      const b = el('button', label, `btn btn-sm${notifSub === key ? ' btn-primary' : ''}`);
      b.addEventListener('click', () => {
        notifSub = key;
        S.page = 0;
        TABS.notifications.load().catch(() => {});
      });
      toggle.append(b);
    }
    renderFilters([
      { name: 'status', label: '발송 상태', type: 'select', options: ['PENDING', 'SENT', 'FAILED'] },
      { name: 'from', label: '시작일', type: 'date' },
      { name: 'to', label: '종료일', type: 'date' },
    ], toggle);
    const data = await api(`/admin/notification-logs/${notifSub}?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'userId', label: '유저' },
      { key: notifSub === 'reports' ? 'reportId' : 'eventId', label: notifSub === 'reports' ? '리포트' : '이벤트' },
      { key: 'channel', label: '채널' },
      { key: 'title', label: '제목', trunc: true },
      { key: 'body', label: '본문', trunc: true },
      { key: 'status', label: '상태' },
      { key: 'failReason', label: '실패 사유', trunc: true },
      { key: 'sentAt', label: '발송 시각', fmt: fmtDate },
    ], data.items);
    renderPager(data, movePage);
  },
};
