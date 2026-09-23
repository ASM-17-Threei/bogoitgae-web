// 배포 환경 값. KAKAO_CLIENT_ID는 REST API 키 — 공개 식별자라 커밋 OK, 시크릿은 백엔드에만 있다.
// 2026-09-23 운영 서버가 생기면서 api 와 dev-api 가 서로 다른 서버를 가리키게 됐다.
// 그 전까지는 둘이 같은 컨테이너였고, 그래서 develop 키에 api 주소가 들어가 있어도
// 아무 차이가 없었다 — 이제는 develop 을 고르면 운영 데이터를 만진다.
const ENVIRONMENTS = {
  develop: 'https://dev-api.bogoitgae.com/api/v1',
  production: 'https://api.bogoitgae.com/api/v1',
};

const ADMIN_CONFIG = {
  KAKAO_CLIENT_ID: '148d116a61650fe84cef3e8f6d30ac7e',
  REDIRECT_URI: 'https://bogoitgae.com/admin/',
};
