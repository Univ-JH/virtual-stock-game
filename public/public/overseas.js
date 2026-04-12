// 공통 Firebase 초기화 모듈에서 서비스 인스턴스를 가져옵니다.
import { auth, db, functions } from './firebase-config.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, onSnapshot, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";

const performExchange = httpsCallable(functions, 'performExchange');
const buyOverseasStock = httpsCallable(functions, 'buyOverseasStock');
const sellOverseasStock = httpsCallable(functions, 'sellOverseasStock');
const listStockForSale = httpsCallable(functions, 'listStockForSale');
const purchaseListedStock = httpsCallable(functions, 'purchaseListedStock');

// --- 글로벌 변수 및 상태 ---
let currentUser = null;
let exchangeRates = {};
let currentWalletBalances = {};
let overseasStocks = {};
let userPortfolio = {};

let allOverseasStocks = {};
let displayedStocks = []; // 현재 화면에 표시되는 주식 목록 (검색 필터링용)
let selectedCurrency = 'usd'; // 현재 선택된 거래 통화
let selectedStockCode = null; // 현재 선택된 주식 코드
let marketListenerUnsubscribe = null; // P2P 마켓 리스너 해제용
let stockPriceListenerUnsubscribe = null; // 개별 주식 가격 리스너 해제용
let stockPriceHistory = [];
let stockChart = null;

// 환전소 차트 관련
let rateHistory = { usd: [], eur: [], jpy: [] }; // 차트용 히스토리 데이터
let exchangeChart = null;
let selectedChartCurrency = 'usd';

// --- UI 요소 ---
// 공통 네비게이션
const overseasNav = document.getElementById('overseas-nav');
// 자산 현황 섹션
const walletBalancesEl = document.getElementById('wallet-balances');
const overseasPortfolioBody = document.getElementById('overseas-portfolio-body');
// 환전소 섹션
const fromAmountInput = document.getElementById('from-amount');
const fromCurrencyButtons = document.getElementById('from-currency-buttons');
const toAmountInput = document.getElementById('to-amount');
const toCurrencyButtons = document.getElementById('to-currency-buttons');
const exchangeRateInfo = document.getElementById('exchange-rate-info');
const exchangeBtn = document.getElementById('exchange-btn');
const exchangeChartCanvas = document.getElementById('exchange-chart-canvas');
const rateChartSelector = document.getElementById('rate-chart-selector');
const fromCurrencyBalanceInfo = document.getElementById('from-currency-balance-info');
const toCurrencyBalanceInfo = document.getElementById('to-currency-balance-info');
const exchangeTooltip = document.getElementById('exchange-tooltip');
// 해외 주식 거래 섹션 (P2P)
const currencySelector = document.querySelector('.currency-selector'); // USD, EUR, JPY 탭 버튼 그룹
const stockSearchInput = document.getElementById('stock-search-input'); // 주식 검색 입력창
const p2pStockList = document.getElementById('p2p-stock-list'); // 검색 결과 표시되는 주식 목록
const marketInfoPlaceholder = document.getElementById('market-info-placeholder'); // 주식 선택 전 안내
const marketDetailsView = document.getElementById('market-details-view'); // 주식 선택 후 나타나는 상세 정보
const marketStockName = document.getElementById('market-stock-name'); // 선택된 주식 이름
const currentStockPriceEl = document.getElementById('current-stock-price'); // 현재가
const priceChangeEl = document.getElementById('price-change'); // 변동률
const stockPriceChartCanvas = document.getElementById('stock-price-chart'); // 개별 주식 차트 캔버스
const p2pMarketBody = document.getElementById('p2p-market-body'); // 판매 호가 목록 테이블
const myHoldingInfo = document.getElementById('my-holding-info'); // 내 보유 현황
const listForSaleBtn = document.getElementById('list-for-sale-btn'); // 판매 등록 버튼
// 모달
const sellModal = document.getElementById('sell-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const sellModalTitle = document.getElementById('sell-modal-title');
const sellMaxQuantity = document.getElementById('sell-max-quantity');
const sellQuantityInput = document.getElementById('sell-quantity');
const sellPriceInput = document.getElementById('sell-price');
const confirmSellBtn = document.getElementById('confirm-sell-btn');
const sellHalfBtn = document.getElementById('sell-half-btn');
const sellMaxBtn = document.getElementById('sell-max-btn');
const sellTotalAmount = document.getElementById('sell-total-amount');

// --- 헬퍼 함수 ---
const formatNumber = (num, digits = 2) => {
    if (typeof num !== 'number') return 'N/A';
    if (digits === 0) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const getReturnRateColorClass = (rate) => {
    if (rate > 0) return 'positive';
    if (rate < 0) return 'negative';
    return 'zero';
};

// --- UI 요소 ---

// 툴팁 표시 함수 추가
let tooltipTimer;
function showExchangeTooltip(message) {
    if (!exchangeTooltip) return;

    exchangeTooltip.textContent = message;
    exchangeTooltip.classList.add('show');

    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
        exchangeTooltip.classList.remove('show');
    }, 2000);
}

