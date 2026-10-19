'use strict';

// ============ 환경 ============
const savedEnvironment = localStorage.getItem('adminEnvironment');
const environment = Object.hasOwn(ENVIRONMENTS, savedEnvironment) && ENVIRONMENTS[savedEnvironment]
  ? savedEnvironment : 'develop';
const API_BASE_URL = ENVIRONMENTS[environment];

// 운영에 붙었다는 것을 화면으로 알린다. 쓰기 동작이 실사용자에게 닿으므로
// select 값만 바뀌고 화면이 그대로면 모르고 누른다 (css 의 body.is-production).
if (environment === 'production') document.body.classList.add('is-production');

function renderEnvironment() {
  const sel = document.getElementById('environment');
  for (const [name, url] of Object.entries(ENVIRONMENTS)) {
    const option = selectOption(url ? name : `${name} (준비중)`, name, name === environment);
    option.disabled = !url;
    sel.append(option);
  }
  sel.addEventListener('change', () => {
    if (!Object.hasOwn(ENVIRONMENTS, sel.value) || !ENVIRONMENTS[sel.value]) return;
    localStorage.setItem('adminEnvironment', sel.value);
    // 새 환경에서 다시 초기화 — 이전 환경의 요청·상세 화면이 섞이지 않게 한다
    location.reload();
  });
}

// ============ 토큰 저장 ============
const tokens = {
  get access() { return localStorage.getItem(`${environment}:adminAccessToken`); },
  get refresh() { return localStorage.getItem(`${environment}:adminRefreshToken`); },
  save(pair) {
    localStorage.setItem(`${environment}:adminAccessToken`, pair.accessToken);
    localStorage.setItem(`${environment}:adminRefreshToken`, pair.refreshToken);
  },
  clear() {
    localStorage.removeItem(`${environment}:adminAccessToken`);
    localStorage.removeItem(`${environment}:adminRefreshToken`);
  },
};

// ============ 뷰 전환 ============
function showView(name) {
  for (const id of ['view-login', 'view-forbidden', 'view-app']) {
    document.getElementById(id).hidden = id !== `view-${name}`;
  }
}

function startApp() {
  const target = parseHash(location.hash);
  showView('app');
  switchTab('users');
  loadTableNav().catch(() => {});
  if (target) openLinkedDetail(target.kind, target.id);
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
  sessionStorage.setItem('kakaoEnvironment', environment);
  sessionStorage.setItem('adminDetailHash', parseHash(location.hash) ? location.hash : '');
  location.href = kakaoAuthorizeUrl(state);
}

