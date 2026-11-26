# 우리동네 신규 개원 병의원

내 위치 주변에서 최근 개원한 병의원을 지도와 목록으로 보여주는 웹 서비스입니다.

- **3개월 이내** 개원: 주황색 마커 + `NEW` 표시
- **3~12개월** 개원: 회색 반투명 마커, 목록에서도 흐리게 표시
- **12개월 이후**: 표시하지 않음
- 한방병원·한의원 제외 (`collector/collect.mjs`의 `CLASS_CODES`에서 조정)
- 개원 기간 필터: ~3개월 / ~6개월 / ~12개월
- 진료과 그룹별 색상 + 켜고 끄기 (`site/classify.js`에서 그룹·색상 조정)
  - 일반·내과계(일반의원·내과·이비인후과·가정의학과) / 정형·통증·외과 / 성형·피부 / 치과 / 기타
  - 심평원 기본 데이터에 진료과가 없어 **기관 이름의 진료과**로 분류합니다.
    이름에 진료과가 없는 의원은 "일반의원"으로 분류됩니다(일부는 이름 단서로 추정).
- 모바일: 지도 전체 화면 + 아래 목록을 끌어 올리고 내리기(탭하면 단계 전환)
- 반경 1 / 3 / 5km, 가까운 순 / 최근 개원 순 정렬
- 위치 권한이 없으면 서울시청 기준으로 보여주고, 지도를 옮긴 뒤 "이 지역에서 찾기"로 검색

## 구조

```
collector/collect.mjs     매일 심평원 API에서 전국 병의원을 받아 최근 개원(약 12개월)만 저장
collector/make-sample.mjs 화면 확인용 가짜 데이터 생성
site/                     정적 웹페이지 (서버 불필요)
  config.js               지도 회사 선택과 지도 키 (지도를 바꿀 때 이 파일만 수정)
  map-kakao.js            카카오맵 연결
  map-leaflet.js          OpenStreetMap 연결 (카카오맵을 못 불러올 때 대체용)
  data/clinics.json       수집 결과 (현재는 샘플 데이터)
.github/workflows/update.yml  매일 새벽 자동 수집 → GitHub Pages 배포
```

## 실제 데이터로 운영하기

1. **인증키 발급**: [공공데이터포털](https://www.data.go.kr)에서 `건강보험심사평가원_병원정보서비스`를
   활용신청하면 됩니다. 개발계정은 보통 자동 승인됩니다. 마이페이지에서 **일반 인증키(Decoding)**를 복사하세요.
2. **GitHub 저장소 만들기**: 이 폴더를 새 저장소에 올립니다.
3. **키 등록**: 저장소 → Settings → Secrets and variables → Actions →
   `New repository secret`, 이름 `HIRA_SERVICE_KEY`, 값에 인증키를 넣습니다.
4. **Pages 켜기**: Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
5. **첫 수집**: Actions 탭 → "데이터 갱신 및 배포" → `Run workflow`.
   이후에는 매일 한국시간 새벽 4시경 자동으로 갱신됩니다.

## 내 컴퓨터에서 실행

```bash
node collector/make-sample.mjs                          # 샘플 데이터
HIRA_SERVICE_KEY=발급받은키 node collector/collect.mjs  # 실제 데이터
python3 -m http.server 8000 -d site                     # http://localhost:8000
```

위치 기능은 `localhost`나 `https` 주소에서만 동작합니다.

## 알아둘 점

- 개원 기준은 심평원 **개설일자**입니다. 다른 곳에서 이전해 온 병원도 신규로 보일 수 있고,
  실제 개원과 데이터 반영 사이에 몇 주 정도 시차가 있을 수 있습니다.
- 지도는 카카오맵을 씁니다. 카카오 개발자 사이트의 **JavaScript SDK 도메인**에 사이트 주소가
  등록되어 있어야 합니다(`http://localhost:8000`, `https://아이디.github.io`). 카카오맵을 불러오지
  못하면 자동으로 OpenStreetMap 지도로 대신 보여줍니다.
- 네이버지도로 바꾸려면 `map-kakao.js`와 같은 형태의 `map-naver.js`를 추가하고
  `config.js`의 `mapProvider`를 바꾸면 됩니다.
- 앱으로 발전시킬 때는 `site/`를 그대로 감싸는 방식(Capacitor 등)이나,
  `clinics.json`을 데이터 API로 재사용하는 방식이 모두 가능합니다.