// 페이지 내 네비게이션 (SPA 동작)
overseasNav.addEventListener('click', (e) => {
    if (e.target.classList.contains('nav-link') && e.target.dataset.target) {
        e.preventDefault();
        const targetId = e.target.dataset.target;

        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');

        overseasNav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');

        // 해외 주식 거래 탭으로 이동 시 초기 데이터 로드
        if (targetId === 'overseas-trading') {
            loadStocksByCurrency(selectedCurrency); // 현재 선택된 통화의 주식 목록 로드
            // 필요하다면 P2P 마켓 상태 초기화 (옵션)
            marketDetailsView.style.display = 'none';
            marketInfoPlaceholder.style.display = 'block';
            if (marketListenerUnsubscribe) marketListenerUnsubscribe();
            if (stockPriceListenerUnsubscribe) stockPriceListenerUnsubscribe();
            selectedStockCode = null;
        }
    }
});



// --- 데이터 로드 및 감지 ---

// 로그인 상태 감지 및 데이터 로드
onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        listenToUserData(user.uid);
    } else {
        walletBalancesEl.innerHTML = '<p class="info-message">로그인 후 자산 정보를 확인할 수 있습니다.</p>';
        overseasPortfolioBody.innerHTML = '<tr><td colspan="7" class="info-message">로그인이 필요합니다.</td></tr>';
        // P2P 거래 섹션도 로그인 필요 메시지 등으로 초기화 가능
        // marketInfoPlaceholder.innerHTML = '<p>로그인이 필요합니다.</p>';
    }
});

function listenToUserData(userId) {
    const userRef = doc(db, "users", userId);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentWalletBalances = {
                krw: data.cash || 0,
                usd: data.wallets?.usd || 0,
                eur: data.wallets?.eur || 0,
                jpy: data.wallets?.jpy || 0,
            };
            userPortfolio = {
                usd: data.portfolio_usd || {},
                eur: data.portfolio_eur || {},
                jpy: data.portfolio_jpy || {},
            };
            displayWallets(data);
            updateExchangeCalculation();

            // P2P 마켓 내의 보유 현황 업데이트 (선택된 종목이 있다면)
            if (selectedStockCode) {
                updateMyHoldingStatus(selectedStockCode, selectedCurrency);
            }
        }
    });
}

// 지갑 UI 업데이트
function displayWallets(userData) {
    if (!walletBalancesEl) return;
    // ... (지갑 UI 렌더링 로직) ...
    const wallets = userData.wallets || {};
    const krw = currentWalletBalances.krw;
    const usd = currentWalletBalances.usd;
    const eur = currentWalletBalances.eur;
    const jpy = currentWalletBalances.jpy;

    walletBalancesEl.innerHTML = `
        <div class="wallet-card wallet-krw">
            <div class="currency-header">
                <span class="currency-name">대한민국 원</span>
                <span class="currency-code">KRW</span>
            </div>
            <div class="currency-balance">
                <span class="currency-symbol">₩</span>
                <span class="balance-amount">${formatNumber(krw)}</span>
            </div>
        </div>

        <div class="wallet-card wallet-usd">
            <div class="currency-header">
                <span class="currency-name">미국 달러</span>
                <span class="currency-code">USD</span>
            </div>
            <div class="currency-balance">
                <span class="currency-symbol">$</span>
                <span class="balance-amount">${usd.toFixed(2)}</span>
            </div>
        </div>

        <div class="wallet-card wallet-eur">
            <div class="currency-header">
                <span class="currency-name">유로</span>
                <span class="currency-code">EUR</span>
            </div>
            <div class="currency-balance">
                <span class="currency-symbol">€</span>
                <span class="balance-amount">${eur.toFixed(2)}</span>
            </div>
        </div>

        <div class="wallet-card wallet-jpy">
            <div class="currency-header">
                <span class="currency-name">일본 엔</span>
                <span class="currency-code">JPY</span>
            </div>
            <div class="currency-balance">
                <span class="currency-symbol">¥</span>
                <span class="balance-amount">${formatNumber(jpy)}</span>
            </div>
        </div>
    `;
}

