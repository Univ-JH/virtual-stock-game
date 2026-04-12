# 가상 주식 투자 게임 📈

> 실시간 멀티플레이어 주식 투자 시뮬레이터 | A real-time, multiplayer stock market simulation game

[![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%2B%20Functions-FFCA28?logo=firebase&logoColor=black)](https://virtual-stock-game.web.app)
[![Version](https://img.shields.io/badge/version-0.2.7-blue)](https://github.com/SinjaServer/virtual-stock-game)

**🔗 [라이브 데모 바로가기](https://virtual-stock-game.web.app)**

---

## 📌 프로젝트 소개

초기 자본금 **1,000만 원**으로 시작하여 국내·해외 주식을 거래하고, 환전하고, 다른 사람들과 수익률을 경쟁하는 **무료 가상 투자 시뮬레이터**입니다.

주식 투자를 처음 접하는 사람도 실제 돈 걱정 없이 매수·매도·환전·대출 등 투자 개념을 체험할 수 있도록 설계하였습니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📊 **국내 주식 거래** | 삼성전자·카카오 등 7개 종목, 매분 서버 갱신 |
| 🌍 **해외 주식 P2P 거래** | USD·EUR·JPY 3개 시장, 유저 간 호가 거래 |
| 💱 **환전소** | 실시간 환율(10분 갱신), 4개 통화 간 자유 환전 |
| 🏆 **랭킹 시스템** | 수익률 & 총자산 TOP 10, 1시간 주기 갱신 |
| 🎯 **일일 미션** | 매일 08:00 자동 발급, 트랜잭션으로 중복 보상 방지 |
| 💸 **대출 시스템** | 총자산 500만 원 미만 시 대출 가능, 서버 자산 재검증 |
| 📈 **실시간 차트** | Chart.js 기반 주가·환율 추이 시각화 |

---

## 🛠️ 기술 스택

### Frontend
| 기술 | 역할 |
|------|------|
| HTML5 / CSS3 / Vanilla JS | UI 구성 및 SPA 탭 전환 |
| Firebase SDK v9 (모듈형) | Auth, Firestore, Functions 클라이언트 연동 |
| Chart.js | 실시간 주가·환율 라인 차트 |

### Backend (Firebase)
| 기술 | 역할 |
|------|------|
| **Cloud Firestore** | NoSQL 실시간 DB (주가·사용자·랭킹) |
| **Cloud Functions v2** | 스케줄러 4개 + HTTPS Callable 5개 |
| **Firebase Auth** | Google OAuth 2.0 소셜 로그인 |
| **Firebase Hosting** | 정적 파일 서빙, SPA 라우팅 |
| Node.js 20 | Cloud Functions 런타임 |

### 인프라
- **리전:** asia-northeast3 (서울)
- **배포:** `firebase deploy` 단일 명령어

---

## 🏗️ 시스템 아키텍처

<img height="600" alt="Image" src="https://github.com/user-attachments/assets/2dc1490f-7938-4471-bdc1-b3d4a9d2c751" />

---

## 🚀 개발 스토리: 빠른 출시와 반복 개선

### Phase 1 — "일단 만들어보자" (v0.1, 2025.09.25)

처음엔 서버 없이 순수 HTML+JS만으로 시작했습니다.  
주가는 클라이언트에서 2초마다 랜덤으로 움직이고, 자산은 메모리에만 저장되어 **새로고침하면 초기화**되는 프로토타입이었습니다.

**목표:** "주식 거래 UI가 어떻게 느껴지는지" 빠르게 검증

---

### Phase 2 — "실제 유저와 함께" (v0.2.0, 2025.09.27)

친구들에게 공유했더니 첫 번째 피드백이 왔습니다:

> *"새로고침하니까 다 사라졌어요..."*

이 피드백 하나가 **Firebase 전체 도입**을 결정하게 만들었습니다.

**핵심 설계 결정:**
- 주가는 **서버(Cloud Scheduler)에서 1분마다** 업데이트 → 모든 유저가 동일한 시세를 봄
- 사용자 자산은 **Firestore**에 영구 저장 → 새로고침해도 유지
- 로그인은 **Google OAuth** → 별도 회원가입 없음

이 전환으로 프로젝트가 진짜 "멀티유저 게임"이 되었습니다.

---

### Phase 3 — "버그는 실제 유저가 찾는다" (v0.2.1 ~ v0.2.5)

서버를 붙이고 나서 혼자선 발견 못했던 버그들이 유저 신고로 하나씩 드러났습니다.  
아래 표에 각 버그의 발견 맥락, 원인 분석, 해결 방법을 기록해 두었습니다.

---

## 🐛 버전 히스토리 & 트러블슈팅 기록

| 버전 | 발견 경로 | 버그/문제 | 원인 | 해결 방법 |
|------|-----------|-----------|------|-----------|
| v0.2.1 | 유저 신고 | 전량 매도 시 거래가 처리되지 않음 | 수량이 0이 될 때 `deleteField()` 대신 `{quantity: 0}` 으로 업데이트 | `newQuantity === 0` 조건 분기 → `deleteField()` 적용 |
| v0.2.1 | 유저 신고 | 가격 갱신까지 남은 시간이 표시되지 않음 | 타이머 요소의 CSS `display` 속성 누락 | UI 구조 수정 및 타이머 위치 재배치 |
| v0.2.3 | 개발자 발견 | 일부 미션에서 `progress` 계산 시 `NaN` 발생 | `mission.progress`의 초기값이 `undefined`일 때 산술 연산 | `(mission.progress || 0) + 1` 방식으로 기본값 처리 |
| v0.2.5 | 개발자 발견 | 환전소에서 같은 통화로 환전 시 잔액이 복사됨 | Cloud Function `performExchange`에서 `fromCurrency === toCurrency` 검증 누락 | 함수 진입 시 동일 통화 체크 추가 |
| v0.2.6 | 모바일 테스트 | 포트폴리오 테이블이 화면 밖으로 밀려남 | 테이블 너비가 고정되어 소형 화면에서 overflow 발생 | `table.scrollWidth`를 동적으로 계산해 컨테이너 너비에 적용 |

---

### 코드 리뷰에서 발견한 추가 이슈 (리팩토링 시 수정)

| 분류 | 발견한 문제 | 수정 방법 |
|------|-------------|-----------|
| **보안** | `performExchange`에서 `new Error(code, msg)` 사용 | `HttpsError`는 두 번째 인자가 무시됨 → `HttpsError(code, msg)`로 수정 |
| **버그** | `logout-btn` 이벤트 리스너가 `onAuthStateChanged` 내에서 2회 등록 | 중복 `.addEventListener` 호출 제거 |
| **버그** | `overseas.js`의 `displayStockList()`에서 선언되지 않은 변수 `stockListEl` 참조 | `p2pStockList`(실제 선언된 변수)로 수정 |
| **버그** | 해외 주식 검색 시 `displayedStocks`가 빈 배열 그대로 | `loadStocksByCurrency` 내에서 `displayedStocks` 업데이트 누락 → 추가 |
| **버그** | `updateSellTotal()`의 통화 심볼이 USD(`$`)로 하드코딩 | `getCurrencySymbol(selectedCurrency)` 사용으로 변경 |
| **논리** | 랭킹 계산 시 해외 주식·외화 지갑 가치 미포함 | KRW 환산 로직 추가 (환율 조회 → 해외 주식 평가 → 외화 환산) |
| **유지보수** | `firebaseConfig` 객체가 3개 파일에 복붙 | `firebase-config.js` 공통 모듈로 추출 |

---

## 🗂️ 프로젝트 구조

```
virtual-stock-game/
│
└── public/                      ← 📁 프로덕션 (Firebase 배포)
    ├── firebase.json             # Hosting + Functions 설정
    ├── .firebaserc               # 프로젝트 ID 연결
    │
    ├── functions/               ← ⚡ Cloud Functions (백엔드)
    │   ├── index.js             # 스케줄러 4개 + Callable 5개
    │   └── package.json         # Node 20, firebase-functions v6
    │
    └── public/                  ← 🌐 프론트엔드 (정적 파일)
        ├── firebase-config.js   # ✨ Firebase 공통 초기화 모듈
        ├── index.html           # 메인 페이지 (국내 주식)
        ├── script.js            # 메인 로직 (968줄)
        ├── style.css            # 전체 스타일
        ├── overseas.html        # 해외 주식 / 환전소 페이지
        ├── overseas.js          # 해외 주식 로직 (883줄)
        ├── ranking.html         # 랭킹 페이지
        ├── ranking.js           # 랭킹 조회
        ├── glossary.js          # 용어사전 (ES Module)
        └── updates.js           # 업데이트 게시판 (ES Module)
```

---

## 🔒 보안 & 아키텍처 개편 (v0.3.0, 최신 패치)

초기 프로토타입 개발 과정에서 클라이언트 중심의 설계로 인해 발생한 치명적인 보안 취약점과 데이터 무결성 문제를 전면 개편했습니다.

* **Firestore Security Rules 도입:** 클라이언트 쓰기 권한 차단. 프론트엔드에서 강제로 현금을 수정하는 악의적 조작을 방지합니다.
* **백엔드(Cloud Functions) 마이그레이션:** 모든 국내 매수/매도 로직과 미션 보상 로직을 Cloud Functions 내의 트랜잭션 방식으로 이관했습니다. 입력값(음수, 비정수) 검증 로직이 추가되었습니다.
* **세션 상태 동기화 (레이스 컨디션 방지):** 기존 1회성 `getDoc` 호출 방식에서 `onSnapshot` 실시간 구독 방식으로 변경하여 다중 기기/탭에서 접속 시 발생하는 데이터 덮어쓰기 문제를 해결했습니다.
* **XSS 방어 렌더링:** `innerHTML`을 활용하던 동적 DOM 생성 방식을 `document.createElement` 및 `textContent`로 전환하여 스크립트 인젝션 공격을 예방했습니다.

---

## 📝 향후 개선 계획

- [ ] P2P 마켓 `listStockForSale` / `purchaseListedStock` Cloud Function 고도화 및 안정성 보강
- [ ] 해외 주식 포트폴리오 요약을 메인 포트폴리오 화면 상단에 통합 UI로 제공
- [ ] Firebase Emulator를 활용한 Cloud Functions 전문적인 단위 테스트(Unit Test) 작성

---
