// OpenStreetMap(Leaflet) 어댑터. 키가 필요 없고, 카카오맵을 못 불러올 때 대체용으로 씁니다.
window.MapProviders = window.MapProviders || {};
window.MapProviders.leaflet = function createLeafletMap(el, opts) {
  const map = L.map(el, { zoomControl: false }).setView([opts.center.lat, opts.center.lng], 14);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const oldLayer = L.layerGroup().addTo(map);
  const newLayer = L.layerGroup().addTo(map);
  const circle = L.circle([opts.center.lat, opts.center.lng], {
    radius: 3000, color: "#1d2430", weight: 1, opacity: 0.35, fillOpacity: 0.03, dashArray: "4 4", interactive: false,
  }).addTo(map);
  const me = L.marker([0, 0], {
    icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    interactive: false, keyboard: false,
  });
  const styleNew = (c) => ({ radius: 9, color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 });
  const styleOld = (c) => ({ radius: 6.5, color: "#fff", weight: 1, opacity: 0.6, fillColor: c, fillOpacity: 0.45 });
  let markers = new Map();

  return Promise.resolve({
    name: "leaflet",
    getCenter() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
    setRadius(center, radius) { circle.setLatLng([center.lat, center.lng]).setRadius(radius); },
    fitRadius(center, radius, padBottom = 0) {
      map.fitBounds(circle.getBounds(), { paddingTopLeft: [10, 10], paddingBottomRight: [10, 10 + padBottom] });
    },
    setMe(pos) { me.setLatLng([pos.lat, pos.lng]).addTo(map); },
    setMarkers(items, onClick) {
      oldLayer.clearLayers(); newLayer.clearLayers(); markers = new Map();
      for (const it of items) {
        const m = L.circleMarker([it.y, it.x], it.isNew ? styleNew(it.color) : styleOld(it.color))
          .bindPopup(() => opts.popupContent(it), { maxWidth: 260 })
          .on("click", () => onClick(it.id));
        (it.isNew ? newLayer : oldLayer).addLayer(m);
        markers.set(it.id, m);
      }
    },
    focus(id) {
      const m = markers.get(id);
      if (!m) return;
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 16));
      m.openPopup();
    },
  });
};
