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
function kakaoLoginUrl() {
  const p = new URLSearchParams({
    client_id: ADMIN_CONFIG.KAKAO_CLIENT_ID,
    redirect_uri: ADMIN_CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: 'openid',
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

// 스펙 리스크: 이 교환이 브라우저 CORS에 막히면 백엔드 code 교환 엔드포인트가 플랜 B.
async function exchangeCode(code) {
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ADMIN_CONFIG.KAKAO_CLIENT_ID,
      redirect_uri: ADMIN_CONFIG.REDIRECT_URI,
      code,
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
  document.getElementById('btn-kakao').addEventListener('click', () => {
    location.href = kakaoLoginUrl();
  });
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout2').addEventListener('click', logout);

  const code = new URLSearchParams(location.search).get('code');
  if (code) {
    history.replaceState(null, '', location.pathname); // code 재사용 방지
    try {
      await loginWithIdToken(await exchangeCode(code));
    } catch (e) {
      toast(e.message, true);
    }
  }
  if (tokens.access) startApp();
  else showView('login');
});