//해외 주식 포트폴리오 UI 업데이트
function displayOverseasPortfolio(portfolio) {
    overseasPortfolioBody.innerHTML = '';
    if (Object.keys(portfolio).length === 0) {
        overseasPortfolioBody.innerHTML = '<tr><td colspan="7">보유한 해외 주식이 없습니다.</td></tr>';
        return;
    }
    // ... (포트폴리오 렌더링 로직) ...
    Object.keys(portfolio).forEach(code => {
        const item = portfolio[code];
        const stockInfo = overseasStocks[code];
        if (!stockInfo) return;

        const currentPrice = stockInfo.price;
        const currency = stockInfo.currency.toUpperCase();
        const valuation = currentPrice * item.quantity;
        const returnRate = ((currentPrice / item.price) - 1) * 100;

        const row = `
            <tr>
                <td>${stockInfo.name} (${code})</td>
                <td>${formatNumber(item.quantity)}</td>
                <td>${formatNumber(item.price)}</td>
                <td>${formatNumber(currentPrice)}</td>
                <td>${currency}</td>
                <td>${formatNumber(valuation)}</td>
                <td class="${getReturnRateColorClass(returnRate)}">${returnRate.toFixed(2)}%</td>
            </tr>`;
        overseasPortfolioBody.insertAdjacentHTML('beforeend', row);
    });
}


// 6. 환율 정보 실시간 구독 및 계산 로직
function listenToExchangeRates() {
    onSnapshot(doc(db, "system", "exchangeRates"), (doc) => {
        if (doc.exists()) {
            exchangeRates = doc.data();
            // Cloud Function이 저장한 히스토리 배열을 가져옴
            ['usd', 'eur', 'jpy'].forEach(cur => {
                const historyData = exchangeRates[`history_${cur}`] || [];
                if (historyData.length > 0) {
                    rateHistory[cur] = historyData;
                }
            });
            updateExchangeCalculation();
            renderExchangeChart();
        }
    });
}

// --- ✨ 환율 차트 렌더링 ---
function renderExchangeChart() {
    if (!exchangeChartCanvas) return;
    const ctx = exchangeChartCanvas.getContext('2d');

    const datasets = [];
    const colors = { usd: '#2ecc71', eur: '#3498db', jpy: '#e74c3c' };
    const currenciesToShow = selectedChartCurrency === 'all' ? ['usd', 'eur', 'jpy'] : [selectedChartCurrency];

    let maxLength = 0;
    currenciesToShow.forEach(cur => {
        if (rateHistory[cur] && rateHistory[cur].length > maxLength) {
            maxLength = rateHistory[cur].length;
        }
    });

    if (maxLength < 2) {
        ctx.clearRect(0, 0, exchangeChartCanvas.width, exchangeChartCanvas.height);
        ctx.fillStyle = '#999';
        ctx.font = '16px "Noto Sans KR"';
        ctx.textAlign = 'center';
        ctx.fillText('차트 데이터가 충분하지 않습니다. (최대 10분 소요)', exchangeChartCanvas.width / 2, exchangeChartCanvas.height / 2);
        return;
    }

    currenciesToShow.forEach(cur => {
        if (rateHistory[cur]) {
            datasets.push({
                label: `${cur.toUpperCase()} / KRW`,
                data: rateHistory[cur],
                borderColor: colors[cur],
                borderWidth: 2,
                backgroundColor: colors[cur].replace(')', ', 0.1)'),
                tension: 0.2,
                fill: false,
                pointRadius: 0,
            });
        }
    });

    const labels = Array.from({ length: maxLength }, (_, i) => i + 1);

    if (exchangeChart) {
        exchangeChart.data.labels = labels;
        exchangeChart.data.datasets = datasets;
        exchangeChart.update('none');
    } else {
        exchangeChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: false } }
            }
        });
    }
}


