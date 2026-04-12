// functions/index.js

// v2 SDK에서 필요한 모듈을 가져옵니다.
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

// Firebase Admin SDK 초기화
admin.initializeApp();
const db = admin.firestore();
const INITIAL_CAPITAL = 10000000; // 초기 자본금

// --- 주식 변동 함수 ---
exports.updateScheduledStockPrices = onSchedule({
  schedule: "every 1 minutes",
  region: "asia-northeast3",
  timeoutSeconds: 540,
  memory: "256MiB",
}, async (event) => {
  logger.info("국내 주가 업데이트 함수가 실행됩니다.");

  // ✨ 전체 시장 상황 랜덤 생성 (-0.3% ~ +0.3%)
  const marketStatus = (Math.random() - 0.5) * 0.006;

  const stockCollectionNames =
  ["stocks", "stocks_usd", "stocks_eur", "stocks_jpy"];

  for (const collectionName of stockCollectionNames) {
    const stocksRef = db.collection(collectionName);
    const stocksSnap = await stocksRef.get();
    if (stocksSnap.empty) continue;

    const batch = db.batch();
    stocksSnap.forEach((doc) => {
      const stock = doc.data();
      const docRef = stocksRef.doc(doc.id);
      let newPrice; let newHistory; let updatePayload;

      if (collectionName === "stocks") {
        // --- 강화된 변동 메커니즘 ---
        const volatility = stock.volatility || 0.03;
        const trend = stock.trend || 0;
        const basePrice = stock.basePrice || stock.price; // 기준 가치가 없으면 현재가 사용

        // 1. 기본 변동
        const baseFluctuation = (Math.random() - 0.5) * volatility;
        // 2. 추세 반영
        const trendForce = trend * (volatility / 10);

        // ✨ 3. 평균 회귀(Mean Reversion) 반영: 주가가 기준 가치로 돌아가려는 힘
        // 기준 가치보다 주가가 높으면 내리려는 힘, 낮으면 올리려는 힘이 작용
        const reversionForce = (basePrice - stock.price) / stock.price * 0.05;

        // ✨ 4. 돌발 이벤트 (호재/악재) 발생 (약 4% 확률)
        let eventForce = 0;
        let newTrend = trend; // 기본적으로는 기존 추세 유지
        if (Math.random() < 0.04) {
          // 1% ~ 5%의 변동
          const eventStrength = (Math.random() * 0.04) + 0.01;
          if (Math.random() > 0.5) {
            eventForce = eventStrength; // 호재 발생
            newTrend += 0.3; // 추세 상승
          } else {
            eventForce = -eventStrength; // 악재 발생
            newTrend -= 0.3; // 추세 하락
          }
        }

        // 5. 모든 힘을 합산하여 최종 변동률 계산
        const totalFluctuation = baseFluctuation + trendForce +
          reversionForce + eventForce + marketStatus;
        newPrice = stock.price * (1 + totalFluctuation);
        if (newPrice < 1) newPrice = 1;

        // 6. 추세와 기준 가치의 자연스러운 변화
        newTrend += (Math.random() - 0.5) * 0.05; // 추세는 계속 미세하게 변동
        // 추세가 -1.5 ~ 1.5 범위를 벗어나지 않도록 제한
        const clampedTrend = Math.max(-1.5, Math.min(1.5, newTrend));
        // 기준 가치도 아주 서서히 변동
        const newBasePrice = basePrice * (1 + (Math.random() - 0.5) * 0.0075);

        // 7. history 배열 업데이트
        newHistory = [...(stock.history || [])];
        if (newHistory.length > 50) newHistory.shift();
        newHistory.push(newPrice);

        updatePayload = {
          price: parseFloat(newPrice),
          history: newHistory,
          trend: clampedTrend,
          basePrice: newBasePrice};
      } else if (collectionName === "stocks_usd") {
        const volatility = stock.volatility || 0.06; // 기본 변동성 높게 설정
        const trend = stock.trend || 0;

        const baseFluctuation = (Math.random() - 0.5) * volatility;
        const trendForce = trend * (volatility / 8); // 추세 영향력 강화

        let eventForce = 0;
        let newTrend = trend;
        if (Math.random() < 0.03) { // 이벤트 확률 2배 (3%)
          const eventStrength = (Math.random() * 0.10) + 0.05; // 5% ~ 15%
          if (Math.random() > 0.5) {
            eventForce = eventStrength; newTrend += 0.4;
          } else {
            eventForce = -eventStrength; newTrend -= 0.4;
          }
        }

        // '평균 회귀' 없이 추세와 이벤트 중심으로 가격 결정
        const totalFluctuation =
         baseFluctuation + trendForce + eventForce + marketStatus;
        newPrice = stock.price * (1 + totalFluctuation);

        newTrend += (Math.random() - 0.5) * 0.1; // 추세 자체의 변동성도 높임
        const clampedTrend = Math.max(-2.0, Math.min(2.0, newTrend));

        newHistory = [...(stock.history || [])];
        if (newHistory.length > 50) newHistory.shift();
        newHistory.push(parseFloat(newPrice));

        updatePayload = {price: parseFloat(newPrice),
          history: newHistory, trend: clampedTrend};
      }
      if (newPrice < 0.01) newPrice = 0.01;
      batch.update(docRef, updatePayload);
    });
    await batch.commit();
    logger.info("'stocks' 컬렉션 업데이트 완료.");
  }
  return null;
});

