# 보고있개 랜딩 모션·디테일 강화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 애니메이션 없는 정적 랜딩 사이트에 GSAP 모션과 디자인 디테일을 더해 프리미엄 브랜드 사이트로 다듬는다.

**Architecture:** 빌드 도구 없는 정적 사이트(GitHub Pages). GSAP 3 + ScrollTrigger를 jsdelivr CDN에서 `defer` 로드하고, 신규 `js/main.js` 하나가 4개 페이지의 모든 모션을 담당한다. `body.doc` 여부로 랜딩/문서 페이지 모션을 분기한다.

**Tech Stack:** HTML, CSS, 바닐라 JS, GSAP 3.13 (코어 + ScrollTrigger), jsdelivr CDN

## Global Constraints

- 빌드 도구·npm 의존성 도입 금지. CDN `<script defer>`만 사용.
- 기존 팔레트·섹션 구성·마크업 구조 유지 (스펙: "아이덴티티 유지").
- `prefers-reduced-motion: reduce`면 모든 JS 모션 스킵 — 콘텐츠는 항상 보여야 함.
- JS 로드 실패 시에도 콘텐츠가 보여야 함 (숨김 처리는 JS가 켠 클래스 하위에서만).
- 모션 톤: 은은한 프리미엄. 핀 스크롤·글자 단위 애니메이션 금지.
- 커밋 메시지는 한국어, 기존 스타일(`chore:`, `feat:` 등 접두사) 유지.
- 스펙: `docs/superpowers/specs/2026-09-02-landing-motion-design.md`

**검증 공통 절차** (각 태스크의 "브라우저 확인" 스텝에서 사용):

```bash
# 로컬 서버 (이미 떠 있으면 재사용)
cd /Users/User/Desktop/swMaestro/bogo-dog/website
python3 -m http.server 8080 &
```

브라우저 확인은 Chrome DevTools MCP(`new_page`/`navigate_page` → `take_screenshot`, `list_console_messages`)로 한다. 콘솔 에러 0이어야 함.

---

### Task 0: taste-skill 설치

**Files:** 없음 (도구 설치)

**Interfaces:**
- Produces: `~/.claude/skills/` 아래 taste-skill — Task 3에서 디자인 가이드로 읽음

- [ ] **Step 1: 설치**

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

프롬프트가 뜨면 기본값 수락. 실패하면 `git clone https://github.com/Leonxlnx/taste-skill /tmp/taste-skill` 후 `skills/design-taste-frontend/SKILL.md` 경로만 확보해도 충분 (Task 3에서 Read로 참조만 함).

- [ ] **Step 2: 설치 확인**

SKILL.md 파일이 로컬 어딘가에 존재하는지 확인 (`ls ~/.claude/skills/ 2>/dev/null; ls /tmp/taste-skill/skills/ 2>/dev/null`). 경로를 기록해 Task 3에 전달.

커밋 없음 (리포 변경 없음).

---

### Task 1: GSAP 로드 + 히어로 인트로·패럴랙스

**Files:**
- Modify: `index.html` (head에 script 3줄)
- Create: `js/main.js`

**Interfaces:**
- Produces: `js/main.js` — IIFE 구조, reduced-motion 가드, `document.documentElement.classList.add("has-motion")`, `body.doc` 분기. Task 2·4가 이 파일에 코드를 추가함.
- Produces: `html.has-motion` 클래스 — Task 2의 CSS 숨김 가드가 의존.

- [ ] **Step 1: index.html에 스크립트 추가**

`</head>` 직전(`<script type="application/ld+json">` 블록 뒤)에:

```html
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" integrity="sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" integrity="sha384-P8VzCVnT9NBUkMrpcIZrJbA7EBjJvh/fJS6PmP+4nLIM284DtsImIv8D0fFjIkeh" crossorigin="anonymous"></script>
<script defer src="js/main.js"></script>
```

(SRI 해시는 2026-09-02에 jsdelivr 배포 파일에서 직접 계산한 값 — CDN 변조 방지)