// 환율 정보 실시간 구독 및 계산 로직
function updateExchangeCalculation() {
    let fromAmount = parseFloat(fromAmountInput.value) || 0;
    const fromCurrency = fromCurrencyButtons.querySelector('.active')?.dataset.currency;
    const toCurrency = toCurrencyButtons.querySelector('.active')?.dataset.currency;

    // 통화 선택이 안되었거나, 환율 정보가 없으면 잔액 표시도 초기화
    if (!fromCurrency || !toCurrency || !exchangeRates[fromCurrency]) {
        if (fromCurrencyBalanceInfo) fromCurrencyBalanceInfo.textContent = '';
        if (toCurrencyBalanceInfo) toCurrencyBalanceInfo.textContent = '';
        toAmountInput.value = '';
        exchangeRateInfo.textContent = '환율 정보를 기다리는 중...';
        return;
    }

    // --- 1. 보내는 통화 잔액 표시 ---
    const fromBalance = currentWalletBalances[fromCurrency] || 0;
    const isKrwOrJpyFrom = fromCurrency === 'krw' || fromCurrency === 'jpy';
    if (fromCurrencyBalanceInfo) {
        fromCurrencyBalanceInfo.textContent = `보유: ${fromCurrency.toUpperCase()} ${formatNumber(fromBalance, isKrwOrJpyFrom ? 0 : 2)}`;
    }

    // --- 2. 받는 통화 잔액 표시 ---
    const toBalance = currentWalletBalances[toCurrency] || 0;
    const isKrwOrJpyTo = toCurrency === 'krw' || toCurrency === 'jpy';
    if (toCurrencyBalanceInfo) {
        toCurrencyBalanceInfo.textContent = `보유: ${toCurrency.toUpperCase()} ${formatNumber(toBalance, isKrwOrJpyTo ? 0 : 2)}`;
    }

    // --- 3. 수량 초과 입력 시 자동 변경 ---
    if (fromAmount > 0 && fromAmount > fromBalance) {
        fromAmount = fromBalance;
        fromAmountInput.value = fromAmount.toFixed(isKrwOrJpyFrom ? 0 : 4); // 통화에 맞게 소수점 조절
        showExchangeTooltip('최대 환전 가능 수량으로 변경되었습니다.');
    }

    // --- 4. 환전 결과 계산 및 환율 정보 표시 ---
    const rate = exchangeRates[fromCurrency] / exchangeRates[toCurrency];

    // 수량이 0보다 클 때만 결과값 계산
    if (fromAmount > 0) {
        const resultAmount = fromAmount * rate;
        toAmountInput.value = formatNumber(resultAmount, 4);
    } else {
        toAmountInput.value = ''; // 수량이 0이면 결과값 비우기
    }

    exchangeRateInfo.textContent = `적용 환율: 1 ${fromCurrency.toUpperCase()} ≈ ${rate.toFixed(4)} ${toCurrency.toUpperCase()}`;
}

// 환전 실행 로직 (기존 로직 유지)
exchangeBtn.addEventListener('click', async () => {
    if (!currentUser) {
        return alert('로그인이 필요합니다.');
    }

    const fromCurrency = fromCurrencyButtons.querySelector('.active')?.dataset.currency;
    const toCurrency = toCurrencyButtons.querySelector('.active')?.dataset.currency;
    const amount = parseFloat(fromAmountInput.value);

    if (isNaN(amount) || amount <= 0) {
        return alert('환전할 금액을 올바르게 입력하세요.');
    }

    // --- 1. 로딩 상태 시작 ---
    exchangeBtn.disabled = true;
    exchangeBtn.classList.add('loading');
    exchangeBtn.textContent = '환전 중...';

    try {
        // 2. Cloud Function 호출
        const result = await performExchange({ fromCurrency, toCurrency, amount });

        if (result.data.success) {
            alert(result.data.message);
            fromAmountInput.value = ''; // 성공 시 입력 필드 초기화
        } else {
            // 서버에서 보낸 에러 메시지 표시
            alert(`환전 실패: ${result.data.error}`);
        }
    } catch (error) {
        console.error("환전 요청 실패:", error);
        alert(`환전 실패: ${error.message}`);
    } finally {
        // --- 3. 로딩 상태 종료 (성공/실패 여부와 상관없이 항상 실행) ---
        exchangeBtn.disabled = false;
        exchangeBtn.classList.remove('loading');
        exchangeBtn.textContent = '환전하기';
    }
});

