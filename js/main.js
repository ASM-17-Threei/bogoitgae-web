/* 보고있개 — GSAP 모션 (은은한 프리미엄 톤) */
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // ScrollTrigger만 따로 실패해도(요청·SRI 별개) registerPlugin이 던지기 전에 빠져야 함
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return; // CDN 실패 시 정적 사이트로 동작

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
    end: "max", // end 생략 시 기본 end 지점 지나면 toggleClass가 풀려 페이지 하단에서 네비가 원복됨
    toggleClass: { targets: ".nav", className: "nav--scrolled" }
  });
})();