// --- 환율 변동 함수 ---
exports.updateExchangeRates = onSchedule({
  schedule: "every 10 minutes",
  region: "asia-northeast3",
  timeZone: "Asia/Seoul",
}, async (event) => {
  logger.info("환율 정보 업데이트를 시작합니다.");

  try {
    const ratesRef = db.collection("system").doc("exchangeRates");
    const doc = await ratesRef.get();

    const baseRates = {usd: 1380.50, eur: 1495.10, jpy: 9.45};
    let currentRates = {krw: 1};
    const updateData = {krw: 1};

    if (!doc.exists) {
      // 초기 데이터가 없는 경우 History 필드 포함하여 생성
      currentRates = {
        krw: 1,
        usd: baseRates.usd,
        eur: baseRates.eur,
        jpy: baseRates.jpy,
        history_usd: [baseRates.usd],
        history_eur: [baseRates.eur],
        history_jpy: [baseRates.jpy],
      };
      await ratesRef.set(currentRates);
      logger.info("초기 환율 데이터를 생성했습니다.");
      return;
    }

    currentRates = doc.data();
    const currencies = ["usd", "eur", "jpy"];

    // KRW를 제외한 다른 통화들의 환율을 소폭 변동시킵니다.
    currencies.forEach((currency) => {
      const rate = currentRates[currency];
      // -0.5% ~ +0.5% 사이의 변동률 적용
      const fluctuation = (Math.random() - 0.5) * 0.01;
      const newRate = parseFloat((rate * (1 + fluctuation)).toFixed(2));

      updateData[currency] = newRate; // 현재 환율 업데이트

      // History 관리
      const historyKey = `history_${currency}`;
      // 기존 History가 없으면 빈 배열로 시작
      const history = currentRates[historyKey] || [];

      if (history.length > 50) { // 최대 50개 데이터 포인트 유지
        history.shift();
      }
      history.push(newRate);

      updateData[historyKey] = history; // History 배열 업데이트
    });

    await ratesRef.update(updateData);
    logger.info("환율 정보 업데이트 완료.", updateData);
  } catch (error) {
    logger.error("환율 업데이트 중 오류 발생:", error);
  }
});

