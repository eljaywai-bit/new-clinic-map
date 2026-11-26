// 진료과 그룹 분류.
// 심평원 기본 데이터에는 진료과가 없으므로 "기관 이름에 들어간 진료과(표방과목)"로 분류합니다.
// 그룹 구성·색상은 여기서만 바꾸면 지도와 목록에 모두 반영됩니다.
(function (root) {
  "use strict";

  const GROUPS = [
    { id: "g1", label: "일반·내과계", color: "#1c7ed6",
      desc: "일반의원, 내과, 이비인후과, 가정의학과, 소아청소년과, 비뇨의학과" },
    { id: "g2", label: "정형·통증·신경", color: "#2b8a3e",
      desc: "정형외과, 마취통증의학과, 재활의학과, 신경외과, 흉부외과, 신경과, 외과" },
    { id: "g3", label: "치과", color: "#f08c00", desc: "치과" },
    { id: "g4", label: "피부·성형·안과 등", color: "#d6336c",
      desc: "정신건강의학과, 산부인과(여성의원), 안과, 성형외과, 피부과" },
    { id: "etc", label: "기타", color: "#7048e8", desc: "위에 해당하지 않는 진료과, 이름에 진료과가 없는 병원급 등" },
  ];

  // 긴 이름부터 검사 (예: "정형외과"를 먼저 잡아야 "외과"로 잘못 잡히지 않음)
  const SPECIALTIES = [
    ["마취통증의학과", "g2"], ["정신건강의학과", "g4"], ["직업환경의학과", "etc"],
    ["진단검사의학과", "etc"], ["소아청소년과", "g1"], ["이비인후과", "g1"],
    ["가정의학과", "g1"], ["통증의학과", "g2"], ["재활의학과", "g2"],
    ["영상의학과", "etc"], ["응급의학과", "etc"], ["비뇨의학과", "g1"],
    ["정형외과", "g2"], ["신경외과", "g2"], ["성형외과", "g4"], ["흉부외과", "g2"],
    ["산부인과", "g4"], ["비뇨기과", "g1"], ["핵의학과", "etc"],
    ["피부과", "g4"], ["소아과", "g1"], ["신경과", "g2"], ["정신과", "g4"], ["결핵과", "etc"],
    ["내과", "g1"], ["외과", "g2"], ["안과", "g4"], ["치과", "g3"],
  ];

  // 이름에 진료과가 없는 "의원"에 대한 보조 단서
  const HINTS = [
    [/피부|뷰티|모발|에스테틱/, "g4", "피부·미용(추정)"],
    [/튼튼|관절|척추|통증|마디/, "g2", "정형·통증(추정)"],
    [/여성/, "g4", "여성의원"],
  ];

  function classify(name, type) {
    name = String(name || "");
    type = String(type || "");
    if (type.startsWith("치과")) return { g: "g3", s: "치과" };

    // 이름에서 진료과 찾기: 그룹 1~4에 해당하는 과를 우선, 그중 이름 앞쪽에 나온 것
    let masked = name;
    const found = [];
    for (const [kw, g] of SPECIALTIES) {
      const idx = masked.indexOf(kw);
      if (idx >= 0) {
        found.push({ kw, g, idx });
        masked = masked.split(kw).join("#".repeat(kw.length));
      }
    }
    if (found.length) {
      found.sort((a, b) => (a.g === "etc") - (b.g === "etc") || a.idx - b.idx);
      return { g: found[0].g, s: found[0].kw };
    }

    if (type === "의원") {
      for (const [re, g, s] of HINTS) if (re.test(name)) return { g, s };
      return { g: "g1", s: "일반의원" };
    }
    return { g: "etc", s: type || "기타" };
  }

  const api = { GROUPS, classify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Classify = api;
})(this);