// 새로운 버튼 이벤트 리스너 추가
function setupCurrencyButtons() {
    fromCurrencyButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('currency-btn')) {
            fromCurrencyButtons.querySelector('.currency-btn.active')?.classList.remove('active');
            e.target.classList.add('active');

            const selectedCurrency = e.target.dataset.currency;
            updateTargetCurrencyButtons(selectedCurrency);
            updateExchangeCalculation();
        }
    });

    toCurrencyButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('currency-btn') && !e.target.disabled) {
            toCurrencyButtons.querySelector('.currency-btn.active')?.classList.remove('active');
            e.target.classList.add('active');
            updateExchangeCalculation();
        }
    });
}

function updateTargetCurrencyButtons(selectedFromCurrency) {
    const toCurrencyBtns = toCurrencyButtons.querySelectorAll('.currency-btn');
    let needsRecalculation = false;

    toCurrencyBtns.forEach(btn => {
        const currency = btn.dataset.currency;
        if (currency === selectedFromCurrency) {
            btn.disabled = true;
            btn.classList.add('disabled-btn');

            // 만약 비활성화된 버튼이 현재 '받는 통화'로 선택되어 있다면,
            // 다른 통화(예: USD)로 자동 선택을 변경합니다.
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                needsRecalculation = true;

                // 기본 통화 USD를 찾아 강제로 활성화
                const defaultBtn = toCurrencyButtons.querySelector(`[data-currency="usd"]`);
                if (defaultBtn && defaultBtn.dataset.currency !== selectedFromCurrency) {
                    defaultBtn.classList.add('active');
                } else {
                    // USD가 보내는 통화일 경우, 첫 번째 사용 가능한 통화를 선택
                    const firstAvailableBtn = Array.from(toCurrencyBtns).find(b => !b.disabled);
                    if (firstAvailableBtn) {
                        firstAvailableBtn.classList.add('active');
                    }
                }
            }
        } else {
            btn.disabled = false;
            btn.classList.remove('disabled-btn');
        }
    });

    if (needsRecalculation) {
        updateExchangeCalculation();
    }
}

// 차트 선택 버튼 이벤트 리스너 추가
rateChartSelector.addEventListener('click', (e) => {
    if (e.target.classList.contains('chart-currency-btn')) {
        rateChartSelector.querySelector('.active')?.classList.remove('active');
        e.target.classList.add('active');
        selectedChartCurrency = e.target.dataset.chartCurrency;
        renderExchangeChart(); // 차트 다시 그리기
    }
});

//market
// 1. 통화 선택
currencySelector.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        selectedCurrency = e.target.dataset.currency;
        currencySelector.querySelector('.active').classList.remove('active');
        e.target.classList.add('active');
        loadStocksByCurrency(selectedCurrency);
    }
});

// 8-2. 주식 검색 기능
stockSearchInput.addEventListener('input', () => {
    const searchTerm = stockSearchInput.value.toLowerCase();
    const filteredStocks = displayedStocks.filter(stock =>
        stock.name.toLowerCase().includes(searchTerm) || stock.code.toLowerCase().includes(searchTerm)
    );
    displayStockList(filteredStocks);
});

// 8-3. 선택된 통화의 주식 목록을 로드하고 UI에 표시
function loadStocksByCurrency(currency) {
    onSnapshot(collection(db, `stocks_${currency}`), (snapshot) => {
        let stocksForCurrency = [];
        snapshot.forEach(doc => {
            allOverseasStocks[doc.id] = { id: doc.id, ...doc.data() };
            stocksForCurrency.push({ id: doc.id, ...doc.data() });
        });
        // [버그수정] 검색 필터링을 위해 displayedStocks를 업데이트합니다.
        displayedStocks = stocksForCurrency;
        displayStockList(stocksForCurrency);
    });
}

// 8-4. 주식 목록 UI 렌더링 (검색 결과도 반영)
function displayStockList(stocks) {
    // [버그수정] stockListEl이 선언되지 않은 변수로 사용되던 문제를 수정하였습니다.
    p2pStockList.innerHTML = '';
    stocks.forEach(stock => {
        const li = document.createElement('li');
        li.className = 'stock-list-item';
        li.dataset.code = stock.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = stock.name;
        
        const priceSpan = document.createElement('span');
        priceSpan.textContent = `${getCurrencySymbol(selectedCurrency)}${stock.price.toFixed(2)}`;
        
        li.appendChild(nameSpan);
        li.appendChild(priceSpan);
        
        li.addEventListener('click', () => selectStock(stock.id));
        p2pStockList.appendChild(li);
    });
}

