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
  let periodMonths = 12;  // 개원 기간 필터
  const { GROUPS, classify } = window.Classify;
  const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const groupOn = new Set(GROUPS.map((g) => g.id)); // 진료과 필터
  const isMobile = () => window.matchMedia("(max-width: 859px)").matches;

  // ---------- 사용 통계 (기능별 사용 횟수만 기록, 위치·개인정보는 보내지 않음) ----------
  function track(name, title) {
    try { window.goatcounter?.count?.({ path: `evt/${name}`, title: title || name, event: true }); } catch {}
  }

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
  const mapOpts = { center: DEFAULT_CENTER, kakaoJsKey: CFG.kakaoJsKey, naverClientId: CFG.naverClientId, popupContent: (it) => popupNode(it) };

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
    s.textContent = `${it.s}${it.s === it.t ? "" : ` · ${it.t}`} · ${fmtDate(it.date)} 개원 (${ago(it.date)})`;
    const a = document.createElement("div"); a.textContent = it.a;
    const links = document.createElement("div"); links.className = "links";
    if (it.p) {
      const tel = document.createElement("a"); tel.href = `tel:${it.p.replace(/[^0-9+]/g, "")}`; tel.textContent = `☎ ${it.p}`;
      tel.addEventListener("click", () => track("call", "전화 걸기"));
      links.append(tel);
    }
    const route = document.createElement("a");
    // 길찾기: 네이버 지도를 쓰면 네이버지도, 아니면 카카오맵으로 연결
    route.href = (mapApi?.name || CFG.mapProvider) === "naver"
      ? `https://map.naver.com/p/search/${encodeURIComponent(it.n)}`
      : `https://map.kakao.com/link/to/${encodeURIComponent(it.n)},${it.y},${it.x}`;
    route.target = "_blank"; route.rel = "noopener"; route.textContent = "길찾기";
    route.addEventListener("click", () => track("route", "길찾기"));
    links.append(route);
    box.append(t, s, a, links);
    return box;
  }

  // ---------- 렌더 ----------
  function render() {
    if (!center) return;
    const radius = Number(radiusSel.value);
    mapApi.setRadius(center, radius);

    // 반경 + 기간으로 1차 필터 → 진료과별 개수 집계 → 진료과 필터
    const since = monthsAgo(periodMonths);
    const counts = Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
    const near = [];
    for (const it of data) {
      if (it.date < since) continue;
      const dist = distance(center, { lat: it.y, lng: it.x });
      if (dist > radius) continue;
      counts[it.g]++;
      if (groupOn.has(it.g)) near.push({ ...it, dist });
    }
    updateChips(counts);
    const byDist = (a, b) => a.dist - b.dist;
    const byDate = (a, b) => b.date - a.date || a.dist - b.dist;
    const sorter = sortSel.value === "date" ? byDate : byDist;
    const fresh = near.filter((i) => i.isNew).sort(sorter);
    const older = near.filter((i) => !i.isNew).sort(sorter);

    // 지도 마커 (오래된 것 먼저 → 신규가 위에 그려짐)
    mapApi.setMarkers([...older, ...fresh], (id) => { highlight(id, true); track("marker-click", "지도 마커 클릭"); });

    // 목록
    summaryEl.innerHTML = "";
    const label = center === myPos ? "내 위치" : "선택한 지역";
    summaryEl.append(
      `${label} ${radius / 1000}km · ${periodMonths}개월 이내 `, strong(`${near.length}곳`),
      ` (신규 `, strong(`${fresh.length}`, "n"), `)`
    );

    listEl.innerHTML = "";
    if (!near.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = groupOn.size
        ? `최근 ${periodMonths}개월 안에 개원한 곳이 없어요. 반경이나 기간을 넓혀 보세요.`
        : "진료과를 하나 이상 선택해 주세요.";
      listEl.append(li);
      return;
    }
    fresh.forEach((it) => listEl.append(itemNode(it)));
    if (older.length) {
      const d = document.createElement("li");
      d.className = "divider";
      d.textContent = `개원 3~${periodMonths}개월 (${older.length})`;
      listEl.append(d);
      older.forEach((it) => listEl.append(itemNode(it)));
    }
  }

  function tag(text) { const t = document.createElement("span"); t.className = "tag"; t.textContent = text; return t; }
  function strong(text, cls) { const b = document.createElement("b"); if (cls) b.className = cls; b.textContent = text; return b; }

  function itemNode(it) {
    const li = document.createElement("li");
    li.className = `item ${it.isNew ? "is-new" : "is-old"}`;
    li.dataset.id = it.id;
    li.tabIndex = 0;

    const row1 = document.createElement("div"); row1.className = "row1";
    const gdot = document.createElement("span"); gdot.className = "gdot"; gdot.style.setProperty("--c", it.color);
    gdot.title = GROUP_BY_ID[it.g].label;
    row1.append(gdot);
    if (it.isNew) { const b = document.createElement("span"); b.className = "badge"; b.textContent = "NEW"; row1.append(b); }
    const name = document.createElement("span"); name.className = "name"; name.textContent = it.n;
    row1.append(name, tag(it.s));
    if (it.t !== it.s && it.t !== "의원" && it.t !== "치과의원") row1.append(tag(it.t));

    const meta = document.createElement("div"); meta.className = "meta";
    const when = document.createElement("span"); when.className = "when"; when.textContent = ago(it.date);
    const date = document.createElement("span"); date.textContent = fmtDate(it.date);
    const dist = document.createElement("span"); dist.textContent = fmtDist(it.dist);
    meta.append(when, date, dist);

    const addr = document.createElement("div"); addr.className = "addr"; addr.textContent = it.a;
    li.append(row1, meta, addr);

    const open = () => {
      track("list-click", "목록에서 병원 선택");
      if (isMobile()) setSheet("peek"); // 목록을 내려서 지도가 보이게
      mapApi.focus(it.id);
      highlight(it.id, false);
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
    // 모바일은 아래쪽을 목록이 가리므로 그만큼 여백을 두고 맞춤
    if (fit) mapApi.fitRadius(center, Number(radiusSel.value), isMobile() ? snapHeights()[sheetState] : 0);
  }

  // ---------- 필터 ----------
  const chipEls = {};
  for (const g of GROUPS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.style.setProperty("--c", g.color);
    b.setAttribute("aria-pressed", "true");
    b.title = g.desc;
    const dot = document.createElement("i");
    const lbl = document.createElement("span"); lbl.textContent = g.label;
    const cnt = document.createElement("span"); cnt.className = "cnt";
    b.append(dot, lbl, cnt);
    b.addEventListener("click", () => {
      if (groupOn.has(g.id)) groupOn.delete(g.id); else groupOn.add(g.id);
      b.classList.toggle("off", !groupOn.has(g.id));
      b.setAttribute("aria-pressed", String(groupOn.has(g.id)));
      track("filter-group", "진료과 필터");
      render();
    });
    $("groups").append(b);
    chipEls[g.id] = cnt;
  }
  function updateChips(counts) { for (const g of GROUPS) chipEls[g.id].textContent = counts[g.id]; }

  $("period").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    periodMonths = Number(b.dataset.m);
    for (const x of $("period").children) x.classList.toggle("on", x === b);
    track(`period-${periodMonths}`, `기간 필터 ${periodMonths}개월`);
    render();
  });

  // ---------- 모바일 목록 시트 (끌어서 올리고 내리기) ----------
  const sheet = $("sheet");
  const head = $("sheet-head");
  let sheetState = "half";
  function snapHeights() {
    const H = $("layout").clientHeight;
    return { peek: head.offsetHeight, half: Math.round(H * 0.45), full: Math.round(H * 0.92) };
  }
  function setSheet(state) {
    sheetState = state;
    sheet.style.setProperty("--sheet-h", `${snapHeights()[state]}px`);
  }
  let drag = null;
  head.addEventListener("pointerdown", (e) => {
    if (!isMobile()) return;
    drag = { y: e.clientY, h: sheet.offsetHeight, moved: false };
    head.setPointerCapture(e.pointerId);
    sheet.classList.add("dragging");
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const { peek, full } = snapHeights();
    sheet.style.setProperty("--sheet-h", `${Math.max(peek, Math.min(full, drag.h + dy))}px`);
  });
  const endDrag = () => {
    if (!drag) return;
    sheet.classList.remove("dragging");
    if (!drag.moved) {
      setSheet(sheetState === "peek" ? "half" : sheetState === "half" ? "full" : "peek"); // 탭하면 단계 전환
    } else {
      const h = sheet.offsetHeight, snaps = snapHeights();
      const best = Object.entries(snaps).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
      setSheet(best);
    }
    drag = null;
  };
  head.addEventListener("pointerup", endDrag);
  head.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => { if (isMobile()) setSheet(sheetState); });
  if (isMobile()) setSheet("half");

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
        track("locate-ok", "내 위치로 찾기 (위치 허용)");
        mapApi.setMe(myPos);
        showNotice("");
        searchAt(myPos);
      },
      () => {
        track("locate-denied", "위치 권한 거부/실패");
        showNotice(`위치 권한이 없어 ${DEFAULT_CENTER.label} 기준으로 보여드려요. 브라우저에서 위치 권한을 허용하거나, 지도를 옮긴 뒤 '이 지역에서 찾기'를 눌러보세요.`);
        if (!center) searchAt(DEFAULT_CENTER);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  $("btn-me").addEventListener("click", locate);
  $("btn-here").addEventListener("click", () => {
    track("search-here", "이 지역에서 찾기");
    searchAt(mapApi.getCenter());
  });
  radiusSel.addEventListener("change", () => { track(`radius-${radiusSel.value / 1000}km`, `반경 ${radiusSel.value / 1000}km`); searchAt(center); });
  sortSel.addEventListener("change", render);

  // ---------- 데이터 + 지도 로딩 ----------
  const dataP = fetch("data/clinics.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  Promise.all([dataP, initMap()])
    .then(([json, api]) => {
      mapApi = api;
      document.body.dataset.map = api.name;
      data = json.items
        .map((it) => {
          const date = parseYmd(it.d);
          const { g, s } = classify(it.n, it.t);
          return { ...it, date, isNew: date >= NEW_CUTOFF, g, s, color: GROUP_BY_ID[g].color };
        })
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
