(() => {
  "use strict";

  const DEFAULT_CENTER = { lat: 37.5663, lng: 126.9779, label: "서울시청" };
  const NEW_MONTHS = 3;   // 이 기간 이내 = 신규 (진하게)
  const SHOW_MONTHS = 12; // 이 기간이 지나면 표시 안 함

  const $ = (id) => document.getElementById(id);
  const radiusSel = $("radius");
  const sortSel = $("sort");
  const listEl = $("list");
  const summaryEl = $("summary");
  const noticeEl = $("notice");

  let data = [];
  let center = null;      // 검색 기준점
  let myPos = null;       // 실제 내 위치(있을 때만)
  let activeId = null;

  // ---------- 날짜 ----------
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthsAgo = (m) => { const d = new Date(today); d.setMonth(d.getMonth() - m); return d; };
  const NEW_CUTOFF = monthsAgo(NEW_MONTHS);
  const SHOW_CUTOFF = monthsAgo(SHOW_MONTHS);
  const parseYmd = (n) => { const s = String(n); return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); };
  const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  function ago(d) {
    const days = Math.round((today - d) / 86400000);
    if (days <= 0) return "오늘 개원";
    if (days < 31) return `${days}일 전 개원`;
    return `${Math.floor(days / 30.44)}개월 전 개원`;
  }

  // ---------- 거리 ----------
  function distance(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

  // ---------- 지도 (config.js 의 mapProvider 로 선택) ----------
  const CFG = window.APP_CONFIG || {};
  let mapApi = null;
  const mapOpts = { center: DEFAULT_CENTER, kakaoJsKey: CFG.kakaoJsKey, popupContent: (it) => popupNode(it) };

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("지도 로딩 시간 초과")), ms))]);
  }
  async function initMap() {
    const el = $("map");
    const want = CFG.mapProvider || "leaflet";
    if (want !== "leaflet" && window.MapProviders[want]) {
      try { return await withTimeout(window.MapProviders[want](el, mapOpts), 8000); }
      catch (e) {
        console.warn(`[지도] ${want} 실패, OpenStreetMap 으로 대체:`, e.message);
        el.innerHTML = "";
      }
    }
    return window.MapProviders.leaflet(el, mapOpts);
  }

  // ---------- 팝업 내용 (지도 회사와 무관) ----------
  function popupNode(it) {
    const box = document.createElement("div");
    box.className = "pop";
    const t = document.createElement("div"); t.className = "t"; t.textContent = it.n;
    const s = document.createElement("div"); s.className = "s";
    s.textContent = `${it.t} · ${fmtDate(it.date)} 개원 (${ago(it.date)})`;
    const a = document.createElement("div"); a.textContent = it.a;
    const links = document.createElement("div"); links.className = "links";
    if (it.p) {
      const tel = document.createElement("a"); tel.href = `tel:${it.p.replace(/[^0-9+]/g, "")}`; tel.textContent = `☎ ${it.p}`;
      links.append(tel);
    }
    const route = document.createElement("a");
    route.href = `https://map.kakao.com/link/to/${encodeURIComponent(it.n)},${it.y},${it.x}`;
    route.target = "_blank"; route.rel = "noopener"; route.textContent = "길찾기";
    links.append(route);
    box.append(t, s, a, links);
    return box;
  }

  // ---------- 렌더 ----------
  function render() {
    if (!center) return;
    const radius = Number(radiusSel.value);
    mapApi.setRadius(center, radius);

    const near = [];
    for (const it of data) {
      const dist = distance(center, { lat: it.y, lng: it.x });
      if (dist <= radius) near.push({ ...it, dist });
    }
    const byDist = (a, b) => a.dist - b.dist;
    const byDate = (a, b) => b.date - a.date || a.dist - b.dist;
    const sorter = sortSel.value === "date" ? byDate : byDist;
    const fresh = near.filter((i) => i.isNew).sort(sorter);
    const older = near.filter((i) => !i.isNew).sort(sorter);

    // 지도 마커 (오래된 것 먼저 → 신규가 위에 그려짐)
    mapApi.setMarkers([...older, ...fresh], (id) => highlight(id, true));

    // 목록
    summaryEl.innerHTML = "";
    const label = center === myPos ? "내 위치" : "선택한 지역";
    summaryEl.append(
      `${label} ${radius / 1000}km 안 · 신규 `, strong(`${fresh.length}곳`, "n"),
      ` · 3~12개월 `, strong(`${older.length}곳`)
    );

    listEl.innerHTML = "";
    if (!near.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "최근 12개월 안에 개원한 병의원이 없어요. 반경을 넓혀 보세요.";
      listEl.append(li);
      return;
    }
    fresh.forEach((it) => listEl.append(itemNode(it)));
    if (older.length) {
      const d = document.createElement("li");
      d.className = "divider";
      d.textContent = `개원 3~12개월 (${older.length})`;
      listEl.append(d);
      older.forEach((it) => listEl.append(itemNode(it)));
    }
  }

  function strong(text, cls) { const b = document.createElement("b"); if (cls) b.className = cls; b.textContent = text; return b; }

  function itemNode(it) {
    const li = document.createElement("li");
    li.className = `item ${it.isNew ? "is-new" : "is-old"}`;
    li.dataset.id = it.id;
    li.tabIndex = 0;

    const row1 = document.createElement("div"); row1.className = "row1";
    if (it.isNew) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; row1.append(b); }
    const name = document.createElement("span"); name.className = "name"; name.textContent = it.n;
    const type = document.createElement("span"); type.className = "type"; type.textContent = it.t;
    row1.append(name, type);

    const meta = document.createElement("div"); meta.className = "meta";
    const when = document.createElement("span"); when.className = "when"; when.textContent = ago(it.date);
    const date = document.createElement("span"); date.textContent = fmtDate(it.date);
    const dist = document.createElement("span"); dist.textContent = fmtDist(it.dist);
    meta.append(when, date, dist);

    const addr = document.createElement("div"); addr.className = "addr"; addr.textContent = it.a;
    li.append(row1, meta, addr);

    const open = () => {
      mapApi.focus(it.id);
      highlight(it.id, false);
      if (window.matchMedia("(max-width: 859px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    };
    li.addEventListener("click", open);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    return li;
  }

  function highlight(id, scroll) {
    if (activeId) listEl.querySelector(`[data-id="${CSS.escape(activeId)}"]`)?.classList.remove("active");
    activeId = id;
    const el = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) { el.classList.add("active"); if (scroll) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  function searchAt(pos, fit = true) {
    center = pos;
    render();
    if (fit) mapApi.fitRadius(center, Number(radiusSel.value));
  }

  // ---------- 위치 ----------
  function showNotice(msg) { noticeEl.textContent = msg; noticeEl.hidden = !msg; }

  function locate() {
    if (!("geolocation" in navigator)) {
      showNotice(`이 브라우저는 위치 기능을 지원하지 않아 ${DEFAULT_CENTER.label} 기준으로 보여드려요. 지도를 옮긴 뒤 '이 지역에서 찾기'를 눌러보세요.`);
      return searchAt(DEFAULT_CENTER);
    }
    summaryEl.textContent = "위치를 확인하는 중…";
    navigator.geolocation.getCurrentPosition(
      (p) => {
        myPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        mapApi.setMe(myPos);
        showNotice("");
        searchAt(myPos);
      },
      () => {
        showNotice(`위치 권한이 없어 ${DEFAULT_CENTER.label} 기준으로 보여드려요. 브라우저에서 위치 권한을 허용하거나, 지도를 옮긴 뒤 '이 지역에서 찾기'를 눌러보세요.`);
        if (!center) searchAt(DEFAULT_CENTER);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  $("btn-me").addEventListener("click", locate);
  $("btn-here").addEventListener("click", () => {
    searchAt(mapApi.getCenter());
  });
  radiusSel.addEventListener("change", () => searchAt(center));
  sortSel.addEventListener("change", render);

  // ---------- 데이터 + 지도 로딩 ----------
  const dataP = fetch("data/clinics.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  Promise.all([dataP, initMap()])
    .then(([json, api]) => {
      mapApi = api;
      document.body.dataset.map = api.name;
      data = json.items
        .map((it) => { const date = parseYmd(it.d); return { ...it, date, isNew: date >= NEW_CUTOFF }; })
        .filter((it) => it.date >= SHOW_CUTOFF && it.date <= today);
      const upd = new Date(json.updatedAt);
      $("foot").textContent =
        `${json.sample ? "※ 화면 확인용 샘플 데이터입니다. " : ""}` +
        `출처: 건강보험심사평가원 병원정보서비스 · 데이터 갱신 ${fmtDate(upd)} · ` +
        `개설일자 기준이며 실제 개원일·이전 개원 여부와 다를 수 있습니다. 한방병원·한의원은 제외됩니다.`;
      locate();
    })
    .catch((e) => { console.error(e); summaryEl.textContent = "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."; });
})();
