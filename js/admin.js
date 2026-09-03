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

async function s256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(digest));
}

function kakaoAuthorizeUrl(state, codeChallenge) {
  const p = new URLSearchParams({
    client_id: ADMIN_CONFIG.KAKAO_CLIENT_ID,
    redirect_uri: ADMIN_CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

// state = 로그인 CSRF 방어, PKCE = 공개 클라이언트라 code 탈취 대비 (둘 다 sessionStorage 왕복)
async function beginKakaoLogin() {
  const state = randB64url(32);
  const verifier = randB64url(64);
  sessionStorage.setItem('kakaoState', state);
  sessionStorage.setItem('kakaoVerifier', verifier);
  location.href = kakaoAuthorizeUrl(state, await s256(verifier));
}

// 스펙 리스크: 이 교환이 브라우저 CORS에 막히면 백엔드 code 교환 엔드포인트가 플랜 B.
async function exchangeCode(code, verifier) {
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ADMIN_CONFIG.KAKAO_CLIENT_ID,
      redirect_uri: ADMIN_CONFIG.REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`카카오 토큰 교환 실패 (${res.status})`);
  const body = await res.json();
  if (!body.id_token) throw new Error('id_token 없음 — 카카오 앱의 OpenID Connect 활성화 확인');
  return body.id_token;
}

async function loginWithIdToken(idToken) {
  const res = await fetch(`${ADMIN_CONFIG.API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'KAKAO', token: idToken }),
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

  const qs = new URLSearchParams(location.search);
  const code = qs.get('code');
  if (code) {
    history.replaceState(null, '', location.pathname); // code 재사용 방지
    const savedState = sessionStorage.getItem('kakaoState');
    const verifier = sessionStorage.getItem('kakaoVerifier');
    sessionStorage.removeItem('kakaoState');
    sessionStorage.removeItem('kakaoVerifier');
    try {
      if (!savedState || qs.get('state') !== savedState) throw new Error('state 불일치 — 로그인을 다시 시도하세요');
      await loginWithIdToken(await exchangeCode(code, verifier));
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

function renderTable(cols, rows, onRow) {
  const wrap = document.getElementById('table-wrap');
  wrap.replaceChildren();
  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  for (const c of cols) hr.append(el('th', c.label));
  thead.append(hr);
  const tbody = el('tbody');
  if (rows.length === 0) {
    const tr = el('tr');
    const td = el('td', '데이터 없음', 'muted');
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
  wrap.append(table);
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
  const u = kakaoAuthorizeUrl('st', 'ch');
  console.assert(u.startsWith('https://kauth.kakao.com/oauth/authorize?') && u.includes('scope=openid') && u.includes('state=st') && u.includes('code_challenge_method=S256'), '카카오 URL 실패');
  console.assert(b64url(new Uint8Array([251, 239])).indexOf('=') === -1, 'b64url 패딩 제거 실패');
  console.log('adminSelfCheck 통과');
}
