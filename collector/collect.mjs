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
  process.env.HIRA_ENDPOINT || // 테스트용
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

  // 심평원 서버가 붐비면 "API 오류 99 (ResourceLimitException)"를 자주 돌려줌 → 넉넉히 재시도
  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
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
      if (attempt === MAX_ATTEMPTS) throw err;
      const wait = Math.min(Number(process.env.RETRY_BASE_MS ?? 5000) * 2 ** (attempt - 1), 60_000); // 5s,10s,20s,40s,60s…
      console.warn(`  재시도 ${attempt}/${MAX_ATTEMPTS - 1} (${wait / 1000}s 후): ${err.message.slice(0, 120)}`);
      await sleep(wait);
    }
  }
}

function toYmd(d) {
  return (
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  );
}

function toItem(it, clName) {
  const lat = Number(it.YPos);
  const lng = Number(it.XPos);
  if (!lat || !lng) return null;
  return {
    id: it.ykiho,
    n: String(it.yadmNm ?? "").trim(),
    t: it.clCdNm || clName,
    a: String(it.addr ?? "").trim(),
    p: it.telno ? String(it.telno) : "",
    w: it.hospUrl && it.hospUrl !== "http://" ? String(it.hospUrl) : "",
    d: Number(it.estbDd),
    y: Math.round(lat * 1e6) / 1e6,
    x: Math.round(lng * 1e6) / 1e6,
  };
}

async function loadPrevious() {
  try {
    const prev = JSON.parse(await readFile(OUT, "utf8"));
    return prev.sample ? [] : prev.items || [];
  } catch {
    return [];
  }
}

async function main() {
  const now = new Date();
  const cutoffYmd = toYmd(new Date(now.getTime() - KEEP_DAYS * 86400_000));
  const todayYmd = toYmd(now);

  // 종별마다 진행 상태를 기억해 두고, 실패하면 잠시 쉬었다가 실패한 페이지부터 이어서 받음
  const jobs = Object.entries(CLASS_CODES).map(([clCd, clName]) => ({
    clCd, clName, pageNo: 1, got: 0, total: Infinity, items: [], done: false,
  }));

  const ROUNDS = 3;
  for (let round = 1; round <= ROUNDS; round++) {
    const pending = jobs.filter((j) => !j.done);
    if (!pending.length) break;
    if (round > 1) {
      console.log(`\n${pending.map((j) => j.clName).join(", ")} 이어받기 (${round}회차, 3분 대기 후)`);
      await sleep(Number(process.env.ROUND_WAIT_MS ?? 180_000));
    }
    for (const job of pending) {
      try {
        while (job.got < job.total) {
          const { items, totalCount } = await fetchPage(job.clCd, job.pageNo);
          job.total = totalCount;
          if (items.length === 0) break;
          job.got += items.length;
          for (const it of items) {
            const estb = Number(it.estbDd);
            if (!estb || estb < cutoffYmd || estb > todayYmd) continue;
            const item = toItem(it, job.clName);
            if (item) job.items.push(item);
          }
          console.log(`[${job.clName}] ${job.got}/${job.total}`);
          job.pageNo++;
          await sleep(150);
        }
        job.done = true;
      } catch (err) {
        console.warn(`[${job.clName}] ${job.pageNo}페이지에서 중단: ${err.message.slice(0, 120)}`);
      }
    }
  }

  // 끝내 못 받은 종별은 이전 데이터로 채움 (사이트가 비지 않도록)
  const failed = jobs.filter((j) => !j.done);
  if (failed.length === jobs.length) throw new Error("모든 종별 수집 실패. 기존 데이터를 유지합니다.");
  const prev = failed.length ? await loadPrevious() : [];
  const out = [];
  const seen = new Set();
  const push = (it) => { if (!seen.has(it.id)) { seen.add(it.id); out.push(it); } };
  for (const job of jobs) {
    job.items.forEach(push);
    if (!job.done) {
      // 이번에 받은 부분 + 이전 데이터 중 같은 종별
      prev.filter((it) => it.t === job.clName && it.d >= cutoffYmd).forEach(push);
    }
  }

  const scanned = jobs.reduce((s, j) => s + j.got, 0);
  out.sort((a, b) => b.d - a.d);
  const payload = {
    updatedAt: now.toISOString(),
    source: "건강보험심사평가원 병원정보서비스",
    count: out.length,
    ...(failed.length ? { partial: failed.map((j) => j.clName) } : {}),
    items: out,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`\n전체 ${scanned}곳 조회, 최근 개원 ${out.length}곳 저장 → ${OUT}`);
  if (failed.length) {
    console.warn(`⚠ 일부 종별은 이전 데이터를 유지했습니다: ${failed.map((j) => j.clName).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("수집 실패:", err.message);
  process.exit(1);
});