- [ ] **Step 2: js/main.js 생성**

```js
/* 보고있개 — GSAP 모션 (은은한 프리미엄 톤) */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof gsap === "undefined") return; // CDN 실패 시 정적 사이트로 동작

  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add("has-motion");

  // ---------- 문서 페이지(doc): 진입 페이드만 ----------
  if (document.body.classList.contains("doc")) {
    gsap.from(".doc__head .wrap > *", {
      y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08, ease: "power2.out"
    });
    gsap.from(".doc__body", {
      y: 20, autoAlpha: 0, duration: 0.7, delay: 0.15, ease: "power2.out"
    });
    return;
  }

  // ---------- 히어로 인트로 ----------
  gsap.timeline({ defaults: { ease: "power3.out" } })
    .from(".hero .badge", { y: 20, autoAlpha: 0, duration: 0.6 })
    .from(".hero h1",     { y: 34, autoAlpha: 0, duration: 0.9 }, "-=0.3")
    .from(".hero p",      { y: 24, autoAlpha: 0, duration: 0.7 }, "-=0.55");

  // ---------- 히어로 배경 미세 패럴랙스 ----------
  gsap.to(".hero__bg", {
    yPercent: 12,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
  });
})();
```

- [ ] **Step 3: 브라우저 확인**

`http://localhost:8080/` 접속. 기대: 배지→타이틀→문단 순차 등장, 스크롤 시 히어로 배경이 살짝 느리게 따라옴. 콘솔 에러 0.

- [ ] **Step 4: reduced-motion 확인**

DevTools에서 `prefers-reduced-motion: reduce` 에뮬레이션(Rendering 탭 또는 CDP `Emulation.setEmulatedMedia`) 후 새로고침. 기대: 모션 없이 콘텐츠 전부 즉시 표시.

- [ ] **Step 5: 커밋**

```bash
git add index.html js/main.js
git commit -m "feat: GSAP 도입 — 히어로 인트로·배경 패럴랙스"
```

---

### Task 2: 스크롤 리빌·스태거·레이더 펄스·네비 축소

**Files:**
- Modify: `index.html` (data 속성 부여)
- Modify: `js/main.js` (히어로 패럴랙스 코드 아래에 추가)
- Modify: `css/style.css` (숨김 가드 + `.nav--scrolled`)

**Interfaces:**
- Consumes: Task 1의 `js/main.js` IIFE 구조, `html.has-motion` 클래스
- Produces: `data-reveal`(단일 요소 리빌), `data-stagger`(자식 스태거) 속성 규약, `.nav--scrolled` 클래스

- [ ] **Step 1: index.html에 data 속성 부여**

- `data-reveal` 추가 대상 (여는 태그에 속성만 추가):
  - DETECT 섹션: `.split`의 첫 `<div>`(텍스트 블록)와 `.phone-card`
  - 디바이스 섹션(`#device`): `.center` 안의 `.badge`, `h2`, `p` 각각
  - 리포트 섹션(`#report`): `.center` 안의 `.badge`, `h2`, `p` 각각
  - 행동 그리드 섹션(`#behaviors`): `h2`
  - 핵심 기능 섹션(`#features`): `.eyebrow`, `h2`
  - 신뢰 섹션(다크): `h2`, `p`
  - CTA 섹션(`#cta`): `.badge`, `h2`, `p`, `.btns`
  - FAQ 섹션(`#faq`): `h2`, `.faq`
- `data-stagger` 추가 대상: `.chips`, `.features`
- 레이더(`.radar`)와 히어로는 속성 없음 (전용 코드가 처리)

- [ ] **Step 2: main.js에 스크롤 모션 추가**

패럴랙스 블록 아래에:

```js
  // ---------- 스크롤 리빌 (한 번만 재생) ----------
  document.querySelectorAll("[data-reveal]").forEach(function (el) {
    gsap.from(el, {
      y: 28, autoAlpha: 0, duration: 0.8, ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 82%", once: true }
    });
  });

  // ---------- 스태거 그룹 (칩·기능 카드) ----------
  document.querySelectorAll("[data-stagger]").forEach(function (wrap) {
    gsap.from(wrap.children, {
      y: 22, autoAlpha: 0, duration: 0.6, stagger: 0.07, ease: "power2.out",
      scrollTrigger: { trigger: wrap, start: "top 85%", once: true }
    });
  });

  // ---------- 레이더 링 무한 펄스 (1~3번째 링, 4번째는 중심 점) ----------
  gsap.utils.toArray(".radar span:nth-child(-n+3)").forEach(function (ring, i) {
    gsap.fromTo(ring,
      { scale: 0.86, opacity: 0.9 },
      { scale: 1.06, opacity: 0.2, duration: 2.4, repeat: -1, delay: i * 0.8, ease: "sine.out" }
    );
  });

  // ---------- 네비 축소 ----------
  ScrollTrigger.create({
    start: 80,
    toggleClass: { targets: ".nav", className: "nav--scrolled" }
  });
```

- [ ] **Step 3: style.css에 가드·네비 스타일 추가**

`.nav` 블록 근처에:

```css
/* 모션 활성 시에만 리빌 대상 선숨김 — JS 실패·reduced-motion이면 그대로 보임 */
.has-motion [data-reveal],
.has-motion [data-stagger] > * { visibility: hidden; }
/* gsap autoAlpha가 visibility를 다시 켠다 */

.nav { transition: padding .3s ease, background .3s ease; }
.nav--scrolled { padding-block: 10px; background: rgba(15,19,14,0.92); }
```

- [ ] **Step 4: 브라우저 확인**

전체 스크롤 훑기. 기대: 각 섹션 진입 시 페이드·라이즈, 칩·카드 스태거, 레이더 링이 계속 퍼짐, 스크롤 내리면 네비 얇아짐. 리빌은 위로 다시 스크롤해도 재재생 안 됨. 콘솔 에러 0.

- [ ] **Step 5: JS 차단 상태 확인**

DevTools에서 JS 비활성화(또는 `main.js` 요청 차단) 후 새로고침. 기대: 모든 콘텐츠 정상 표시 (숨김 없음).

- [ ] **Step 6: 커밋**

```bash
git add index.html js/main.js css/style.css
git commit -m "feat: 스크롤 리빌·스태거·레이더 펄스·네비 축소 모션"
```

---

### Task 3: CSS 디테일 — 타이포·호버·포커스·그레인

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 0의 taste-skill SKILL.md (디자인 원칙 참조 — 작업 전 Read)
- Produces: 없음 (시각 개선만, 규약 변화 없음)

- [ ] **Step 1: taste-skill 읽기**

Task 0에서 기록한 경로의 `SKILL.md`를 Read. 타이포·간격·모션 원칙 중 이 사이트에 맞는 것만 적용 (전면 개편 금지 — Global Constraints).

- [ ] **Step 2: style.css 디테일 수정**

아래 변경을 적용:

```css
/* h1/h2 자간·행간 — 기존 h1,h2,h3 블록의 값 교체 */
h1, h2, h3 { font-family: var(--head); font-weight: 800; margin: 0; line-height: 1.22; letter-spacing: -0.025em; }

/* 히어로 타이틀 크기 대비 확대 — 기존 .hero h1 font-size 교체 */
.hero h1 { font-size: clamp(32px, 6vw, 58px); margin: 18px 0 16px; }

/* 기능 카드 호버 리프트 — 기존 .fcard 블록에 추가 */
.fcard { transition: transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s ease; }
.fcard:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -18px rgba(28,28,23,.18); }

/* 칩 호버 — 기존 .chip 블록에 추가 */
.chip { transition: transform .3s cubic-bezier(.22,1,.36,1), border-color .3s ease; }
.chip:hover { transform: translateY(-3px); border-color: var(--sage); }

/* 버튼 호버 */
.btn { transition: transform .25s ease, opacity .25s ease; }
.btn:hover { transform: translateY(-2px); opacity: .92; }

/* 네비 링크 호버 전환 부드럽게 — 기존 .nav__links a에 추가 */
.nav__links a { transition: opacity .2s ease; }

/* 포커스 상태 (현재 전무 — 접근성) */
a:focus-visible, summary:focus-visible, .btn:focus-visible {
  outline: 2px solid var(--sage); outline-offset: 3px; border-radius: 4px;
}

/* 히어로 필름 그레인 — .hero 블록 아래에 추가 */
.hero::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

`.hero__inner`의 `z-index`가 없으므로 그레인이 텍스트 위에 올라오지만 `opacity .05`·`pointer-events:none`이라 가독성 영향 없음. 거슬리면 `.hero__inner { z-index: 1; }` 추가.

- [ ] **Step 3: 간격 리듬 점검·조정**

브라우저로 전체 훑으며 taste-skill 원칙 기준 어색한 곳만 소폭 조정 (예: `.center` gap, 섹션 `padding-block`). 대규모 변경 금지. 변경 없으면 스킵.

- [ ] **Step 4: 브라우저 확인**

기대: 카드·칩·버튼 호버 리프트, Tab 키 이동 시 포커스 링 표시, 히어로에 미세 그레인. 콘솔 에러 0. 데스크톱(1280px)과 모바일(390px) 두 뷰포트 스크린샷 확인.

- [ ] **Step 5: 커밋**

```bash
git add css/style.css
git commit -m "feat: 타이포·호버·포커스·그레인 디테일 개선"
```

---

### Task 4: 문서 페이지 3개에 모션 적용

**Files:**
- Modify: `privacy.html`, `support.html`, `account-deletion.html` (각 head에 script 3줄)

**Interfaces:**
- Consumes: Task 1 `main.js`의 `body.doc` 분기 (이미 구현됨 — 스크립트만 로드하면 동작)

- [ ] **Step 1: 세 파일 각각 head에 스크립트 추가**

각 파일의 `<link rel="stylesheet" href="css/style.css" />` 다음 줄에 (index.html의 Task 1 결과와 글자까지 동일하게 — SRI 포함):

```html
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" integrity="sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" integrity="sha384-P8VzCVnT9NBUkMrpcIZrJbA7EBjJvh/fJS6PmP+4nLIM284DtsImIv8D0fFjIkeh" crossorigin="anonymous"></script>
<script defer src="js/main.js"></script>
```

- [ ] **Step 2: 브라우저 확인**

`/privacy.html`, `/support.html`, `/account-deletion.html` 각각 접속. 기대: 헤더 텍스트·본문 진입 페이드, 그 외 모션 없음. 콘솔 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add privacy.html support.html account-deletion.html
git commit -m "feat: 문서 페이지 진입 페이드 모션"
```

---

### Task 5: 최종 검증

**Files:** 없음 (검증만; 발견된 문제는 수정 후 커밋)

- [ ] **Step 1: 4페이지 전수 확인**

로컬 서버에서 4페이지 모두: 콘솔 에러 0, 네트워크 실패 요청 0(스토어 링크 `#` 제외), 데스크톱·모바일 뷰포트 스크린샷 육안 점검.

- [ ] **Step 2: reduced-motion 전수 확인**

에뮬레이션 켜고 4페이지 새로고침 — 모든 콘텐츠 즉시 표시, 모션 0.

- [ ] **Step 3: 성능 확인**

Chrome DevTools MCP `lighthouse_audit` 또는 Performance 트레이스로 `http://localhost:8080/` 측정. 기대: Performance 점수가 CDN 추가 전과 유의미한 차이 없음 (defer 로드라 LCP 영향 최소). 크게 나빠졌으면 원인 파악 후 보고.

- [ ] **Step 4: 문제 수정·커밋**

발견된 문제 수정 후:

```bash
git add -A
git commit -m "fix: 모션 검증 후 발견 문제 수정"
```

문제 없으면 커밋 생략.