// --- 환전 트랜잭션 함수 ---
exports.performExchange=onCall({region: "asia-northeast3"}, async (request) => {
  const userId = request.auth && request.auth.uid;

  // [보안수정] new Error → HttpsError로 수정: new Error는 클라이언트에
  // 에러 코드가 전달되지 않아 에러 처리가 불가능한 문제가 있었습니다.
  if (!userId) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const {fromCurrency, toCurrency, amount} = request.data;

  if (fromCurrency === toCurrency) {
    throw new HttpsError("invalid-argument", "동일한 통화로는 환전할 수 없습니다.");
  }

  if (isNaN(amount) || amount <= 0) {
    // [보안수정] new Error → HttpsError
    throw new HttpsError("invalid-argument", "유효한 금액을 입력하세요.");
  }

  const userRef = db.collection("users").doc(userId);
  const ratesRef = db.collection("system").doc("exchangeRates");

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const ratesDoc = await transaction.get(ratesRef);

      if (!userDoc.exists || !ratesDoc.exists) {
        // [보안수정] new Error → HttpsError
        throw new HttpsError("not-found", "사용자 또는 환율 정보가 없습니다.");
      }

      const userData = userDoc.data();
      const exchangeRates = ratesDoc.data();

      let fromBalance;
      if (fromCurrency === "krw") {
        fromBalance = userData.cash || 0;
      } else {
        fromBalance = (userData.wallets && userData.wallets[fromCurrency]) || 0;
      }

      if (fromBalance < amount) {
        // [보안수정] new Error → HttpsError
        throw new HttpsError("failed-precondition", "잔액이 부족합니다.");
      }

      const amountInKRW = amount * exchangeRates[fromCurrency];
      const receivedAmount = amountInKRW / exchangeRates[toCurrency];

      const newFromBalance = fromBalance - amount;
      let toBalance;
      if (toCurrency === "krw") {
        toBalance = userData.cash || 0;
      } else {
        toBalance = (userData.wallets && userData.wallets[toCurrency]) || 0;
      }
      const newToBalance = toBalance + receivedAmount;

      const updates = {};
      if (fromCurrency === "krw") {
        updates.cash = newFromBalance;
      } else {
        updates[`wallets.${fromCurrency}`] = newFromBalance;
      }
      if (toCurrency === "krw") {
        updates.cash = newToBalance;
      } else {
        updates[`wallets.${toCurrency}`] = newToBalance;
      }

      transaction.update(userRef, updates);
    });

    return {success: true, message: "환전이 성공적으로 완료되었습니다."};
  } catch (error) {
    logger.error("환전 실패:", error);
    // [보안수정] new Error → HttpsError
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message);
  }
});

/**
 * 해외 주식을 매수합니다.
 */
exports.buyOverseasStock = onCall({region: "asia-northeast3"},
    async (request) => {
      if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

      const {stockCode, quantity, currency} = request.data;
      const uid = request.auth.uid;

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new HttpsError("invalid-argument", "유효하지 않은 수량입니다.");
      }

      const userRef = db.collection("users").doc(uid);
      const stockRef = db.collection(`stocks_${currency}`).doc(stockCode);

      try {
        await db.runTransaction(async (t) => {
          const userDoc = await t.get(userRef);
          const stockDoc = await t.get(stockRef);
          if (!userDoc.exists() || !stockDoc.exists()) {
            throw new HttpsError("not-found", "정보를 찾을 수 없습니다.");
          }

          const userData = userDoc.data();
          const stockData = stockDoc.data();
          const cost = stockData.price * quantity;

          const walletBalance =
          (userData.wallets && userData.wallets[currency]) || 0;
          if (walletBalance < cost) {
            throw new HttpsError("failed-precondition",
                `${currency.toUpperCase()} 잔액이 부족합니다.`);
          }

          // 유통량(circulatingSupply)이 총량(totalSupply)을 넘지 않는지 확인
          if ((stockData.circulatingSupply + quantity) >
             stockData.totalSupply) {
            const remaining =
            stockData.totalSupply - stockData.circulatingSupply;
            throw new HttpsError("failed-precondition",
                `구매 가능한 잔여 수량(${remaining}주)을 초과했습니다.`);
          }

          const portfolioKey = `portfolio_${currency}`;
          const portfolio = userData[portfolioKey];
          const itemInPortfolio =
          (portfolio && portfolio[stockCode]) || {price: 0, quantity: 0};
          const totalCost =
          (itemInPortfolio.price * itemInPortfolio.quantity) + cost;
          const totalQuantity = itemInPortfolio.quantity + quantity;

          t.update(userRef, {
            [`wallets.${currency}`]: FieldValue.increment(-cost),
            [`${portfolioKey}.${stockCode}`]:
             {price: totalCost / totalQuantity, quantity: totalQuantity},
          });
          t.update(stockRef,
              {circulatingSupply: FieldValue.increment(quantity)});
        });
        return {success: true, message: "매수가 완료되었습니다."};
      } catch (error) {
        // [에러처리 완성] 이전에는 주석으로 대체되어 있던 catch 블록
        logger.error("해외 주식 매수 실패:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "매수 처리 중 오류가 발생했습니다.");
      }
    });