// 헬퍼: 통화 심볼 가져오기
function getCurrencySymbol(currency) {
    switch (currency) {
        case 'usd': return '$';
        case 'eur': return '€';
        case 'jpy': return '¥';
        default: return '';
    }
}

// 8-5. 주식 종목 선택 -> 상세 정보, 차트, 호가창 표시
function selectStock(stockCode) {
    selectedStockCode = stockCode;
    const stock = allOverseasStocks[stockCode];
    if (!stock) return;

    document.getElementById('stock-details-placeholder').style.display = 'none';
    document.getElementById('stock-details-view').style.display = 'block';

    const marketCap = stock.price * stock.totalSupply;
    const currencySymbol = getCurrencySymbol(selectedCurrency);
    document.getElementById('stock-name').textContent = stock.name;
    document.getElementById('stock-price').textContent = `${currencySymbol}${formatNumber(stock.price, 2)}`;
    document.getElementById('stock-market-cap').textContent = `${currencySymbol}${formatNumber(marketCap, 0)}`;

    const portfolioKey = `portfolio_${selectedCurrency}`;
    const stockInPortfolio = userPortfolio[portfolioKey]?.[stockCode];
    const holdingText = stockInPortfolio ? `보유: ${stockInPortfolio.quantity}주` : '보유 내역 없음';
    document.getElementById('buy-holding-info').textContent = holdingText;
    document.getElementById('sell-holding-info').textContent = holdingText;

    renderStockChart(stock.history);
}

// 8-6. 선택된 주식의 가격 및 차트 실시간 감지
function listenToStockPriceAndChart(stockCode, currency) {
    if (stockPriceListenerUnsubscribe) stockPriceListenerUnsubscribe(); // 기존 리스너 해제

    const stockRef = doc(db, `stocks_${currency}`, stockCode);
    stockPriceListenerUnsubscribe = onSnapshot(stockRef, (docSnap) => {
        if (docSnap.exists()) {
            const stockData = docSnap.data();

            // 현재가 및 변동률 업데이트
            const pricePrefix = getCurrencySymbol(currency);
            currentStockPriceEl.textContent = `${pricePrefix}${formatNumber(stockData.price, 2)}`;

            const change = stockData.change || 0;
            const changeRate = stockData.changeRate || 0;
            priceChangeEl.textContent = `${change > 0 ? '+' : ''}${formatNumber(change, 2)} (${changeRate > 0 ? '+' : ''}${formatNumber(changeRate, 2)}%)`;
            priceChangeEl.className = `price-change ${getReturnRateColorClass(changeRate)}`;

            // 차트 데이터 업데이트
            stockPriceHistory = stockData.history || []; // Cloud Function이 저장하는 history 필드 사용
            renderStockChart(currency);
        } else {
            // 주식 정보 없음 처리
            currentStockPriceEl.textContent = 'N/A';
            priceChangeEl.textContent = '';
            stockPriceHistory = [];
            renderStockChart(currency);
        }
    });
}

