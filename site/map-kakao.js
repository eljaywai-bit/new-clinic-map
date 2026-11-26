// 카카오맵 어댑터. map-leaflet.js 와 같은 모양의 객체를 돌려줍니다.
window.MapProviders = window.MapProviders || {};
window.MapProviders.kakao = function createKakaoMap(el, opts) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(opts.kakaoJsKey)}&autoload=false`;
    s.onerror = () => reject(new Error("카카오맵 스크립트를 불러오지 못했습니다."));
    s.onload = () => {
      if (!window.kakao || !kakao.maps) return reject(new Error("카카오맵 초기화 실패 (키·도메인 등록 확인)"));
      kakao.maps.load(() => {
        try { resolve(build()); } catch (e) { reject(e); }
      });
    };
    document.head.append(s);
  });

  function build() {
    const K = kakao.maps;
    const LL = (p) => new K.LatLng(p.lat, p.lng);
    const map = new K.Map(el, { center: LL(opts.center), level: 5 });
    map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
    window.addEventListener("resize", () => map.relayout());

    const circle = new K.Circle({
      center: LL(opts.center), radius: 3000,
      strokeWeight: 1, strokeColor: "#1d2430", strokeOpacity: 0.4, strokeStyle: "dash",
      fillColor: "#1d2430", fillOpacity: 0.03,
    });
    circle.setMap(map);

    const meEl = document.createElement("div");
    meEl.className = "me-dot";
    const me = new K.CustomOverlay({ content: meEl, xAnchor: 0.5, yAnchor: 0.5, zIndex: 3 });

    let overlays = new Map(); // id -> { ov, item }
    let popup = null;

    function closePopup() { if (popup) { popup.setMap(null); popup = null; } }
    K.event.addListener(map, "click", closePopup);

    function openPopup(item) {
      closePopup();
      const wrap = document.createElement("div");
      wrap.className = "kpop";
      const close = document.createElement("button");
      close.type = "button"; close.className = "kpop-close"; close.textContent = "×";
      close.setAttribute("aria-label", "닫기");
      close.onclick = closePopup;
      wrap.append(close, opts.popupContent(item));
      popup = new K.CustomOverlay({ content: wrap, position: LL({ lat: item.y, lng: item.x }), yAnchor: 1, zIndex: 10, clickable: true });
      popup.setMap(map);
    }

    return {
      name: "kakao",
      getCenter() { const c = map.getCenter(); return { lat: c.getLat(), lng: c.getLng() }; },
      setRadius(center, radius) { circle.setPosition(LL(center)); circle.setRadius(radius); },
      fitRadius(center, radius, padBottom = 0) {
        const dLat = radius / 111320;
        const dLng = radius / (111320 * Math.cos((center.lat * Math.PI) / 180));
        map.setBounds(new K.LatLngBounds(
          LL({ lat: center.lat - dLat, lng: center.lng - dLng }),
          LL({ lat: center.lat + dLat, lng: center.lng + dLng })
        ), 10, 10, 10 + padBottom, 10);
      },
      setMe(pos) { me.setPosition(LL(pos)); me.setMap(map); },
      setMarkers(items, onClick) {
        closePopup();
        overlays.forEach(({ ov }) => ov.setMap(null));
        overlays = new Map();
        for (const it of items) {
          const dot = document.createElement("div");
          dot.className = `kdot ${it.isNew ? "new" : "old"}`;
          dot.style.setProperty("--c", it.color);
          dot.title = it.n;
          dot.addEventListener("click", (e) => { e.stopPropagation(); openPopup(it); onClick(it.id); });
          const ov = new K.CustomOverlay({
            content: dot, position: LL({ lat: it.y, lng: it.x }),
            xAnchor: 0.5, yAnchor: 0.5, zIndex: it.isNew ? 2 : 1, clickable: true,
          });
          ov.setMap(map);
          overlays.set(it.id, { ov, item: it });
        }
      },
      focus(id) {
        const o = overlays.get(id);
        if (!o) return;
        if (map.getLevel() > 3) map.setLevel(3);
        map.panTo(LL({ lat: o.item.y, lng: o.item.x }));
        openPopup(o.item);
      },
    };
  }
};