/**
 * 보유한 해외 주식을 매도합니다.
 */
exports.sellOverseasStock = onCall({region: "asia-northeast3"},
    async (request) => {
      if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

      const {stockCode, quantity, currency} = request.data;
      const uid = request.auth.uid;
      
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new HttpsError("invalid-argument", "유효하지 않은 수량입니다.");
      }

      const userRef = db.collection("users").doc(uid);
      const stockRef = db.collection(`stocks_${currency}`).doc(stockCode);
      const configRef = db.collection("system").doc("config");

      try {
        const configDoc = await configRef.get();
        const feePercentage =
        (configDoc.exists && configDoc.data().sellFeePercentage) || 0;

        await db.runTransaction(async (t) => {
          const userDoc = await t.get(userRef);
          const stockDoc = await t.get(stockRef);
          // ... (사용자, 주식 존재 여부 확인) ...

          const userData = userDoc.data();
          const stockData = stockDoc.data();
          const portfolioKey = `portfolio_${currency}`;
          const userPortfolio = userData[portfolioKey];
          const stockInPortfolio = (userPortfolio && userPortfolio[stockCode]);

          if (!stockInPortfolio || stockInPortfolio.quantity < quantity) {
            throw new HttpsError("failed-precondition", "보유 수량이 부족합니다.");
          }

          const grossSale = stockData.price * quantity;
          const fee = grossSale * feePercentage;
          const netSale = grossSale - fee;

          const newQuantity = stockInPortfolio.quantity - quantity;
          const updateData =
          {[`wallets.${currency}`]: FieldValue.increment(netSale)};
          if (newQuantity === 0) {
            updateData[`${portfolioKey}.${stockCode}`] = FieldValue.delete();
          } else {
            updateData[`${portfolioKey}.${stockCode}.quantity`] = newQuantity;
          }

          t.update(userRef, updateData);
          t.update(stockRef,
              {circulatingSupply: FieldValue.increment(-quantity)});
        });
        return {success: true, message: "매도가 완료되었습니다."};
      } catch (error) {
        // [에러처리 완성] 이전에는 주석으로 대체되어 있던 catch 블록
        logger.error("해외 주식 매도 실패:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "매도 처리 중 오류가 발생했습니다.");
      }
    });

// --- 대출 실행 함수 (수정됨) ---
exports.takeLoan = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const uid = request.auth.uid;
  const userRef = db.collection("users").doc(uid);

  try {
    let newLoanAmount = 0;
    let displayName = "";

    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new HttpsError("not-found", "사용자 없음");
      const userData = userDoc.data();
      displayName = userData.displayName;

      // 서버에서 직접 총자산 재계산 (보안)
      const stocksSnap = await db.collection("stocks").get();
      const stockPrices = {};
      stocksSnap.forEach((doc) => (stockPrices[doc.id] = doc.data().price));
      // (해외 주식 및 환율 정보도 불러와서 총자산 계산 필요)
      const totalAssets = userData.cash || 0;
      // ... (총자산 계산 로직) ...

      if (totalAssets > 5000000) {
        throw new HttpsError("failed-precondition", "대출을 받을 수 없습니다.");
      }

      // 기존 대출금에 500만원 추가
      const currentLoan = userData.loanAmount || 0;
      newLoanAmount = currentLoan + 5000000;
      const newCash = (userData.cash || 0) + 5000000;
      t.update(userRef, {cash: newCash, loanAmount: newLoanAmount});
    });

    // 대출 성공 후, 'loanRankings' 컬렉션에 사용자 정보 기록
    const rankingRef = db.collection("loanRankings").doc(uid);
    await rankingRef.set({
      name: displayName,
      loanAmount: newLoanAmount,
    });

    return {success: true, message: "500만원 추가 대출이 완료되었습니다."};
  } catch (error) {
    logger.error("대출 실패:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "대출 처리 중 오류가 발생했습니다.");
  }
});

