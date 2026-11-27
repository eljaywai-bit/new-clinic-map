// 네이버지도 어댑터. map-kakao.js / map-leaflet.js 와 같은 모양의 객체를 돌려줍니다.
window.MapProviders = window.MapProviders || {};
window.MapProviders.naver = function createNaverMap(el, opts) {
  return new Promise((resolve, reject) => {
    // 인증 실패(키 오류·도메인 미등록) 시 네이버가 이 함수를 호출함
    window.navermap_authFailure = () => reject(new Error("네이버지도 인증 실패 (Client ID·서비스 URL 확인)"));
    const s = document.createElement("script");
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(opts.naverClientId)}`;
    s.onerror = () => reject(new Error("네이버지도 스크립트를 불러오지 못했습니다."));
    s.onload = () => {
      if (!window.naver || !naver.maps) return reject(new Error("네이버지도 초기화 실패"));
      try { resolve(build()); } catch (e) { reject(e); }
    };
    document.head.append(s);
  });

  function build() {
    const N = naver.maps;
    const LL = (p) => new N.LatLng(p.lat, p.lng);
    const map = new N.Map(el, {
      center: LL(opts.center), zoom: 14,
      zoomControl: true,
      zoomControlOptions: { position: N.Position.RIGHT_CENTER, style: N.ZoomControlStyle.SMALL },
      scaleControl: false, mapDataControl: false, logoControlOptions: { position: N.Position.BOTTOM_LEFT },
    });

    const circle = new N.Circle({
      map, center: LL(opts.center), radius: 3000,
      strokeColor: "#1d2430", strokeOpacity: 0.4, strokeWeight: 1, strokeStyle: "dash",
      fillColor: "#1d2430", fillOpacity: 0.03, clickable: false,
    });

    const meEl = document.createElement("div");
    meEl.className = "me-dot";
    const me = new N.Marker({ position: LL(opts.center), icon: { content: meEl, anchor: new N.Point(8, 8) }, zIndex: 300, clickable: false });

    let markers = new Map(); // id -> { marker, item }
    const info = new N.InfoWindow({
      content: "", borderWidth: 0, backgroundColor: "transparent", disableAnchor: true,
      pixelOffset: new N.Point(0, -6),
    });
    N.Event.addListener(map, "click", () => info.close());

    function openPopup(o) {
      const wrap = document.createElement("div");
      wrap.className = "kpop";
      const close = document.createElement("button");
      close.type = "button"; close.className = "kpop-close"; close.textContent = "×";
      close.setAttribute("aria-label", "닫기");
      close.onclick = () => info.close();
      wrap.append(close, opts.popupContent(o.item));
      info.setContent(wrap);
      info.open(map, o.marker);
    }

    return {
      name: "naver",
      getCenter() { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
      setRadius(center, radius) { circle.setCenter(LL(center)); circle.setRadius(radius); },
      fitRadius(center, radius, padBottom = 0) {
        map.fitBounds(circle.getBounds(), { top: 10, right: 10, bottom: 10 + padBottom, left: 10 });
      },
      setMe(pos) { me.setPosition(LL(pos)); me.setMap(map); },
      setMarkers(items, onClick) {
        info.close();
        markers.forEach(({ marker }) => marker.setMap(null));
        markers = new Map();
        for (const it of items) {
          const dot = document.createElement("div");
          dot.className = `kdot ${it.isNew ? "new" : "old"}`;
          dot.style.setProperty("--c", it.color);
          const size = it.isNew ? 18 : 13;
          const marker = new N.Marker({
            map, position: LL({ lat: it.y, lng: it.x }), title: it.n,
            icon: { content: dot, anchor: new N.Point(size / 2, size / 2) },
            zIndex: it.isNew ? 200 : 100,
          });
          const o = { marker, item: it };
          N.Event.addListener(marker, "click", () => { openPopup(o); onClick(it.id); });
          markers.set(it.id, o);
        }
      },
      focus(id) {
        const o = markers.get(id);
        if (!o) return;
        if (map.getZoom() < 16) map.setZoom(16, false);
        map.panTo(LL({ lat: o.item.y, lng: o.item.x }));
        openPopup(o);
      },
    };
  }
};