// 8-7. 개별 주식 차트 렌더링 (Chart.js 사용)
function renderStockChart(currency) {
    if (!stockPriceChartCanvas) return;
    const ctx = stockPriceChartCanvas.getContext('2d');
    const pricePrefix = getCurrencySymbol(currency);

    const labels = Array.from({ length: stockPriceHistory.length }, (_, i) => ''); // 시간 라벨은 생략

    const datasets = [{
        label: '가격',
        data: stockPriceHistory,
        borderColor: '#007bff', // 차트 라인 색상
        backgroundColor: 'rgba(0, 123, 255, 0.1)', // 차트 아래 영역 색상
        tension: 0.2,
        fill: true,
        pointRadius: 0, // 데이터 포인트 숨김
        borderWidth: 2
    }];

    if (stockChart) {
        stockChart.data.labels = labels;
        stockChart.data.datasets = datasets;
        stockChart.update('none');
    } else {
        stockChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        display: false, // X축 라벨 숨김 (깔끔한 디자인)
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function (value) {
                                return pricePrefix + formatNumber(value, 2); // Y축 가격에 통화 심볼 붙임
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }, // 범례 숨김
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += pricePrefix + formatNumber(context.parsed.y, 2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
}


// 8-8. 호가창(P2P 마켓) 실시간 감지 및 UI 업데이트
function listenToOrderBook(stockCode, currency) {
    if (marketListenerUnsubscribe) marketListenerUnsubscribe(); // 기존 리스너 해제

    const marketCollectionName = `market_${currency}`;
    const q = query(collection(db, marketCollectionName), where("stockCode", "==", stockCode), orderBy("price", "asc"));

    marketListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        p2pMarketBody.innerHTML = '';
        if (snapshot.empty) {
            p2pMarketBody.innerHTML = '<tr><td colspan="5" class="info-message">현재 판매중인 주식이 없습니다.</td></tr>';
            return;
        }

        const pricePrefix = getCurrencySymbol(currency);

        snapshot.forEach(docSnap => {
            const listing = docSnap.data();
            const tr = document.createElement('tr');
            
            const sellerTd = document.createElement('td');
            sellerTd.textContent = listing.sellerName || '익명';
            tr.appendChild(sellerTd);
            
            const quantityTd = document.createElement('td');
            quantityTd.textContent = `${formatNumber(listing.quantity, 0)}주`;
            tr.appendChild(quantityTd);
            
            const priceTd = document.createElement('td');
            priceTd.textContent = `${pricePrefix}${formatNumber(listing.price, 2)}`;
            tr.appendChild(priceTd);
            
            const totalTd = document.createElement('td');
            totalTd.textContent = `${pricePrefix}${formatNumber(listing.quantity * listing.price, 2)}`;
            tr.appendChild(totalTd);
            
            const btnTd = document.createElement('td');
            const buyBtn = document.createElement('button');
            buyBtn.className = 'button-buy';
            buyBtn.dataset.listingId = docSnap.id;
            buyBtn.dataset.currency = currency;
            if (currentUser?.uid === listing.sellerId) {
                buyBtn.disabled = true;
            }
            buyBtn.textContent = '구매';
            btnTd.appendChild(buyBtn);
            tr.appendChild(btnTd);
            
            p2pMarketBody.appendChild(tr);
        });
    });
}

// 8-9. '구매' 버튼 클릭 시 Cloud Function 호출
p2pMarketBody.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('button-buy')) return;

    if (!currentUser) {
        return alert('로그인이 필요합니다.');
    }

    const listingId = e.target.dataset.listingId;
    const listingCurrency = e.target.dataset.currency;

    if (!confirm('이 주식을 구매하시겠습니까?')) return;

    e.target.disabled = true;
    e.target.textContent = '처리 중...';

    try {
        const result = await purchaseListedStock({ listingId, currency: listingCurrency }); // currency 인자 추가
        alert(result.data.message);
    } catch (error) {
        console.error("구매 실패:", error);
        alert(`구매 실패: ${error.message}`);
    } finally {
        e.target.disabled = false;
        e.target.textContent = '구매';
    }
});


// 8-10. 내 보유 현황 업데이트 (P2P 마켓 섹션 내)
function updateMyHoldingStatus(stockCode, currency) {
    if (!currentUser) {
        myHoldingInfo.textContent = '로그인이 필요합니다.';
        listForSaleBtn.style.display = 'none';
        return;
    }

    const userRef = doc(db, "users", currentUser.uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const portfolio = userData[`portfolio_${currency}`] || {};
            const stockInPortfolio = portfolio[stockCode];

            if (stockInPortfolio && stockInPortfolio.quantity > 0) {
                myHoldingInfo.textContent = '';
                const textSpan1 = document.createTextNode('보유 수량: ');
                const qtyStrong = document.createElement('strong');
                qtyStrong.textContent = `${formatNumber(stockInPortfolio.quantity, 0)}주`;
                const textSpan2 = document.createTextNode(` (평단가: ${getCurrencySymbol(currency)}${formatNumber(stockInPortfolio.price, 2)})`);
                
                myHoldingInfo.appendChild(textSpan1);
                myHoldingInfo.appendChild(qtyStrong);
                myHoldingInfo.appendChild(textSpan2);
                listForSaleBtn.style.display = 'block';
            } else {
                myHoldingInfo.textContent = '보유 내역 없음';
                listForSaleBtn.style.display = 'none';
            }
        }
    });
}