// --- 대출금 상환 함수 (수정됨) ---
exports.repayLoan = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const userRef = db.collection("users").doc(uid);
  const FieldValue = admin.firestore.FieldValue;

  try {
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new HttpsError("not-found", "사용자 없음");
      const userData = userDoc.data();
      const loan = userData.loanAmount || 0;
      const cash = userData.cash || 0;

      if (loan <= 0) {
        throw new HttpsError("failed-precondition", "상환할 대출금이 없습니다.");
      }
      if (cash < loan) {
        throw new HttpsError("failed-precondition", "현금이 부족합니다.");
      }

      t.update(userRef, {cash: cash - loan, loanAmount: FieldValue.delete()});
    });

    // 상환 성공 후, 'loanRankings' 컬렉션에서 사용자 문서 삭제
    const rankingRef = db.collection("loanRankings").doc(uid);
    await rankingRef.delete();

    return {success: true, message: "대출금 상환이 완료되었습니다."};
  } catch (error) {
    logger.error("상환 실패:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "상환 처리 중 오류가 발생했습니다.");
  }
});

// --- 랭킹 계산 함수 ---
exports.calculateAndSaveRankings = onSchedule({
  schedule: "every 1 hours",
  region: "asia-northeast3",
  timeoutSeconds: 540,
  memory: "256MiB",
}, async (event) => {
  logger.info("랭킹 계산 함수를 시작합니다.");

  try {
    // 1. 국내 주식 현재가 조회
    const krwStockPrices = {};
    const krwStocksSnap = await db.collection("stocks").get();
    krwStocksSnap.forEach((doc) => {
      krwStockPrices[doc.id] = doc.data().price;
    });

    // 2. 해외 주식 현재가 조회 (USD, EUR, JPY)
    // [버그수정] 기존 코드는 KRW portfolio만 계산하여
    // 해외 주식과 외화 지갑이 랭킹에 반영되지 않았습니다.
    const overseasPrices = {usd: {}, eur: {}, jpy: {}};
    for (const currency of ["usd", "eur", "jpy"]) {
      const snap = await db.collection(`stocks_${currency}`).get();
      snap.forEach((doc) => {
        overseasPrices[currency][doc.id] = doc.data().price;
      });
    }

    // 3. 환율 정보 조회
    const ratesDoc = await db.collection("system").doc("exchangeRates").get();
    const rates = ratesDoc.exists ?
      ratesDoc.data() : {usd: 1380, eur: 1495, jpy: 9.45};

    // 4. 모든 사용자 정보 조회 및 총자산 산정
    const usersSnap = await db.collection("users").get();
    const usersData = [];

    usersSnap.forEach((doc) => {
      const user = doc.data();
      if (!user.displayName) return; // 비정상 계정 제외

      // 4-1. KRW 현금
      let totalValueKRW = user.cash || 0;

      // 4-2. 국내 주식 평가액
      if (user.portfolio) {
        Object.entries(user.portfolio).forEach(([code, item]) => {
          if (krwStockPrices[code] && item.quantity > 0) {
            totalValueKRW += krwStockPrices[code] * item.quantity;
          }
        });
      }

      // 4-3. 해외 주식 평가액 (KRW 환산)
      for (const currency of ["usd", "eur", "jpy"]) {
        const portfolioKey = `portfolio_${currency}`;
        if (user[portfolioKey]) {
          Object.entries(user[portfolioKey]).forEach(([code, item]) => {
            if (overseasPrices[currency][code] && item.quantity > 0) {
              totalValueKRW +=
                overseasPrices[currency][code] * item.quantity *
                (rates[currency] || 0);
            }
          });
        }
      }

      // 4-4. 외화 지갑 잔액 (KRW 환산)
      if (user.wallets) {
        for (const currency of ["usd", "eur", "jpy"]) {
          totalValueKRW +=
            (user.wallets[currency] || 0) * (rates[currency] || 0);
        }
      }

      const returnRate =
        ((totalValueKRW - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

      usersData.push({
        name: user.displayName,
        totalAssets: totalValueKRW,
        returnRate: returnRate,
      });
    });

    // 5. 정렬 및 TOP 10 추출
    const sortedByReturnRate = [...usersData]
        .sort((a, b) => b.returnRate - a.returnRate)
        .slice(0, 10);
    const sortedByTotalAssets = [...usersData]
        .sort((a, b) => b.totalAssets - a.totalAssets)
        .slice(0, 10);

    // 6. Firestore에 저장
    await db.collection("rankings").doc("top10").set({
      byReturnRate: sortedByReturnRate,
      byTotalAssets: sortedByTotalAssets,
      lastUpdated: new Date(),
    });

    logger.info("랭킹 계산 및 저장이 완료되었습니다.");
  } catch (error) {
    logger.error("랭킹 계산 중 오류 발생:", error);
  }
});


exports.generateDailyMissions = onSchedule({
  // cron 구문으로 매일 아침 8시에 실행 (UTC+9, 한국 시간 기준)
  schedule: "0 8 * * *",
  timeZone: "Asia/Seoul", // 한국 시간대 명시
  region: "asia-northeast3",
}, async (event) => {
  logger.info("모든 사용자를 위한 일일 미션 생성을 시작합니다.");

  const usersRef = db.collection("users");
  const usersSnap = await usersRef.get();

  if (usersSnap.empty) {
    logger.info("미션을 생성할 사용자가 없습니다.");
    return;
  }

  // 모든 사용자에 대해 미션 생성 작업을 병렬로 처리
  const missionPromises = usersSnap.docs.map(async (userDoc) => {
    const userId = userDoc.id;
    const missions = createNewMissions();
    const missionsRef = db.collection("users")
        .doc(userId)
        .collection("dailyMissions");

    // 기존 미션이 있다면 삭제
    const oldMissionsSnap = await missionsRef.get();
    const deleteBatch = db.batch();
    oldMissionsSnap.forEach((doc) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();

    // 새로운 미션 3개를 저장
    const newMissionBatch = db.batch();
    missions.forEach((mission, index) => {
      const missionRef = missionsRef.doc(`mission-${index + 1}`);
      newMissionBatch.set(missionRef, mission);
    });
    await newMissionBatch.commit();
  });

  await Promise.all(missionPromises);
  logger.info("모든 사용자의 일일 미션 생성이 완료되었습니다.");
});

/**
 * 3개의 새로운 일일 미션 객체 배열을 생성하여 반환합니다.
 * @return {Array<object>} - 생성된 미션 객체들의 배열.
 */
function createNewMissions() {
  // 미션 1: 출석 체크 (고정)
  const attendanceMission = {
    title: "(한가위) 출석 체크x4",
    description: "오늘도 방문해주셔서 감사합니다! 보상을 받아가세요.",
    reward: 200000,
    status: "completed",
  };

  // 미션 2: 수익/손실 미션 (랜덤)
  const isProfitMission = Math.random() > 0.5;
  const targetRate = Math.floor(Math.random() * 8) + 3; // 3% ~ 10%
  const profitLossMission = {
    title: isProfitMission ?
      `수익 실현 (+${targetRate}%)` :
      `손절매 (-${targetRate}%)`,
    description: isProfitMission ?
      `보유 주식을 매도하여 ${targetRate}% 이상의 수익을 달성하세요.` :
      "리스크 관리도 중요해요! " +
      `보유 주식을 -${targetRate}% 이하의 손실률로 매도하세요.`,
    reward: 300000,
    status: "inProgress",
    type: "trade",
    condition: {
      tradeType: "sell",
      rate: isProfitMission ? targetRate : -targetRate,
      comparison: isProfitMission ? "greaterOrEqual" : "lessOrEqual",
    },
  };

  // 미션 3: 완전 랜덤 미션
  const randomMissions = [
    {
      title: "분산 투자",
      description: "서로 다른 주식 3개를 1주 이상 매수하세요.",
      reward: 200000,
      status: "inProgress",
      type: "buyCount",
      progress: 0,
      goal: 3,
    },
    {
      title: "특정 주식 매수",
      description: "카카오 주식을 10주 이상 매수하세요.",
      reward: 100000,
      status: "inProgress",
      type: "buySpecific",
      condition: {code: "035720", quantity: 10},
    },
    {
      title: "단타의 신",
      description: "하루 동안 총 5번의 거래(매수/매도)를 완료하세요.",
      reward: 120000,
      status: "inProgress",
      type: "tradeCount",
      progress: 0,
      goal: 5,
    },
  ];
  const randomMission =
    randomMissions[Math.floor(Math.random() * randomMissions.length)];

  return [attendanceMission, profitLossMission, randomMission];
}

/**
 * 서버 내장 미션 체커 (국내/해외 주식 거래 시 호출)
 */
async function checkMissions(userId, eventType, eventData) {
  const missionsRef = db.collection("users").doc(userId).collection("dailyMissions");
  const q = missionsRef.where("status", "==", "inProgress");
  const missionsSnap = await q.get();

  if (missionsSnap.empty) return;

  for (const doc of missionsSnap.docs) {
    const mission = doc.data();
    let missionCompleted = false;
    let progressUpdate = {};

    switch (mission.type) {
      case 'trade':
        if (eventType === 'sell') {
          const cond = mission.condition;
          if (cond.comparison === 'greaterOrEqual' && eventData.returnRate >= cond.rate) {
            missionCompleted = true;
          } else if (cond.comparison === 'lessOrEqual' && eventData.returnRate <= cond.rate) {
            missionCompleted = true;
          }
        }
        break;
      case 'buyCount':
        if (eventType === 'buy') {
          const boughtStocks = mission.progressData || [];
          if (!boughtStocks.includes(eventData.code)) {
            boughtStocks.push(eventData.code);
            progressUpdate.progressData = boughtStocks;
            progressUpdate.progress = boughtStocks.length;
            if (boughtStocks.length >= mission.goal) {
              missionCompleted = true;
            }
          }
        }
        break;
      case 'buySpecific':
        if (eventType === 'buy' && eventData.code === mission.condition.code) {
          const newProgress = (mission.progress || 0) + eventData.quantity;
          progressUpdate.progress = newProgress;
          if (newProgress >= mission.condition.quantity) {
            missionCompleted = true;
          }
        }
        break;
      case 'tradeCount':
        if (eventType === 'buy' || eventType === 'sell') {
          const newProgress = (mission.progress || 0) + 1;
          progressUpdate.progress = newProgress;
          if (newProgress >= mission.goal) {
            missionCompleted = true;
          }
        }
        break;
    }

    if (missionCompleted) {
      await doc.ref.update({ status: 'completed', ...progressUpdate });
    } else if (Object.keys(progressUpdate).length > 0) {
      await doc.ref.update(progressUpdate);
    }
  }
}

// --- 국내 주식 거래 (서버 함수) ---
exports.buyDomesticStock = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const { stockCode, quantity } = request.data;
  const uid = request.auth.uid;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효하지 않은 수량입니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const stockRef = db.collection("stocks").doc(stockCode);

  try {
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const stockDoc = await t.get(stockRef);
      if (!userDoc.exists || !stockDoc.exists) {
        throw new HttpsError("not-found", "정보를 찾을 수 없습니다.");
      }

      const userData = userDoc.data();
      const stockData = stockDoc.data();

      const cost = stockData.price * quantity;
      if ((userData.cash || 0) < cost) {
        throw new HttpsError("failed-precondition", "현금이 부족합니다.");
      }

      const portfolio = userData.portfolio || {};
      const itemInPortfolio = portfolio[stockCode] || { price: 0, quantity: 0 };
      const totalCost = (itemInPortfolio.price * itemInPortfolio.quantity) + cost;
      const totalQuantity = itemInPortfolio.quantity + quantity;

      t.update(userRef, {
        cash: admin.firestore.FieldValue.increment(-cost),
        [`portfolio.${stockCode}`]: { price: totalCost / totalQuantity, quantity: totalQuantity }
      });
    });

    // 백그라운드 미션 체크
    checkMissions(uid, 'buy', { code: stockCode, quantity: quantity }).catch(e => logger.error("미션 처리 에러:", e));

    return { success: true, message: "매수가 완료되었습니다." };
  } catch (error) {
    logger.error("국내 주식 매수 실패:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "매수 처리 중 오류가 발생했습니다.");
  }
});

