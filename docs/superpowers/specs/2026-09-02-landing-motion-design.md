# 보고있개 웹사이트 모션·디테일 강화 디자인

날짜: 2026-09-02
상태: 승인됨

## 목표

현재 애니메이션이 전혀 없는 정적 랜딩 사이트에 GSAP 기반 모션과 디자인 디테일을 더해, "AI가 만든 티"가 나지 않는 프리미엄 브랜드 사이트로 다듬는다. 기존 다크·크림 교차 킨포크풍 아이덴티티(팔레트·섹션 구성)는 유지한다.

## 범위

- 대상 페이지: `index.html`, `privacy.html`, `support.html`, `account-deletion.html` (전체 4페이지)
- 변경 파일: 4개 HTML(스크립트 태그 + 마크업 소폭), `css/style.css`, `js/main.js`(신규)
- 새 의존성: GSAP 3 코어 + ScrollTrigger (jsdelivr CDN, `defer` 로드) — 빌드 도구 도입 없음
- 디자인 가이드: taste-skill (`npx skills add https://github.com/Leonxlnx/taste-skill`) 을 구현 시 참조

## 선택한 접근

CDN + 바닐라 JS. npm/Vite 빌드 파이프라인은 4페이지 정적 사이트(GitHub Pages 배포)에 과하므로 배제. GSAP 코어+ScrollTrigger는 CDN 합산 약 90KB gzip.

## 모션 설계 (index.html) — 은은한 프리미엄 톤

| 대상 | 모션 |
|------|------|
| 히어로 | 로드 시 배지 → 타이틀 → 문단 순차 페이드·라이즈(stagger). 스크롤 시 배경 이미지 미세 패럴랙스 |
| 섹션 공통 | 뷰포트 진입 시 콘텐츠 페이드·라이즈 리빌. 한 번만 재생 후 고정 |
| 레이더 링 | GSAP 반복 트윈으로 무한 펄스 확산 |
| 행동 칩 그리드 | 진입 시 칩 스태거 등장 |
| 기능 카드 | 스태거 등장 + 호버 리프트(CSS) |
| 네비 | 스크롤 내리면 축소·배경 진해짐 |

`prefers-reduced-motion: reduce` 사용자는 모든 모션을 건너뛴다(접근성 — 생략 불가).

## 디테일 개선 (AI티 제거)

taste-skill 원칙 적용:

- 타이포그래피: 제목 자간·행간 미세 조정, 크기 대비 확대
- 간격 리듬 정리, 섹션 전환부 여백 재조정
- 호버·포커스 상태 추가 (현재 거의 없음)
- 이미지 처리: 히어로 비네트 유지, 텍스처·그레인 등 taste-skill 제안 반영

## 문서 페이지 (privacy · support · account-deletion)

- 공유 `main.js` 로드, 헤더·본문 진입 페이드만 적용 (은은하게)
- 문서 타이포·간격 개선을 공유 CSS로 반영

## 검증

- 로컬 서버 + Chrome DevTools 육안 확인, 콘솔 에러 0
- `prefers-reduced-motion` 에뮬레이션으로 모션 스킵 동작 확인
- Lighthouse로 성능 저하 없음 확인 (CDN `defer` 로드라 LCP 영향 최소)

## 하지 않는 것

- 레이아웃·섹션 구성 전면 개편
- 핀 스크롤 씬, 글자 단위 타이틀 애니메이션 등 화려한 인터랙션
- npm/번들러 도입
