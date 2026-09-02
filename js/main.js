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
