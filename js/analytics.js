/* 보고있개 — 랜딩 이용 통계(Amplitude). 앱(frontend analytics_boot.dart)과 같은 규칙: 운영에서만 보낸다. */
(function () {
  // 운영 프로젝트 키(브라우저 키는 공개값). 비어 있으면 아무것도 보내지 않는다.
  var AMPLITUDE_API_KEY = "";
  var PROD_HOSTS = ["bogoitgae.com", "www.bogoitgae.com"];

  if (!AMPLITUDE_API_KEY || PROD_HOSTS.indexOf(location.hostname) === -1) return;
  if (typeof amplitude === "undefined") return; // CDN 실패 시 계측 없이 동작

  amplitude.init(AMPLITUDE_API_KEY, {
    autocapture: {
      pageViews: true,
      sessions: true,
      attribution: true,
      elementInteractions: false,
      formInteractions: false,
      fileDownloads: false,
      webVitals: false
    },
    // 개인정보처리방침이 IP 미수집을 약속했다
    trackingOptions: { ipAddress: false, language: false }
  });

  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-store]");
    if (!a) return;
    amplitude.track("landing_cta_clicked", {
      store: a.dataset.store,
      cta_position: a.dataset.ctaPosition
    });
  });
})();
