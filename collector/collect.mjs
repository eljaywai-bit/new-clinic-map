// 건강보험심사평가원 병원정보서비스(getHospBasisList)에서 전국 병의원을 받아
// 최근 개원한 곳만 추려 site/data/clinics.json 으로 저장합니다.
//
// 사용법:  HIRA_SERVICE_KEY=발급받은_일반인증키(Decoding) node collector/collect.mjs
//
// 의존성 없음 (Node 18+ 내장 fetch 사용)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "site/data/clinics.json");

const ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const SERVICE_KEY = process.env.HIRA_SERVICE_KEY;
const ROWS = Number(process.env.ROWS_PER_PAGE || 1000);

// 종별코드(clCd). 한방병원(92)·한의원(93)은 제외. 약국은 이 API에 포함되지 않음.
const CLASS_CODES = {
  "01": "상급종합병원",
  "11": "종합병원",
  "21": "병원",
  "28": "요양병원",
  "29": "정신병원",
  "31": "의원",
  "41": "치과병원",
  "51": "치과의원",
  "61": "조산원",
  "71": "보건소",
  "72": "보건지소",
  "73": "보건진료소",
  "75": "보건의료원",
};

// 화면에서는 12개월까지만 보이지만, 데이터 갱신이 하루 이틀 밀려도
// 문제없도록 약간 여유를 두고 저장합니다.
const KEEP_DAYS = 380;

if (!SERVICE_KEY) {
  console.error("환경변수 HIRA_SERVICE_KEY 가 없습니다.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(clCd, pageNo) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: String(pageNo),
    numOfRows: String(ROWS),
    clCd,
    _type: "json",
  });
  const url = `${ENDPOINT}?${params}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // 인증키 오류 등은 XML 로 내려옴
        throw new Error(`JSON 아님 (인증키 확인 필요): ${text.slice(0, 300)}`);
      }
      const header = json?.response?.header;
      if (header?.resultCode !== "00") {
        throw new Error(`API 오류 ${header?.resultCode}: ${header?.resultMsg}`);
      }
      const body = json.response.body;
      let items = body?.items?.item ?? [];
      if (!Array.isArray(items)) items = [items];
      return { items, totalCount: Number(body?.totalCount || 0) };
    } catch (err) {
      if (attempt === 4) throw err;
      const wait = 2000 * 2 ** (attempt - 1);
      console.warn(`  재시도 ${attempt}/3 (${wait / 1000}s 후): ${err.message}`);
      await sleep(wait);
    }
  }
}

function toYmd(d) {
  return (
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  );
}

async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86400_000);
  const cutoffYmd = toYmd(cutoff);
  const todayYmd = toYmd(now);

  let scanned = 0;
  const out = [];

  for (const [clCd, clName] of Object.entries(CLASS_CODES)) {
    let pageNo = 1;
    let total = Infinity;
    let got = 0;
    while (got < total) {
      const { items, totalCount } = await fetchPage(clCd, pageNo);
      total = totalCount;
      if (items.length === 0) break;
      got += items.length;
      scanned += items.length;

      for (const it of items) {
        const estb = Number(it.estbDd);
        if (!estb || estb < cutoffYmd || estb > todayYmd) continue;
        const lat = Number(it.YPos);
        const lng = Number(it.XPos);
        if (!lat || !lng) continue;
        out.push({
          id: it.ykiho,
          n: String(it.yadmNm ?? "").trim(),
          t: it.clCdNm || clName,
          a: String(it.addr ?? "").trim(),
          p: it.telno ? String(it.telno) : "",
          w: it.hospUrl && it.hospUrl !== "http://" ? String(it.hospUrl) : "",
          d: estb,
          y: Math.round(lat * 1e6) / 1e6,
          x: Math.round(lng * 1e6) / 1e6,
        });
      }
      console.log(`[${clName}] ${got}/${total}`);
      pageNo++;
      await sleep(150);
    }
  }

  // 수집량이 비정상적으로 적으면 기존 파일을 지키고 실패 처리
  const MIN_SCANNED = Number(process.env.MIN_SCANNED || 50_000);
  if (scanned < MIN_SCANNED) {
    throw new Error(
      `조회된 전체 기관 수(${scanned})가 너무 적습니다. 기존 데이터를 유지합니다.`
    );
  }

  out.sort((a, b) => b.d - a.d);
  const payload = {
    updatedAt: now.toISOString(),
    source: "건강보험심사평가원 병원정보서비스",
    count: out.length,
    items: out,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`전체 ${scanned}곳 중 최근 개원 ${out.length}곳 저장 → ${OUT}`);
}

main().catch((err) => {
  console.error("수집 실패:", err.message);
  process.exit(1);
});