// 카카오 REST 키에 클라이언트 시크릿이 켜져 있어 code→id_token 교환은 백엔드만 가능 — code만 넘긴다
async function loginWithCode(code) {
  const res = await fetch(`${API_BASE_URL}/auth/login/kakao`, {
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
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
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
  closeDetail();
  tokens.clear();
  showView('login');
}

// ============ 초기화 ============
document.addEventListener('DOMContentLoaded', async () => {
  renderEnvironment();
  document.getElementById('btn-kakao').addEventListener('click', beginKakaoLogin);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout2').addEventListener('click', logout);
  document.getElementById('tab-nav').addEventListener('click', (e) => {
    if (e.target.dataset.tab) switchTab(e.target.dataset.tab);
  });
  const dlg = document.getElementById('detail');
  dlg.addEventListener('close', () => {
    if (!dlg.open && currentDetail) resetDetail();
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDetail();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeDetail();
  });

  const qs = new URLSearchParams(location.search);
  const code = qs.get('code');
  if (code) {
    history.replaceState(null, '', location.pathname + location.hash); // 같은 로그인 코드를 다시 쓰지 않게 한다
    const savedState = sessionStorage.getItem('kakaoState');
    const loginEnvironment = sessionStorage.getItem('kakaoEnvironment');
    sessionStorage.removeItem('kakaoState');
    sessionStorage.removeItem('kakaoEnvironment');
    try {
      if (!savedState || qs.get('state') !== savedState) throw new Error('state 불일치 — 로그인을 다시 시도하세요');
      if (loginEnvironment !== environment) throw new Error('환경 변경 — 로그인을 다시 시도하세요');
      await loginWithCode(code);
      const savedHash = sessionStorage.getItem('adminDetailHash');
      if (parseHash(savedHash)) history.replaceState(null, '', location.pathname + savedHash);
    } catch (e) {
      toast(e.message, true);
    }
  }
  if (code) sessionStorage.removeItem('adminDetailHash');
  if (tokens.access) startApp();
  else showView('login');
});

// ============ API 래퍼 ============
async function api(path, opts = {}, retried = false) {
  const { errorMessages = {}, ...fetchOpts } = opts;
  const res = await fetch(API_BASE_URL + path, {
    ...fetchOpts,
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
    closeDetail();
    showView('forbidden');
    throw new Error('권한 없음');
  }
  const body = await res.json();
  if (!body.success) {
    toast(errorMessages[`${res.status}:${body.error.code}`] || `${body.error.code}: ${body.error.message}`, true);
    const error = new Error(body.error.code);
    error.reported = true;
    throw error;
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

function selectOption(label, value, selected = false) {
  const option = el('option', label);
  option.value = value;
  option.selected = selected;
  return option;
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
      const td = el('td', null, c.trunc ? 'trunc' : '');
      if (c.link) td.append(idChip(c.link, row[c.key]));
      else if (c.badge && c.badge(row) && v != null) td.append(el('span', v, 'badge-error'));
      else td.textContent = v ?? '—';
      tr.append(td);
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
  console.assert(buildTable([{ key: 0, label: 'id' }, { key: 1, label: 'name' }], [[7, '멍']]).querySelectorAll('tbody td')[1].textContent === '멍', '배열 행 렌더 실패');
  console.assert(safeHttpUrl('javascript:alert(1)') === null, '위험한 URL 차단 실패');
  console.assert(safeHttpUrl('https://x.com/a') === 'https://x.com/a', 'HTTPS URL 처리 실패');
  console.assert(JSON.stringify(parseHash('#event/12')) === JSON.stringify({ kind: 'event', id: 12 }), '상세 주소 읽기 실패');
  console.assert(JSON.stringify(parseHash('#inquiry/3')) === JSON.stringify({ kind: 'inquiry', id: 3 }), '신고 상세 주소 읽기 실패');
  console.assert(inquiryKindsText(['NOTIFICATION', 'ETC']) === '알림 문제, 그 외', '신고 유형 라벨 실패');
  console.assert(inquiryKindsText(['UNKNOWN_KIND']) === 'UNKNOWN_KIND', '모르는 유형은 코드 그대로');
  console.assert(inquiryKindsText(null) === '—', '유형 없음 처리 실패');
  console.assert(inquiryAttachmentNode({ type: 'PHOTO', url: 'javascript:alert(1)', expired: false }).querySelector('img') === null, '위험한 사진 URL 차단 실패');
  console.assert(inquiryAttachmentNode({ type: 'CLIP', clipId: 5, url: null, expired: true }).textContent.includes('보관 기한'), '만료 클립 표시 실패');
  for (const hash of ['#event/no', '#event/0', '#camera/3', '#user/1/2', '#report/-1', '#feedback/1.5']) {
    console.assert(parseHash(hash) === null, '잘못된 상세 주소 차단 실패');
  }
  const linked = buildTable([{ key: 'eventId', label: '이벤트', link: 'event' }], [{ eventId: 12 }, { eventId: null }]);
  console.assert(linked.querySelector('button.chip').textContent === '#12', 'ID 버튼 생성 실패');
  console.assert(linked.querySelectorAll('tbody td')[1].textContent === '—', '빈 ID 처리 실패');
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  console.assert(parseHash(`#iapNotification/${uuid}`)?.id === uuid, '스토어 알림 주소 읽기 실패');
  console.assert(parseHash('#iapNotification/12345678901234567890')?.id === '12345678901234567890', '구글 숫자 id 주소 읽기 실패');
  console.assert(parseHash('#iapNotification/<script>') === null, '잘못된 스토어 알림 주소 차단 실패');
  console.assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localInputValue(new Date())), 'datetime-local 값 형식 실패');
  const conflict = showConflict({ title: 't', latest: [['a', '<b>']], mine: [['a', 'c']], reload: () => {} });
  console.assert(conflict.querySelectorAll('dd')[0].textContent === '<b>' && conflict.querySelector('b') === null, '충돌 블록 이스케이프 실패');
  console.log('adminSelfCheck 완료');
}

// ============ 탭 프레임 ============
const S = { tab: 'users', page: 0, filters: {} };
const TABS = {}; // 각 탭이 { load } 를 등록한다

function switchTab(name, filters = {}) {
  closeDetail();
  S.tab = name;
  S.page = 0;
  S.filters = { ...filters };
  for (const b of document.querySelectorAll('.sidebar .tab')) {
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
      input.append(selectOption(d.label + ' 전체', ''));
      for (const o of d.options) input.append(selectOption(o, o));
    } else {
      input = el('input');
      input.type = d.type;
      input.placeholder = d.label;
    }
    input.setAttribute('aria-label', d.label);
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

const detailStack = [];
let currentDetail = null;
let detailRequest = 0;

// 스토어 알림 id: Apple 은 uuid, Google 은 Pub/Sub messageId(긴 숫자 문자열) — 안전한 글자만 허용
const IAP_ID = /^#iapNotification\/([A-Za-z0-9._-]{1,64})$/;

function parseHash(hash) {
  const iap = IAP_ID.exec(hash || '');
  if (iap) return { kind: 'iapNotification', id: iap[1] };
  const match = /^#(event|user|report|feedback|inquiry)\/([1-9]\d*)$/.exec(hash || '');
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) ? { kind: match[1], id } : null;
}

function setDetailHash(hash) {
  history.replaceState(null, '', location.pathname + location.search + hash);
}

function resetDetail() {
  detailRequest++;
  detailStack.length = 0;
  currentDetail = null;
  setDetailHash('');
  const body = document.getElementById('detail-body');
  body.querySelectorAll('video').forEach((video) => video.pause());
  body.replaceChildren();
}

function closeDetail() {
  document.getElementById('detail').close();
  resetDetail();
}

function renderDetail() {
  const body = document.getElementById('detail-body');
  const bar = el('div', null, 'jump-row');
  if (detailStack.length) {
    const back = el('button', '← 뒤로', 'btn btn-sm back-btn');
    back.addEventListener('click', () => {
      detailRequest++;
      currentDetail = detailStack.pop();
      renderDetail();
    });
    bar.append(back);
  }
  const close = el('button', '닫기', 'btn btn-sm');
  close.addEventListener('click', closeDetail);
  bar.append(close);
  body.querySelectorAll('video').forEach((video) => video.pause());
  body.replaceChildren(bar, currentDetail.node);
  setDetailHash(currentDetail.hash);
}

function openDialog(node) {
  if (currentDetail) detailStack.push(currentDetail);
  currentDetail = { node, hash: node.dataset.hash || '' };
  renderDetail();
  const dialog = document.getElementById('detail');
  if (!dialog.open) dialog.showModal();
}

async function detailData(path) {
  const request = ++detailRequest;
  try {
    const data = await api(path);
    return request === detailRequest ? data : null;
  } catch (error) {
    if (request === detailRequest && !error.reported) toast(error.message, true);
    return null;
  }
}

function detailNode(kind, id) {
  const node = el('div');
  node.dataset.hash = `#${kind}/${id}`;
  return node;
}

function openLinkedDetail(kind, id) {
  const openers = { event: openEventDetail, user: openUserDetail, report: openReportDetail, feedback: openFeedbackDetail,
    inquiry: openInquiryDetail, iapNotification: openIapNotificationDetail,
    cameraEvents: (cameraId) => switchTab('events', { cameraId }) };
  if (id != null && Object.hasOwn(openers, kind)) return openers[kind](id);
}

function idChip(kind, id, label) {
  if (id == null) return el('span', '—');
  const button = el('button', label || `#${id}`, 'chip');
  button.type = 'button';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openLinkedDetail(kind, id);
  });
  return button;
}

function safeHttpUrl(str) {
  try {
    const url = new URL(str);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function clipPlayer(url, poster) {
  const box = el('div', null, 'clip-player');
  const src = safeHttpUrl(url);
  if (!src) {
    box.append(el('p', '재생 주소가 없거나 올바르지 않습니다.', 'muted'));
    return box;
  }
  const video = el('video');
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.src = src;
  const thumbnail = safeHttpUrl(poster);
  if (thumbnail) video.poster = thumbnail;
  const note = el('p', '재생 URL은 5분 유효 — 만료되면 다시 열기', 'muted clip-note');
  video.addEventListener('error', () => { note.textContent = '재생할 수 없습니다. 주소가 만료됐다면 상세 화면을 다시 여세요.'; });
  box.append(video, note);
  return box;
}

function dl(pairs) {
  const box = el('dl');
  for (const [k, v] of pairs) box.append(el('dt', k), el('dd', v ?? '—'));
  return box;
}

function subTable(title, cols, rows) {
  const frag = el('section', null, 'detail-table');
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
  const u = await detailData(`/admin/users/${userId}`);
  if (!u) return;
  const request = detailRequest;
  // 구독은 따로 가져온다 — 탈퇴 유저는 404 가 정상이고, 구독 조회가 실패해도 상태 변경 같은 기존 기능은 열려야 한다
  let sub = null;
  if (u.status !== 'DELETED') {
    try {
      sub = await api(`/admin/users/${userId}/subscription`);
    } catch (e) {
      if (!e.reported) toast(e.message, true);
    }
    if (request !== detailRequest) return;
  }
  const frag = detailNode('user', u.id);
  frag.append(el('h2', `유저 #${u.id} — ${u.nickname}`));
  const jumps = el('div', null, 'jump-row');
  for (const [label, tab, sub] of [['📋 이벤트 보기', 'events'], ['🔔 리포트 알림', 'notifications', 'reports'], ['🔔 이벤트 알림', 'notifications', 'events']]) {
    const button = el('button', label, 'btn btn-sm');
    button.addEventListener('click', () => {
      if (sub) notifSub = sub;
      switchTab(tab, { userId: u.id });
    });
    jumps.append(button);
  }
  frag.append(jumps);
  frag.append(dl([
    ['가입경로', u.provider], ['상태', u.status], ['역할', u.role],
    ['가입일', fmtDate(u.createdAt)],
  ]));
  frag.append(subTable('강아지', [
    { key: 'id', label: 'ID' }, { key: 'name', label: '이름' }, { key: 'breed', label: '견종' },
  ], u.dogs));
  frag.append(el('h2', '카메라'), buildTable([
    { key: 'id', label: 'ID' }, { key: 'name', label: '이름' },
    { key: 'pairedAt', label: '페어링', fmt: fmtDate },
  ], u.cameras, { onRow: (camera) => switchTab('events', { cameraId: camera.id }) }));

  // 상태 변경
  const row = el('div', null, 'status-row');
  const sel = el('select');
  for (const s of USER_STATUSES) sel.append(selectOption(s, s, s === u.status));
  const btn = el('button', '상태 변경', 'btn btn-sm btn-primary');
  btn.addEventListener('click', async () => {
    if (sel.value === u.status) return toast('현재 상태와 동일합니다', true);
    if (!confirm(`[${environment}] 유저 #${u.id} 상태를 ${u.status} → ${sel.value} 로 변경할까요?`)) return;
    btn.disabled = true;
    try {
      await api(`/admin/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedStatus: u.status, status: sel.value }), // 내가 본 상태 그대로일 때만 바뀐다 (낙관적 락)
        errorMessages: { '409:ADMIN_STATUS_CONFLICT': '다른 관리자가 먼저 바꿨어요' },
      });
    } catch (e) {
      btn.disabled = false;
      if (e.message !== 'ADMIN_STATUS_CONFLICT') {
        if (!e.reported) toast(e.message, true);
        return;
      }
      const latest = await detailData(`/admin/users/${u.id}`);
      if (!latest) return;
      frag.querySelector('.conflict-box')?.remove();
      frag.append(showConflict({
        title: '다른 관리자가 먼저 상태를 바꿨어요',
        latest: [['상태', latest.status]],
        mine: [['내가 보던 상태', u.status], ['바꾸려던 상태', sel.value]],
        reload: () => reopenDetail(() => openUserDetail(u.id)),
      }));
      return;
    }
    toast('상태가 변경되었습니다');
    document.getElementById('detail').close();
    TABS.users.load().catch(() => {});
  });
  row.append(sel, btn);
  if (environment === 'develop') {
    const reportBtn = el('button', '📨 리포트 지금 발송', 'btn btn-sm');
    reportBtn.addEventListener('click', async () => {
      reportBtn.disabled = true;
      try {
        const data = await api(`/dev/reports/trigger?${new URLSearchParams({ userId: u.id })}`, {
          method: 'POST',
          errorMessages: { '409:RPT_ALREADY_EXISTS': '오늘 리포트가 이미 있어요. DB에서 지우고 다시 시도' },
        });
        toast(`리포트 #${data.reportId} — ${data.status}`);
      } catch (e) {
        if (!e.reported) toast(e.message, true);
      } finally {
        reportBtn.disabled = false;
      }
    });
    row.append(reportBtn);
  }
  frag.append(row);
  frag.append(sub ? subscriptionSection(frag, u, sub) : subscriptionMissing());
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
      { key: 'eventId', label: '이벤트', link: 'event' },
      { key: 'eventCategory', label: '카테고리' },
      { key: 'sourceType', label: '소스' },
      { key: 'reasonCode', label: '사유' },
      { key: 'detail', label: '내용', trunc: true },
      { key: 'reporterUserId', label: '신고자 ID', link: 'user' },
      { key: 'reporterNickname', label: '신고자' },
      { key: 'createdAt', label: '신고일', fmt: fmtDate },
    ], data.items, (row) => openFeedbackDetail(row.id));
    renderPager(data, movePage);
  },
};

