// 인증키 없이 화면을 확인하기 위한 가짜 샘플 데이터 생성기.
// 실제 데이터 수집(collect.mjs)이 한 번이라도 성공하면 덮어써집니다.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../site/data/clinics.json");
const types = ["의원", "의원", "의원", "치과의원", "병원", "요양병원", "한방병원"];
const center = { lat: 37.5663, lng: 126.9779 }; // 서울시청

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const now = new Date();
const items = [];
for (let i = 1; i <= 120; i++) {
  const daysAgo = Math.floor(rand() * 400);
  const d = new Date(now.getTime() - daysAgo * 86400_000);
  const ymd = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const t = types[Math.floor(rand() * types.length)];
  items.push({
    id: `sample-${i}`,
    n: `샘플${t} ${i}호`,
    t,
    a: `서울특별시 중구 샘플로 ${i}`,
    p: "02-000-0000",
    w: "",
    d: ymd,
    y: +(center.lat + (rand() - 0.5) * 0.09).toFixed(6),
    x: +(center.lng + (rand() - 0.5) * 0.11).toFixed(6),
  });
}
items.sort((a, b) => b.d - a.d);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ updatedAt: now.toISOString(), sample: true, count: items.length, items })
);
console.log(`샘플 ${items.length}건 → ${OUT}`);