// --- 3. 모든 해외 주식 마스터 정보 로드 (앱 시작 시 한 번) ---
async function fetchAllOverseasStocks() {
    const collectionNames = ['stocks_usd', 'stocks_eur', 'stocks_jpy'];
    for (const name of collectionNames) {
        const currency = name.split('_')[1];
        const stocksRef = collection(db, name);
        const snapshot = await getDocs(stocksRef);
        snapshot.forEach(doc => {
            // [변수명 수정] allOverseasStocksData → allOverseasStocks로 통일
            allOverseasStocks[doc.id] = { ...doc.data(), currency: currency };
        });
    }
}

// --- 판매 등록 모달 로직 ---
listForSaleBtn.addEventListener('click', () => {
    if (!currentUser || !selectedStockCode) return;
    const portfolioKey = `portfolio_${selectedCurrency}`;
    const stock = userPortfolio[portfolioKey]?.[selectedStockCode];
    if (!stock) return;

    sellModalTitle.textContent = `${allOverseasStocks[selectedStockCode]?.name} 판매 등록`;
    sellMaxQuantity.textContent = stock.quantity;
    sellQuantityInput.max = stock.quantity;
    sellPriceInput.value = allOverseasStocks[selectedStockCode]?.price.toFixed(2) || '';

    confirmSellBtn.dataset.stockCode = selectedStockCode;
    confirmSellBtn.dataset.currency = selectedCurrency;

    updateSellTotal();
    sellModal.classList.add('show');
});

// 수량 간편 입력 버튼
sellHalfBtn.addEventListener('click', () => {
    const max = parseInt(sellMaxQuantity.textContent);
    sellQuantityInput.value = Math.floor(max / 2);
    updateSellTotal();
});
sellMaxBtn.addEventListener('click', () => {
    const max = parseInt(sellMaxQuantity.textContent);
    sellQuantityInput.value = max;
    updateSellTotal();
});

// 예상 판매 총액 실시간 계산
sellQuantityInput.addEventListener('input', updateSellTotal);
sellPriceInput.addEventListener('input', updateSellTotal);

function updateSellTotal() {
    const quantity = parseInt(sellQuantityInput.value) || 0;
    const price = parseFloat(sellPriceInput.value) || 0;
    // [버그수정] USD 심볼로 하드코딩되던 문제를 수정하였습니다.
    sellTotalAmount.textContent = `${getCurrencySymbol(selectedCurrency)}${(quantity * price).toFixed(2)}`;
}

// 모달 닫기
modalCloseBtn.addEventListener('click', () => sellModal.classList.remove('show'));

// 최종 '판매 등록하기' 버튼 클릭
confirmSellBtn.addEventListener('click', async () => {
    const { stockCode, currency } = confirmSellBtn.dataset;
    const quantity = parseInt(sellQuantityInput.value);
    const price = parseFloat(sellPriceInput.value);
    const maxQuantity = parseInt(sellMaxQuantity.textContent);

    if (!quantity || quantity <= 0 || !price || price <= 0) return alert('수량과 가격을 올바르게 입력하세요.');
    if (quantity > maxQuantity) return alert('보유 수량을 초과했습니다.');

    confirmSellBtn.disabled = true;
    confirmSellBtn.textContent = '등록 중...';
    try {
        const result = await listStockForSale({ stockCode, quantity, price, currency });
        alert(result.data.message);
        sellModal.classList.remove('show');
    } catch (error) {
        alert(`판매 등록 실패: ${error.message}`);
    } finally {
        confirmSellBtn.disabled = false;
        confirmSellBtn.textContent = '판매 등록하기';
    }
});

// 앱 시작
async function startApp() {
    await fetchAllOverseasStocks();
    loadStocksByCurrency(selectedCurrency);
    listenToExchangeRates();
    setupCurrencyButtons();
    fromAmountInput.addEventListener('input', updateExchangeCalculation);

    // 초기화 시에도 한 번 호출하여 버튼 상태를 초기화
    const initialFromCurrency = fromCurrencyButtons.querySelector('.active')?.dataset.currency;
    if (initialFromCurrency) {
        updateTargetCurrencyButtons(initialFromCurrency);
    }
}

startApp();