async function openFeedbackDetail(feedbackId) {
  const f = await detailData(`/admin/feedbacks/${feedbackId}`);
  if (!f) return;
  const frag = detailNode('feedback', f.id);
  frag.append(el('h2', `피드백 #${f.id}`));
  const links = el('div', null, 'jump-row');
  links.append(idChip('event', f.eventId, `이벤트 #${f.eventId}`), idChip('user', f.reporterUserId, `#${f.reporterUserId} ${f.reporterNickname || ''}`));
  frag.append(links);
  frag.append(dl([
    ['이벤트 종류', `${f.eventCategory} (${f.sourceType})`],
    ['신뢰도', f.confidence], ['길이(초)', f.durationSec],
    ['감지 시각', fmtDate(f.detectedAt)],
    ['신고 사유', f.reasonCode], ['내용', f.detail],
    ['신고일', fmtDate(f.createdAt)],
  ]));
  frag.append(f.playbackUrl ? clipPlayer(f.playbackUrl, f.thumbnailUrl) : el('p', '클립 없음 또는 만료', 'muted'));
  openDialog(frag);
}

// ============ 문제 신고 탭 (AISW-443) ============
// 앱 `58 설정 / 문제 신고` 에서 들어온 것. 이벤트에 묶인 오탐 신고(피드백 탭)와 다른 창구다.
// 유형 라벨은 앱 칩과 같은 말을 쓴다 — 사용자가 고른 그대로 읽혀야 한다.
const INQUIRY_KINDS = {
  NOTIFICATION: '알림 문제', DETECTION: '감지 문제', CONNECTION: '연결 문제', VIDEO: '영상', ETC: '그 외',
};

