// 배포 환경 값. KAKAO_CLIENT_ID는 REST API 키 — 공개 식별자라 커밋 OK, 시크릿은 백엔드에만 있다.
const ENVIRONMENTS = {
  develop: 'https://api.bogoitgae.com/api/v1',
  production: null, // production 주소 미정
};

const ADMIN_CONFIG = {
  KAKAO_CLIENT_ID: '148d116a61650fe84cef3e8f6d30ac7e',
  REDIRECT_URI: 'https://bogoitgae.com/admin/',
};
