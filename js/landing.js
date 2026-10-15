(function () {
  "use strict";

  const root = document.documentElement;
  const nav = document.querySelector(".landing-nav");
  const story = document.querySelector(".story");
  const video = document.querySelector(".story-video");
  const chapters = Array.from(document.querySelectorAll(".chapter"));
  const copies = chapters.map(function (chapter) { return chapter.querySelector(".chapter__copy"); });
  const notes = Array.from(document.querySelectorAll(".handwritten-note"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let context;
  let trigger;
  let frame = 0;
  let progress = 0;
  let activeChapter = -1;
  let chapterHeight = 0;
  let enabled = false;
  let videoFailed = false;

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      nav.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(document.querySelector(".nav-sentinel"));
  } else {
    nav.classList.add("is-scrolled");
  }

  // 영상 속 앱 화면이 바뀌는 시각(초). 글 n번째가 화면 중앙일 때 영상이 이 시각에 오도록 구간별로 직선 보간한다
  // (영상 0~2초는 빈 배경이라 건너뛴다)
  const SCENE_TIMES = [2.5, 4.0, 5.5, 7.0, 9.8];
  function timeAt(p) {
    const seg = Math.min(SCENE_TIMES.length - 2, Math.floor(p * (SCENE_TIMES.length - 1)));
    const local = p * (SCENE_TIMES.length - 1) - seg;
    return Math.min(video.duration, SCENE_TIMES[seg] + (SCENE_TIMES[seg + 1] - SCENE_TIMES[seg]) * local);
  }

  function requestSeek() {
    if (!enabled || frame) return;
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      // 영상 정보가 없거나 앞선 이동이 끝나지 않았다면 다음 기회를 기다립니다.
      if (!enabled || video.readyState < 1 || !Number.isFinite(video.duration) || video.seeking) return;
      const time = timeAt(progress);
      if (Math.abs(video.currentTime - time) > 1 / 60) {
        try {
          video.currentTime = time;
        } catch (_) {
          showPoster();
        }
      }
    });
  }

  function activate(index) {
    if (index === activeChapter) return;
    activeChapter = index;
    chapters.forEach(function (chapter, i) { chapter.classList.toggle("is-active", i === index); });
    window.gsap.fromTo(copies[index], { opacity: .55, y: 20 }, {
      opacity: 1, y: 0, duration: .55, overwrite: true, ease: "power2.out"
    });
    notes.forEach(function (note, i) {
      note.classList.toggle("is-active", i === index);
      window.gsap.to(note, { opacity: i === index ? 1 : 0, duration: .3, overwrite: true });
    });
  }

  function update(self) {
    progress = self.progress;
    // 글과 메모도 영상처럼 다섯 구간으로 나누어, 뒤로 스크롤해도 함께 돌아갑니다.
    activate(Math.round(progress * (chapters.length - 1)));
    requestSeek();
  }

  function measure() {
    root.style.removeProperty("--chapter-height");
    chapterHeight = Math.ceil(Math.max.apply(null, chapters.map(function (chapter) {
      return chapter.getBoundingClientRect().height;
    })));
    root.style.setProperty("--chapter-height", chapterHeight + "px");
  }

  function stopMotion() {
    enabled = false;
    window.cancelAnimationFrame(frame);
    frame = 0;
    if (context) context.revert();
    context = null;
    trigger = null;
    if (window.gsap) {
      window.gsap.killTweensOf(copies.concat(notes));
      window.gsap.set(copies.concat(notes), { clearProps: "opacity,transform" });
    }
    root.classList.remove("has-motion");
    root.style.removeProperty("--chapter-height");
    chapters.forEach(function (chapter) { chapter.classList.remove("is-active"); });
    notes.forEach(function (note, i) { note.classList.toggle("is-active", i === 0); });
    activeChapter = -1;
    video.pause();
    video.classList.remove("is-ready");
  }

  function showPoster() {
    videoFailed = true;
    stopMotion();
  }

  function setupMotion() {
    stopMotion();
    if (reducedMotion.matches || videoFailed || !window.gsap || !window.ScrollTrigger) return;
    try {
      window.gsap.registerPlugin(window.ScrollTrigger);
      root.classList.add("has-motion");
      enabled = true;
      measure();
      context = window.gsap.context(function () {
        trigger = window.ScrollTrigger.create({
          trigger: story,
          start: "top top",
          // 마지막 글이 화면 위에 닿을 때 영상도 끝나도록, 글 4개 높이만큼만 스크럽 구간으로 잡는다
          end: function () { return "+=" + chapterHeight * (chapters.length - 1); },
          scrub: true,
          onRefreshInit: measure,
          onUpdate: update,
          onRefresh: update
        });
      }, story);
      video.muted = true;
      if (!video.getAttribute("src")) {
        video.src = video.dataset.src;
        video.load();
      } else if (video.readyState >= 2) {
        video.classList.add("is-ready");
      }
      window.ScrollTrigger.refresh();
      update(trigger);
    } catch (_) {
      showPoster();
    }
  }

  video.addEventListener("loadedmetadata", requestSeek);
  video.addEventListener("loadeddata", function () {
    if (enabled) video.classList.add("is-ready");
    // 크롬은 한 번도 재생 안 한 영상의 currentTime 변경을 무시할 때가 있어서, 재생→즉시 정지로 디코더를 깨운다
    var kick = video.play();
    if (kick && kick.then) kick.then(function () { video.pause(); requestSeek(); }).catch(requestSeek);
    else requestSeek();
  });
  // 이동 중 놓친 스크롤이 있으면, 끝난 즉시 가장 최근 위치로 다시 옮깁니다.
  video.addEventListener("seeked", requestSeek);
  video.addEventListener("error", showPoster);
  reducedMotion.addEventListener("change", setupMotion);
  window.addEventListener("pageshow", function () {
    if (enabled && trigger) {
      window.ScrollTrigger.refresh();
      update(trigger);
    }
  });
  if (document.fonts) {
    document.fonts.ready.then(function () {
      if (enabled) window.ScrollTrigger.refresh();
    });
  }
  setupMotion();
})();