function inquiryKindsText(kinds) {
  if (!kinds || kinds.length === 0) return '—';
  return kinds.map((kind) => INQUIRY_KINDS[kind] || kind).join(', ');
}

TABS.inquiries = {
  async load() {
    renderFilters([
      { name: 'kind', label: '유형', type: 'select', options: Object.keys(INQUIRY_KINDS) },
    ]);
    const data = await api(`/admin/inquiries?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'kinds', label: '유형', fmt: inquiryKindsText },
      { key: 'detail', label: '내용', trunc: true },
      { key: 'platform', label: '기기', fmt: (platform, row) => `${platform} · ${row.appVersion}` },
      { key: 'attachmentCount', label: '첨부' },
      { key: 'reporterUserId', label: '신고자 ID', link: 'user' },
      { key: 'reporterNickname', label: '신고자' },
      { key: 'status', label: '상태' },
      { key: 'createdAt', label: '신고일', fmt: fmtDate },
    ], data.items, (row) => openInquiryDetail(row.id));
    renderPager(data, movePage);
  },
};

// 첨부 한 건. 사진은 이미지로, 클립은 플레이어로 — 둘 다 presigned URL 이라 5분 뒤 만료된다.
// 클립은 신고가 참조만 하므로 보관 기한(운영 24시간)이 지나면 url 이 null 이고 expired=true 다.
function inquiryAttachmentNode(attachment) {
  const box = el('figure', null, 'inquiry-attachment');
  if (attachment.type === 'PHOTO') {
    const src = safeHttpUrl(attachment.url);
    if (!src) {
      box.append(el('p', '사진 주소가 없거나 올바르지 않습니다.', 'muted'));
      return box;
    }
    const link = el('a');
    link.href = src;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const img = el('img');
    img.src = src;
    img.alt = '신고 첨부 사진';
    img.loading = 'lazy';
    img.addEventListener('error', () => { box.replaceChildren(el('p', '사진을 불러올 수 없습니다. 주소가 만료됐다면 상세 화면을 다시 여세요.', 'muted')); });
    link.append(img);
    box.append(link, el('figcaption', '사진 — 누르면 원본', 'muted'));
    return box;
  }
  if (attachment.expired || !attachment.url) {
    box.append(el('p', `클립 #${attachment.clipId} — 보관 기한이 지나 재생할 수 없습니다.`, 'muted'));
    return box;
  }
  box.append(clipPlayer(attachment.url), el('figcaption', `클립 #${attachment.clipId}`, 'muted'));
  return box;
}

async function openInquiryDetail(inquiryId) {
  const q = await detailData(`/admin/inquiries/${inquiryId}`);
  if (!q) return;
  const frag = detailNode('inquiry', q.id);
  frag.append(el('h2', `문제 신고 #${q.id}`));
  const links = el('div', null, 'jump-row');
  links.append(idChip('user', q.reporterUserId, `#${q.reporterUserId} ${q.reporterNickname || ''}`));
  frag.append(links);
  frag.append(dl([
    ['유형', inquiryKindsText(q.kinds)],
    ['상태', q.status],
    ['기기', q.platform], ['앱 버전', q.appVersion],
    ['내용', q.detail],
    ['신고일', fmtDate(q.createdAt)],
  ]));
  const attachments = q.attachments || [];
  const section = el('section', null, 'inquiry-attachments');
  section.append(el('h2', `첨부 ${attachments.length}건`));
  if (attachments.length === 0) section.append(el('p', '첨부 없음', 'muted'));
  for (const attachment of attachments) section.append(inquiryAttachmentNode(attachment));
  frag.append(section);
  openDialog(frag);
}

// ============ 이벤트 탭 ============
TABS.events = {
  async load() {
    renderFilters([
      { name: 'userId', label: '유저 ID', type: 'number' },
      { name: 'cameraId', label: '카메라 ID', type: 'number' },
      { name: 'status', label: '상태', type: 'select', options: ['DETECTED', 'UPLOADED', 'ANALYZED', 'FAILED'] },
      { name: 'from', label: '시작일', type: 'date' },
      { name: 'to', label: '종료일', type: 'date' },
    ]);
    const data = await api(`/admin/events?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'detectedAt', label: '시각', fmt: fmtDate },
      { key: 'cameraId', label: '카메라', link: 'cameraEvents' },
      { key: 'dogName', label: '강아지' },
      { key: 'sourceType', label: '종류', fmt: (v, row) => `${v} / ${row.category}` },
      { key: 'status', label: '상태' },
      { key: 'failCode', label: '실패코드', badge: (row) => row.status === 'FAILED' },
      { key: 'confidence', label: 'confidence' },
      { key: 'durationSec', label: '길이(초)' },
    ], data.items, (row) => openEventDetail(row.id));
    renderPager(data, movePage);
  },
};

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
      { key: 'eventId', label: '이벤트', link: 'event' },
      { key: 'clipId', label: '클립' },
      { key: 'modelName', label: '모델' },
      { key: 'promptVersion', label: '프롬프트' },
      { key: 'verdict', label: '판정' },
      { key: 'severity', label: '심각도' },
      { key: 'summary', label: '요약', trunc: true },
      { key: 'latencyMs', label: '지연(ms)' },
      { key: 'tokenCost', label: '토큰비용' },
      { key: 'analyzedAt', label: '분석 시각', fmt: fmtDate },
    ], data.items, (row) => openLinkedDetail('event', row.eventId));
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
      { name: 'userId', label: '유저 ID', type: 'number' },
      { name: 'status', label: '발송 상태', type: 'select', options: ['PENDING', 'SENT', 'FAILED'] },
      { name: 'from', label: '시작일', type: 'date' },
      { name: 'to', label: '종료일', type: 'date' },
    ], toggle);
    const data = await api(`/admin/notification-logs/${notifSub}?${listQuery()}`);
    renderTable([
      { key: 'id', label: 'ID' },
      { key: 'userId', label: '유저', link: 'user' },
      { key: notifSub === 'reports' ? 'reportId' : 'eventId', label: notifSub === 'reports' ? '리포트' : '이벤트', link: notifSub === 'reports' ? 'report' : 'event' },
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

// ============ 충돌 화면 (낙관적 락 409) ============
// 자동 재시도는 하지 않는다 — 최신 값과 내가 넣으려던 값을 나란히 보여 주고 사람이 다시 정한다.
// latest/mine: [[라벨, 값], ...] (호출한 쪽이 재조회해서 넘긴다). 값은 dl()→textContent 로만 들어간다.
function showConflict({ title, latest, mine, reload }) {
  const box = el('section', null, 'conflict-box');
  box.setAttribute('role', 'alert');
  const cols = el('div', null, 'conflict-cols');
  for (const [heading, pairs] of [['최신 값', latest], ['내가 넣으려던 값', mine]]) {
    const col = el('div', null, 'conflict-col');
    col.append(el('h3', heading), dl(pairs));
    cols.append(col);
  }
  const again = el('button', '최신으로 다시 보기', 'btn btn-sm btn-primary');
  again.addEventListener('click', reload);
  box.append(el('h2', title), cols, again);
  return box;
}

// 충돌 화면의 "다시 보기" — 지금 상세를 스택에 쌓지 않고 같은 자리에서 다시 연다
function reopenDetail(open) {
  currentDetail = detailStack.pop() ?? null;
  return open();
}

// ============ 구독 (유저 상세 카드) ============
const TIERS = ['FREE', 'STANDARD', 'PREMIUM'];

// datetime-local 값은 "내 시계 기준" 문자열 — toISOString 은 UTC 라 오프셋을 빼서 맞춘다
function localInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function overrideText(sub) {
  return sub.overrideTier ? `${sub.overrideTier} ~ ${fmtDate(sub.overrideUntil)} (${sub.overrideReason ?? '사유 없음'})` : '없음';
}

function subscriptionMissing() {
  const box = el('section', null, 'detail-section');
  box.append(el('h2', '구독'), el('p', '구독 정보 없음', 'muted'));
  return box;
}

function subscriptionSection(frag, u, sub) {
  const box = el('section', null, 'detail-section');
  const valid = sub.tier !== 'FREE' && sub.entitlementUntil && new Date(sub.entitlementUntil) > new Date();
  box.append(el('h2', '구독'), dl([
    ['등급', sub.tier], ['유효', valid ? '✓' : '—'], ['만료', fmtDate(sub.entitlementUntil)],
    ['스토어', sub.provider], ['스토어 상태', sub.storeStatus], ['자동갱신', sub.autoRenew == null ? '—' : booleanText(sub.autoRenew)],
    ['수동 지급', overrideText(sub)],
  ]));
  box.append(subTable('거래 내역', [
    { key: 'purchaseDate', label: '결제', fmt: fmtDate }, { key: 'provider', label: '스토어' },
    { key: 'productId', label: '상품' }, { key: 'expiresDate', label: '만료', fmt: fmtDate },
    { key: 'revocationDate', label: '취소', fmt: fmtDate }, { key: 'environment', label: '환경' },
    { key: 'transactionId', label: '거래 ID' },
  ], sub.transactions || []));
  box.append(subTable('지급 이력', [
    { key: 'createdAt', label: '시각', fmt: fmtDate }, { key: 'adminUserId', label: '관리자', link: 'user' },
    { key: 'tier', label: '등급' }, { key: 'until', label: '기한', fmt: fmtDate }, { key: 'reason', label: '사유' },
  ], sub.overrideLogs || []));

  // 수동 지급 폼
  const form = el('form', null, 'grant-form');
  const tier = el('select');
  tier.setAttribute('aria-label', '지급 등급');
  for (const t of TIERS) tier.append(selectOption(t, t, t === 'PREMIUM'));
  const until = el('input');
  until.type = 'datetime-local';
  until.required = true;
  until.setAttribute('aria-label', '지급 기한');
  const quick = el('span', null, 'quick-days');
  for (const days of [7, 30, 90]) {
    const b = el('button', `${days}일`, 'btn btn-sm');
    b.type = 'button';
    b.addEventListener('click', () => { until.value = localInputValue(new Date(Date.now() + days * 86400000)); });
    quick.append(b);
  }
  const reason = el('input');
  reason.maxLength = 200;
  reason.required = true;
  reason.placeholder = '사유 (필수, 200자 이내)';
  reason.setAttribute('aria-label', '지급 사유');
  const grant = el('button', '지급', 'btn btn-sm btn-primary');
  grant.type = 'submit';
  form.append(tier, until, quick, reason, grant);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const untilDate = new Date(until.value); // datetime-local 은 내 시계 기준 → ISO(UTC) 로 보낸다
    if (Number.isNaN(untilDate.getTime())) return toast('기한을 골라 주세요', true);
    const mine = [['등급', tier.value], ['기한', fmtDate(untilDate.toISOString())], ['사유', reason.value.trim()]];
    if (!confirm(`[${environment}] 유저 #${u.id} 에게 ${tier.value} 를 ${fmtDate(untilDate.toISOString())} 까지 지급할까요?`)) return;
    grant.disabled = true;
    try {
      await api(`/admin/users/${u.id}/subscription-override`, {
        method: 'PUT',
        body: JSON.stringify({ tier: tier.value, until: untilDate.toISOString(), reason: reason.value.trim(), version: sub.version }),
        errorMessages: { '409:SUB_CONFLICT': '다른 관리자가 먼저 바꿨어요' },
      });
    } catch (e) {
      grant.disabled = false;
      if (e.message !== 'SUB_CONFLICT') {
        if (!e.reported) toast(e.message, true);
        return;
      }
      const latest = await detailData(`/admin/users/${u.id}/subscription`);
      if (!latest) return;
      frag.querySelector('.conflict-box')?.remove();
      const conflict = showConflict({
        title: '다른 관리자가 먼저 바꿨어요',
        latest: [['등급', latest.tier], ['만료', fmtDate(latest.entitlementUntil)], ['수동 지급', overrideText(latest)]],
        mine,
        reload: () => reopenDetail(() => openUserDetail(u.id)),
      });
      frag.append(conflict);
      conflict.scrollIntoView({ block: 'nearest' });
      return;
    }
    toast('지급했어요');
    if (S.tab === 'subscriptions') TABS.subscriptions.load().catch(() => {});
    reopenDetail(() => openUserDetail(u.id));
  });
  box.append(el('h2', '수동 지급'), form);

  const help = el('p', 'FREE로 지급하거나 기한을 지금으로 하면 회수. 스토어 결제는 회수되지 않음 — 환불은 ', 'muted');
  for (const [label, href] of [['App Store Connect', 'https://appstoreconnect.apple.com/'], ['Play Console', 'https://play.google.com/console/']]) {
    const a = el('a', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    help.append(a, label === 'App Store Connect' ? ' / ' : '');
  }
  help.append('에서');
  box.append(help);
  return box;
}

// ============ 구독 탭 ============
const SUB_STATUSES = ['ACTIVE', 'EXPIRED', 'BILLING_RETRY', 'GRACE', 'REVOKED', 'PAUSED'];
const yesDash = (v) => (v ? '✓' : '—');

function summaryCards(s) {
  const row = el('div', null, 'summary-cards');
  const tier = s.activeByTier || {};
  const store = s.activeByProvider || {};
  for (const [label, value] of [
    ['PREMIUM 유효', tier.PREMIUM], ['STANDARD 유효', tier.STANDARD],
    ['Apple 유효', store.APPLE], ['Google 유효', store.GOOGLE],
    ['7일 내 만료', s.expiringIn7Days], ['결제 재시도', s.billingRetry], ['유예', s.grace], ['수동 지급 중', s.overrideActive],
  ]) {
    const card = el('div', null, 'summary-card');
    card.append(el('span', value ?? 0, 'summary-num'), el('span', label, 'muted'));
    row.append(card);
  }
  return row;
}

TABS.subscriptions = {
  async load() {
    renderFilters([
      { name: 'tier', label: '등급', type: 'select', options: TIERS },
      { name: 'provider', label: '스토어', type: 'select', options: ['APPLE', 'GOOGLE'] },
      { name: 'status', label: '스토어 상태', type: 'select', options: SUB_STATUSES },
      { name: 'q', label: '닉네임·ID 검색', type: 'text' },
    ]);
    const [summary, data] = await Promise.all([api('/admin/subscriptions/summary'), api(`/admin/subscriptions?${listQuery()}`)]);
    renderTable([
      { key: 'userId', label: 'ID' },
      { key: 'nickname', label: '닉네임' },
      { key: 'tier', label: '등급' },
      { key: 'active', label: '유효', fmt: yesDash },
      { key: 'provider', label: '스토어' },
      { key: 'storeStatus', label: '스토어 상태' },
      { key: 'entitlementUntil', label: '만료', fmt: fmtDate },
      { key: 'autoRenew', label: '자동갱신', fmt: (v) => (v == null ? '—' : booleanText(v)) },
      { key: 'overrideActive', label: '수동지급', fmt: yesDash },
    ], data.items, (row) => openUserDetail(row.userId));
    document.getElementById('table-wrap').prepend(summaryCards(summary));
    renderPager(data, movePage);
  },
};

// ============ 스토어 알림 탭 ============
let iapDefaulted = false; // 처음 들어올 때만 FAILED 로 시작 — 그 뒤 사용자가 고른 필터는 건드리지 않는다

TABS.iapNotifications = {
  async load() {
    if (!iapDefaulted) {
      iapDefaulted = true;
      S.filters = { ...S.filters, state: 'FAILED' };
    }
    renderFilters([
      { name: 'provider', label: '스토어', type: 'select', options: ['APPLE', 'GOOGLE'] },
      { name: 'state', label: '상태', type: 'select', options: ['FAILED', 'PENDING', 'DONE'] },
    ]);
    const data = await api(`/admin/iap-notifications?${listQuery()}`);
    renderTable([
      { key: 'receivedAt', label: '받은 시각', fmt: fmtDate },
      { key: 'provider', label: '스토어' },
      { key: 'type', label: 'type/subtype', fmt: (type, row) => (row.subtype ? `${type}/${row.subtype}` : type) },
      { key: 'attempts', label: '시도' },
      { key: 'processedAt', label: '처리 시각', fmt: fmtDate },
      { key: 'error', label: '에러', trunc: true },
      { key: 'state', label: '상태', badge: (row) => row.state === 'FAILED' },
    ], data.items, (row) => openIapNotificationDetail(row.notificationUuid));
    renderPager(data, movePage);
  },
};

function prettyPayload(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw ?? '—';
  }
}

async function openIapNotificationDetail(uuid) {
  const data = await detailData(`/admin/iap-notifications/${encodeURIComponent(uuid)}`);
  if (!data) return;
  const n = data.item;
  const frag = detailNode('iapNotification', n.notificationUuid);
  frag.append(el('h2', `스토어 알림 ${n.notificationUuid}`), dl([
    ['스토어', n.provider], ['type/subtype', n.subtype ? `${n.type}/${n.subtype}` : n.type],
    ['상태', n.state], ['시도 횟수', n.attempts], ['에러', n.error],
    ['받은 시각', fmtDate(n.receivedAt)], ['스토어 서명 시각', fmtDate(data.signedDate)], ['처리 시각', fmtDate(n.processedAt)],
  ]));
  if (n.state === 'FAILED') {
    const retry = el('button', '다시 처리', 'btn btn-sm btn-primary');
    retry.addEventListener('click', async () => {
      if (!confirm(`[${environment}] 스토어 알림 ${n.notificationUuid} 를 다시 처리할까요?`)) return;
      retry.disabled = true;
      try {
        await api(`/admin/iap-notifications/${encodeURIComponent(n.notificationUuid)}/retry`, {
          method: 'POST',
          body: JSON.stringify({ version: n.version }),
          errorMessages: { '409:SUB_CONFLICT': '다른 관리자가 먼저 바꿨어요' },
        });
      } catch (e) {
        retry.disabled = false;
        if (e.message !== 'SUB_CONFLICT') {
          if (!e.reported) toast(e.message, true);
          return;
        }
        const latest = await detailData(`/admin/iap-notifications/${encodeURIComponent(n.notificationUuid)}`);
        if (!latest) return;
        frag.querySelector('.conflict-box')?.remove();
        frag.append(showConflict({
          title: '다른 관리자가 먼저 바꿨어요',
          latest: [['상태', latest.item.state], ['시도 횟수', latest.item.attempts], ['에러', latest.item.error]],
          mine: [['요청', '다시 처리'], ['내가 보던 시도 횟수', n.attempts]],
          reload: () => reopenDetail(() => openIapNotificationDetail(n.notificationUuid)),
        }));
        return;
      }
      toast('다시 처리 대기열에 넣었어요 (10분 안에 처리)');
      closeDetail();
      TABS.iapNotifications.load().catch(() => {});
    });
    const actions = el('div', null, 'jump-row');
    actions.append(retry);
    frag.append(actions);
  }
  frag.append(el('h2', '원본 payload'), el('pre', prettyPayload(data.rawPayload), 'raw-payload'));
  openDialog(frag);
}

// ============ DB 테이블 브라우저 ============
let currentTable = null;

async function loadTableNav() {
  const names = await api('/admin/tables');
  const nav = document.getElementById('table-nav');
  for (const name of names) {
    const b = el('button', name, 'tab');
    b.dataset.table = name;
    b.addEventListener('click', () => switchTable(name));
    nav.append(b);
  }
}

function switchTable(name) {
  closeDetail();
  currentTable = name;
  S.tab = 'table';
  S.page = 0;
  S.filters = {};
  for (const b of document.querySelectorAll('.sidebar .tab')) {
    b.classList.toggle('active', b.dataset.table === name);
  }
  TABS.table.load().catch(() => {});
}

TABS.table = {
  async load() {
    // 필터 대신 현재 테이블명 표시
    document.getElementById('filters').replaceChildren(el('span', currentTable, 'muted'));
    const data = await api(`/admin/tables/${currentTable}?${listQuery()}`);
    const cols = data.columns.length
      ? data.columns.map((name, i) => ({ key: i, label: name }))
      : [{ key: 0, label: '—' }]; // 빈 테이블 — buildTable의 "데이터 없음" 문구가 나오게 컬럼 1개 유지
    renderTable(cols, data.rows);
    renderPager(data, movePage);
  },
};

function valueText(value) {
  if (value == null) return '—';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

function booleanText(value) {
  return value == null ? '알 수 없음' : value ? '예' : '아니요';
}

function detailBadge(value, kind) {
  return el('span', value ?? '—', `badge badge-${kind}-${String(value || '').toLowerCase().replace(/[^a-z_]/g, '')}`);
}

function eventPipeline(event) {
  const box = el('section', null, 'pipeline-box');
  const strip = el('ol', null, 'pipeline');
  const sent = (event.notificationLogs || []).some((log) => log.status === 'SENT');
  const failed = event.status === 'FAILED';
  // 실패 전 상태가 없어서 남아 있는 클립과 분석으로 마지막 단계를 짐작한다.
  const reached = failed ? (event.analysis ? 2 : event.clip ? 1 : 0)
    : ['DETECTED', 'UPLOADED', 'ANALYZED'].indexOf(event.status);
  for (const [index, label] of ['감지', '업로드', '분석', '알림'].entries()) {
    const done = index === 3 ? sent : index <= reached;
    const fail = failed && index === reached + 1 && !done;
    const state = done ? 'done' : fail ? 'fail' : 'pending';
    const step = el('li', null, `step ${state}`);
    step.append(el('span', done ? '✓' : fail ? '!' : index + 1, 'step-mark'),
      el('span', label), el('small', done ? '완료' : fail ? '실패' : '대기'));
    strip.append(step);
  }
  box.append(strip);
  if (failed) box.append(el('p', `실패 코드: ${event.failCode || '알 수 없음'} · 실패 위치는 남아 있는 클립과 분석으로 추정합니다.`, 'pipeline-error'));
  return box;
}

function eventClip(clip) {
  const box = el('section', null, 'detail-section');
  box.append(el('h2', '클립'));
  if (!clip || clip.deletedAt) {
    box.append(el('p', clip ? '클립 만료(삭제됨)' : '클립 없음(소리만 이벤트)', 'muted'));
    return box;
  }
  box.append(clipPlayer(clip.playbackUrl, clip.thumbnailUrl));
  const size = clip.fileSizeBytes == null ? '—' : `${(clip.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  box.append(el('p', `보호: ${booleanText(clip.isProtected)} · 만료 예정: ${fmtDate(clip.expiresAt)} · 파일 크기: ${size}`, 'muted clip-note'));
  return box;
}

function analysisCard(analysis) {
  const box = el('section', null, 'analysis-card detail-section');
  box.append(el('h2', '분석'));
  if (!analysis) {
    box.append(el('p', '분석 없음', 'muted'));
    return box;
  }
  const badges = el('div', null, 'jump-row');
  badges.append(detailBadge(analysis.verdict, 'verdict'), detailBadge(analysis.severity, 'sev'));
  box.append(badges, el('p', analysis.summary ?? '요약 없음', 'detail-text'));
  box.append(dl([
    ['주요 행동', valueText(analysis.mainBehavior)], ['이상 행동', valueText(analysis.abnormalBehaviors)],
    ['강아지가 보이나요?', booleanText(analysis.dogPresent)], ['근거가 부족한가요?', booleanText(analysis.insufficientEvidence)],
    ['모델', analysis.modelName], ['프롬프트 버전', analysis.promptVersion],
    ['처리 시간(ms)', analysis.latencyMs], ['사용 토큰', analysis.totalTokens], ['분석 시각', fmtDate(analysis.analyzedAt)],
  ]));
  const raw = el('details');
  raw.append(el('summary', '분석 원본 보기'), el('pre', valueText(analysis.rawResponse)));
  box.append(raw);
  return box;
}

function notificationTable(logs) {
  return subTable('알림 로그', [
    { key: 'id', label: 'ID' }, { key: 'userId', label: '유저', link: 'user' },
    { key: 'channel', label: '채널' }, { key: 'title', label: '제목' },
    { key: 'body', label: '내용' }, { key: 'status', label: '상태' },
    { key: 'failReason', label: '실패 사유' }, { key: 'sentAt', label: '발송 시각', fmt: fmtDate },
    { key: 'createdAt', label: '생성 시각', fmt: fmtDate },
  ], logs || []);
}

async function openEventDetail(eventId) {
  const event = await detailData(`/admin/events/${eventId}`);
  if (!event) return;
  const box = detailNode('event', event.id);
  box.append(el('h2', `이벤트 #${event.id} — ${event.category || '—'} (${event.sourceType || '—'})`));
  const links = el('div', null, 'jump-row');
  links.append(idChip('user', event.userId, `#${event.userId} ${event.userNickname || ''}`),
    idChip('cameraEvents', event.cameraId, `카메라 #${event.cameraId} ${event.cameraName || ''}`),
    el('span', `강아지: ${event.dogName || '—'}`), detailBadge(event.status, 'status'));
  box.append(links, eventPipeline(event), dl([
    ['감지 시각', fmtDate(event.detectedAt)], ['신뢰도', event.confidence],
    ['길이(초)', event.durationSec], ['생성 시각', fmtDate(event.createdAt)],
  ]), eventClip(event.clip), analysisCard(event.analysis));
  const reports = el('section', null, 'detail-section detail-table');
  reports.append(el('h2', '신고'), buildTable([
    { key: 'id', label: '신고', link: 'feedback' }, { key: 'reasonCode', label: '사유' },
    { key: 'detail', label: '내용' }, { key: 'reporterUserId', label: '신고자', link: 'user' },
    { key: 'reporterNickname', label: '닉네임' }, { key: 'createdAt', label: '신고 시각', fmt: fmtDate },
  ], event.feedbacks || [], { onRow: (feedback) => openFeedbackDetail(feedback.id), emptyText: '없음' }));
  box.append(reports, notificationTable(event.notificationLogs));
  openDialog(box);
}

async function openReportDetail(reportId) {
  const report = await detailData(`/admin/reports/${reportId}`);
  if (!report) return;
  const box = detailNode('report', report.id);
  box.append(el('h2', `리포트 #${report.id}`));
  const links = el('div', null, 'jump-row');
  links.append(idChip('user', report.userId, `#${report.userId} ${report.userNickname || ''}`),
    el('span', `강아지: ${report.dogName || '—'}`), el('span', report.reportDate || '—'), detailBadge(report.status, 'status'));
  box.append(links);
  for (const [title, text] of [['제목', report.headline], ['요약', report.summaryText], ['돌봄 안내', report.careSuggestion]]) {
    box.append(el('h2', title), el('p', text ?? '—', 'detail-text'));
  }
  box.append(subTable('지표', [
    { key: 'metricType', label: '종류' }, { key: 'metricValue', label: '값' }, { key: 'delta', label: '변화량' },
  ], report.metrics || []));
  box.append(el('h2', '생성 정보'), dl([
    ['모델', report.modelName], ['프롬프트 버전', report.promptVersion],
    ['연결 끊김(분)', report.offlineMinutes], ['이벤트 수', report.eventCount], ['생성 시도 횟수', report.generationAttempts],
    ['생성 완료', fmtDate(report.generatedAt)], ['발송 시각', fmtDate(report.sentAt)], ['읽은 시각', fmtDate(report.readAt)],
    ['예약 시각', fmtDate(report.scheduledAt)], ['관찰 시작', fmtDate(report.observingSince)], ['생성 시각', fmtDate(report.createdAt)],
  ]), notificationTable(report.notificationLogs));
  openDialog(box);
}