exports.sellDomesticStock = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const { stockCode, quantity } = request.data;
  const uid = request.auth.uid;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new HttpsError("invalid-argument", "유효하지 않은 수량입니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const stockRef = db.collection("stocks").doc(stockCode);

  try {
    let returnRate = 0;

    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const stockDoc = await t.get(stockRef);
      if (!userDoc.exists || !stockDoc.exists) {
        throw new HttpsError("not-found", "정보를 찾을 수 없습니다.");
      }

      const userData = userDoc.data();
      const stockData = stockDoc.data();
      const portfolio = userData.portfolio || {};
      const stockInPortfolio = portfolio[stockCode];

      if (!stockInPortfolio || stockInPortfolio.quantity < quantity) {
        throw new HttpsError("failed-precondition", "보유 수량이 부족합니다.");
      }

      returnRate = ((stockData.price / stockInPortfolio.price) - 1) * 100;
      const income = stockData.price * quantity;
      const newQuantity = stockInPortfolio.quantity - quantity;

      const updateData = { cash: admin.firestore.FieldValue.increment(income) };
      if (newQuantity === 0) {
        updateData[`portfolio.${stockCode}`] = admin.firestore.FieldValue.delete();
      } else {
        updateData[`portfolio.${stockCode}.quantity`] = newQuantity;
      }

      t.update(userRef, updateData);
    });

    // 백그라운드 미션 체크
    checkMissions(uid, 'sell', { code: stockCode, quantity: quantity, returnRate: returnRate }).catch(e => logger.error("미션 처리 에러:", e));

    return { success: true, message: "매도가 완료되었습니다." };
  } catch (error) {
    logger.error("국내 주식 매도 실패:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "매도 처리 중 오류가 발생했습니다.");
  }
});

// --- 미션 보상 수령 ---
exports.claimMissionReward = onCall({region: "asia-northeast3"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { missionId } = request.data;
  const uid = request.auth.uid;

  if (!missionId) throw new HttpsError("invalid-argument", "미션 ID가 누락되었습니다.");

  const userRef = db.collection("users").doc(uid);
  const missionRef = userRef.collection("dailyMissions").doc(missionId);

  try {
    let rewardAmount = 0;
    await db.runTransaction(async (t) => {
      const missionDoc = await t.get(missionRef);
      if (!missionDoc.exists || missionDoc.data().status !== 'completed') {
        throw new HttpsError("failed-precondition", "미션이 완료되지 않았거나 보상을 받을 수 없습니다.");
      }
      rewardAmount = missionDoc.data().reward;

      t.update(userRef, { cash: admin.firestore.FieldValue.increment(rewardAmount) });
      t.update(missionRef, { status: "rewardClaimed" });
    });

    return { success: true, reward: rewardAmount, message: "보상 수령 완료" };
  } catch (error) {
    logger.error("보상 수령 에러:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "보상 수령 중 오류 발생");
  }
});
