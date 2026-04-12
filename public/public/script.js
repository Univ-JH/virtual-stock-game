import { loadUpdates } from './updates.js';
import { renderGlossary } from './glossary.js';

import { auth, db, functions } from './firebase-config.js';

import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, updateDoc, deleteField, getDocs, runTransaction, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-functions.js";

const takeLoan = httpsCallable(functions, 'takeLoan');
const repayLoan = httpsCallable(functions, 'repayLoan');
const buyDomesticStock = httpsCallable(functions, 'buyDomesticStock');
const sellDomesticStock = httpsCallable(functions, 'sellDomesticStock');
const claimMissionRewardFunc = httpsCallable(functions, 'claimMissionReward');

// --- 글로벌 변수 및 상태 ---
let cash = 10000000;
let portfolio = {};
let stocks = {}; // Firestore에서 가져온 실시간 주식 정보
let wallets = {};
let exchangeRates = {};
let selectedStockCode = null;
let stockChart = null;
let currentUser = null;
let loanAmount = 0;
let isFirstStockLoad = true; // 첫 로드인지 확인하는 변수 추가

// --- UI 요소 ---
const userAuthEl = document.getElementById('user-auth');
const cashBalanceEl = document.getElementById('cash-balance');
const totalAssetsEl = document.getElementById('total-assets');
const totalReturnRateEl = document.getElementById('total-return-rate');
const portfolioTableBody = document.querySelector('#portfolio-table tbody');
const tradableStocksList = document.getElementById('tradable-stocks');
const buyHoldingInfoEl = document.getElementById('buy-holding-info');
const sellHoldingInfoEl = document.getElementById('sell-holding-info');
const buyPowerEl = document.getElementById('buy-power');
const sellPowerEl = document.getElementById('sell-power');
const buyQuantityInput = document.getElementById('buy-quantity');
const sellQuantityInput = document.getElementById('sell-quantity');
const buyBtn = document.getElementById('buy-btn');
const sellBtn = document.getElementById('sell-btn');
const glossaryList = document.getElementById('glossary-list');
const glossarySearchInput = document.getElementById('glossary-search');

const missionContainer = document.getElementById('mission-container');
const missionIcon = document.getElementById('mission-icon');
const missionDropdown = document.getElementById('mission-dropdown');
const missionList = document.getElementById('mission-list');
const loanBtn = document.getElementById('loan-btn');
const repayBtn = document.getElementById('repay-btn');
const walletToggleBtn = document.getElementById('wallet-toggle-btn');
const walletGridContainer = document.getElementById('wallet-grid-container'); // 통화 카드 그리드

window.addEventListener('load', () => {
  const wrapper = document.querySelector('.table-container');
  const table = document.getElementById('portfolio-table');
  wrapper.style.width = table.scrollWidth + 'px';
});

// --- 헬퍼 함수 ---
const formatNumber = (num) => Math.round(num).toLocaleString();
const getReturnRateColorClass = (rate) => {
    if (rate > 0) return 'positive';
    if (rate < 0) return 'negative';
    return 'zero';
};

// --- Firebase 데이터 처리 함수 ---

// 사용자 데이터 로드 또는 생성
let unsubscribeUser = null;

function loadOrCreateUserData(user) {
    const userRef = doc(db, "users", user.uid);
    unsubscribeUser = onSnapshot(userRef, async (userSnap) => {
        if (userSnap.exists()) {
            const userData = userSnap.data();
            cash = userData.cash;
            portfolio = userData.portfolio || {};
            wallets = userData.wallets || {};
            loanAmount = userData.loanAmount || 0;
            updateUIForUser();
        } else {
            resetToDefaultState();
            await setDoc(userRef, {
                displayName: user.displayName,
                email: user.email,
                cash: cash,
                portfolio: portfolio,
                wallets: wallets
            });
        }
    });
}

// --- 인증 상태 처리 ---

onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        const span = document.createElement('span');
        span.textContent = `${user.displayName}님 환영합니다!`;
        const btn = document.createElement('button');
        btn.id = 'logout-btn';
        btn.textContent = '로그아웃';
        
        userAuthEl.innerHTML = '';
        userAuthEl.appendChild(span);
        userAuthEl.appendChild(btn);

        document.getElementById('logout-btn').addEventListener('click', () => {
            if (unsubscribeUser) unsubscribeUser();
            signOut(auth);
        });
        loadOrCreateUserData(user);
        userAuthEl.prepend(missionContainer);
        missionContainer.style.display = 'block';
        loadAndDisplayMissions();
    } else {
        if (unsubscribeUser) unsubscribeUser();
        currentUser = null;
        missionContainer.style.display = 'none';
        userAuthEl.innerHTML = `<button id="login-btn">Google 로그인</button>`;
        document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
        resetToDefaultState();
        updateUIForGuest();
    }
});

function resetToDefaultState() {
    cash = 10000000;
    portfolio = {};
    wallets = {};
    loanAmount = 0;
}

// --- 정보 위젯(공지/뉴스) 기능 ---

async function loadAnnouncementsFromDB() {
    const container = document.getElementById('announcements-panel');
    container.innerHTML = '<p>공지사항을 불러오는 중...</p>';

    const q = query(collection(db, "announcements"), orderBy("timestamp", "desc"), limit(5));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        container.innerHTML = '<p>새로운 공지사항이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = querySnapshot.docs.map(doc => {
        const item = doc.data();
        const date = item.timestamp.toDate();
        const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        return `
            <div class="announcement-item">
                <p class="item-title">${item.title}</p>
                <p class="item-date">${formattedDate}</p>
            </div>
        `;
    }).join('');
}

async function loadNewsFromDB() {
    const container = document.getElementById('news-panel');
    container.innerHTML = '<p>뉴스를 불러오는 중...</p>';

    const q = query(collection(db, "news"), orderBy("timestamp", "desc"), limit(5));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        container.innerHTML = '<p>최신 뉴스가 없습니다.</p>';
        return;
    }

    container.innerHTML = querySnapshot.docs.map(doc => {
        const item = doc.data();
        return `
            <a href="${item.url}" target="_blank" class="news-item">
                <p class="item-title">${item.title}</p>
                <p class="item-source">${item.source || '출처 없음'}</p>
            </a>
        `;
    }).join('');
}

// --- 미션 보상 함수 ---
async function claimMissionReward(e) {
    const missionId = e.target.dataset.id;
    if (!missionId || !currentUser) return;

    // 중복 클릭 방지를 위해 버튼을 즉시 비활성화
    e.target.disabled = true;
    e.target.textContent = '처리 중...';

    try {
        const result = await claimMissionRewardFunc({ missionId });
        alert(`보상 ₩${formatNumber(result.data.reward)}을 획득했습니다!`);
        // 현금 및 UI 갱신은 onSnapshot 리스너가 자동 처리함
        loadAndDisplayMissions(); 
    } catch (error) {
        console.error("보상 수령 중 오류 발생:", error);
        alert(error.message || "보상 수령 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        loadAndDisplayMissions();
    }
}

// --- UI 업데이트 함수 ---

function updateUIForGuest() {
    portfolioTableBody.innerHTML = `<tr><td colspan="7">로그인 후 이용 가능합니다.</td></tr>`;
    totalAssetsEl.textContent = '₩-';
    totalReturnRateEl.textContent = '0.00%';
    cashBalanceEl.textContent = '₩-';
    buyPowerEl.textContent = `₩-`;
    buyHoldingInfoEl.innerHTML = '로그인 후 이용 가능합니다.';
    sellHoldingInfoEl.innerHTML = '';
    sellPowerEl.textContent = '0주';
}

function updateUIForUser() {
    updatePortfolio();
    updateTradableStocksList();
    if (selectedStockCode && stocks[selectedStockCode]) {
        selectStock(selectedStockCode);
    }
}

function updatePortfolio() {
    if (!currentUser) return;

    let totalStockValueKRW = 0;
    let hasStocks = false;

    // --- 1. 총자산 계산 (모든 자산을 KRW로 환산) ---
    // 보유 주식 가치 계산
    Object.keys(portfolio).forEach(code => {
        const item = portfolio[code];
        if (item && item.quantity > 0) {
            hasStocks = true;
            const currentPrice = stocks[code] ? stocks[code].price : item.price;
            const valuationInKRW = item.quantity * currentPrice * (exchangeRates.krw || 1); // 원화 주식
            totalStockValueKRW += valuationInKRW;
        }
    });
    // (향후 해외 주식 포트폴리오도 여기에 추가하여 KRW로 환산)

    // 보유 현금 가치 계산
    const cashKRW = cash || 0;
    const usdInKRW = (wallets.usd || 0) * (exchangeRates.usd || 0);
    const eurInKRW = (wallets.eur || 0) * (exchangeRates.eur || 0);
    const jpyInKRW = (wallets.jpy || 0) * (exchangeRates.jpy || 0);
    const totalCashInKRW = cashKRW + usdInKRW + eurInKRW + jpyInKRW;

    const totalAssetsInKRW = totalStockValueKRW + totalCashInKRW;
    
    // --- 2. UI 업데이트 ---
    const loanBtn = document.getElementById('loan-btn');
    const repayBtn = document.getElementById('repay-btn');
    const loanDisplay = document.getElementById('loan-display');

    if (buyPowerEl) {
        buyPowerEl.textContent = `₩${formatNumber(cash, 0)}`;
    }

    // 대출금 및 상환 버튼 UI 처리
    if (loanAmount > 0) {
        loanDisplay.textContent = `대출금: ₩${formatNumber(loanAmount, 0)}`;
        loanDisplay.style.display = 'block';
        repayBtn.style.display = 'inline-block';
        // 보유 현금이 대출금보다 적으면 상환 버튼 비활성화
        repayBtn.disabled = (cash < loanAmount);
    } else {
        loanDisplay.style.display = 'none';
        repayBtn.style.display = 'none';
    }

    // 2-2. 대출받기 버튼 UI 처리
    if (totalAssetsInKRW < 5000000) {
        loanBtn.style.display = 'inline-block';
    } else {
        loanBtn.style.display = 'none';
    }

    // 총 자산 표시
    document.getElementById('total-assets').textContent = `₩${formatNumber(totalAssetsInKRW, 0)}`;

    // 개별 통화 지갑 표시
    document.getElementById('krw-balance').innerHTML = `<div class="currency">KRW</div><div class="balance">₩ ${formatNumber(cashKRW, 0)}</div>`;
    document.getElementById('usd-balance').innerHTML = `<div class="currency">USD</div><div class="balance">$ ${(wallets.usd || 0).toFixed(2)}</div>`;
    document.getElementById('eur-balance').innerHTML = `<div class="currency">EUR</div><div class="balance">€ ${(wallets.eur || 0).toFixed(2)}</div>`;
    document.getElementById('jpy-balance').innerHTML = `<div class="currency">JPY</div><div class="balance">¥ ${formatNumber(wallets.jpy || 0, 0)}</div>`;

    // 보유 주식 테이블 업데이트
    portfolioTableBody.innerHTML = '';
    if (!hasStocks) {
        portfolioTableBody.innerHTML = `<tr><td colspan="7">보유한 주식이 없습니다.</td></tr>`;
    } else {
        Object.keys(portfolio).forEach(code => {
            const item = portfolio[code];
            if (item && item.quantity > 0) {
                // (기존 보유 주식 테이블 렌더링 로직은 그대로 유지)
                const currentPrice = stocks[code] ? stocks[code].price : item.price;
                const valuation = currentPrice * item.quantity;
                const profitLoss = (currentPrice - item.price) * item.quantity;
                const returnRate = item.price === 0 ? 0 : ((currentPrice / item.price) - 1) * 100;
                const tr = document.createElement('tr');
                
                const nameTd = document.createElement('td');
                nameTd.textContent = `${stocks[code] ? stocks[code].name : '알수없음'} (${code})`;
                tr.appendChild(nameTd);

                const quantityTd = document.createElement('td');
                quantityTd.textContent = formatNumber(item.quantity);
                tr.appendChild(quantityTd);

                const avgPriceTd = document.createElement('td');
                avgPriceTd.textContent = `₩${formatNumber(item.price)}`;
                tr.appendChild(avgPriceTd);

                const curPriceTd = document.createElement('td');
                curPriceTd.textContent = `₩${formatNumber(currentPrice)}`;
                tr.appendChild(curPriceTd);

                const valuationTd = document.createElement('td');
                valuationTd.textContent = `₩${formatNumber(valuation)}`;
                tr.appendChild(valuationTd);

                const profitLossTd = document.createElement('td');
                profitLossTd.className = getReturnRateColorClass(returnRate);
                profitLossTd.textContent = formatNumber(profitLoss);
                tr.appendChild(profitLossTd);

                const returnRateTd = document.createElement('td');
                returnRateTd.className = getReturnRateColorClass(returnRate);
                returnRateTd.textContent = `${returnRate.toFixed(2)}%`;
                tr.appendChild(returnRateTd);

                portfolioTableBody.appendChild(tr);
            }
        });
    }

    // (기존 cashBalanceEl, totalReturnRateEl 관련 코드는 삭제해도 좋습니다)
}

function updateTradableStocksList() {
    tradableStocksList.innerHTML = '';
    for (const code in stocks) {
        const stock = stocks[code];
        const lastPrice = stock.history[stock.history.length - 2] || stock.price;
        const change = stock.price - lastPrice;
        
        const li = document.createElement('li');
        li.dataset.code = code;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = stock.name;
        
        const priceSpan = document.createElement('span');
        priceSpan.className = getReturnRateColorClass(change);
        priceSpan.textContent = `₩${formatNumber(stock.price)}`;
        
        li.appendChild(nameSpan);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(priceSpan);
        
        if (code === selectedStockCode) {
            li.classList.add('selected');
        }
        tradableStocksList.appendChild(li);
    }
}

function updateChart(code) {
    if (!stocks[code]) return;
    const stock = stocks[code];
    const ctx = document.getElementById('stock-chart').getContext('2d');
    const labels = Array.from({ length: stock.history.length }, (_, i) => i + 1);
    const firstPrice = stock.history[0];
    const borderColor = stock.price >= firstPrice ? 'rgba(231, 76, 60, 1)' : 'rgba(41, 128, 185, 1)';

    if (stockChart) {
        stockChart.data.labels = labels;
        stockChart.data.datasets[0].data = stock.history;
        stockChart.data.datasets[0].label = `${stock.name} 주가 추이`;
        stockChart.data.datasets[0].borderColor = borderColor;
        stockChart.update('none');
    } else {
        stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${stock.name} 주가 추이`,
                    data: stock.history,
                    borderColor: borderColor,
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
        });
    }
}

function selectStock(code) {
    selectedStockCode = code;
    updateTradableStocksList();
    updateChart(code);

    if (!currentUser) return;

    const stockInPortfolio = portfolio[code];
    let holdingText = '보유 내역 없음';
    let returnRateText = '';

    if (stockInPortfolio && stockInPortfolio.quantity > 0) {
        const returnRate = ((stocks[code].price / stockInPortfolio.price) - 1) * 100;
        holdingText = `보유량: ${formatNumber(stockInPortfolio.quantity)}주`;
        returnRateText = ` | <span class="${getReturnRateColorClass(returnRate)}">수익률: ${returnRate.toFixed(2)}%</span>`;
    }
    
    buyHoldingInfoEl.innerHTML = holdingText + returnRateText;
    sellHoldingInfoEl.innerHTML = holdingText + returnRateText;
    sellPowerEl.textContent = `${stockInPortfolio ? formatNumber(stockInPortfolio.quantity) : 0}주`;
}

// --- 이벤트 리스너 ---

// 탭 전환 이벤트 리스너
document.querySelector('.info-tabs').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const targetPanelId = e.target.dataset.target;

        // 모든 탭 버튼과 패널에서 active 클래스 제거
        document.querySelectorAll('.info-tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.info-panel').forEach(panel => panel.classList.remove('active'));

        // 클릭된 탭 버튼과 해당 패널에 active 클래스 추가
        e.target.classList.add('active');
        document.getElementById(targetPanelId).classList.add('active');
    }
});

// --- 미션 드롭다운 이벤트 리스너 ---
missionIcon.addEventListener('click', (e) => {
    e.stopPropagation(); // 이벤트 버블링 방지
    missionDropdown.classList.toggle('show');
});

// 화면의 다른 곳을 클릭하면 드롭다운을 닫음
window.addEventListener('click', (e) => {
    if (!missionContainer.contains(e.target)) {
        missionDropdown.classList.remove('show');
    }
});

// 툴팁을 잠시 보여줬다가 사라지게 하는 헬퍼 함수
let tooltipTimer;
function showTooltip(tooltipId, message) {
    const tooltip = document.getElementById(tooltipId);
    if (!tooltip) return;

    tooltip.textContent = message;
    tooltip.classList.add('show');

    // 이전 타이머가 있다면 초기화
    clearTimeout(tooltipTimer);

    // 2초 후에 툴팁을 숨김
    tooltipTimer = setTimeout(() => {
        tooltip.classList.remove('show');
    }, 2000);
}

walletToggleBtn.addEventListener('click', () => {
    walletGridContainer.classList.toggle('expanded');
    walletToggleBtn.querySelector('.toggle-icon').classList.toggle('rotated');
});

// --- 환율 정보 실시간 구독 함수 ---
function listenToExchangeRates() {
    const ratesRef = doc(db, "system", "exchangeRates");
    onSnapshot(ratesRef, (doc) => {
        if (doc.exists()) {
            exchangeRates = doc.data();
            
            // 환율 정보를 받은 후, 포트폴리오 UI를 다시 계산하여 업데이트합니다.
            if (currentUser) {
                updatePortfolio();
            }
        }
    });
}

// 매수 수량 입력 이벤트 리스너
buyQuantityInput.addEventListener('input', (e) => {
    const currentPrice = selectedStockCode ? stocks[selectedStockCode].price : 0;
    if (!selectedStockCode || currentPrice <= 0) return;

    const maxBuyableQuantity = Math.floor(cash / currentPrice);
    const currentQuantity = parseInt(e.target.value, 10);

    if (currentQuantity > maxBuyableQuantity) {
        e.target.value = maxBuyableQuantity;
        showTooltip('buy-tooltip', '최대 매수 가능 수량입니다.');
    }
});

// 매도 수량 입력 이벤트 리스너
sellQuantityInput.addEventListener('input', (e) => {
    if (!selectedStockCode) return;

    const stockInPortfolio = portfolio[selectedStockCode];
    const maxSellableQuantity = stockInPortfolio ? stockInPortfolio.quantity : 0;
    const currentQuantity = parseInt(e.target.value, 10);

    if (currentQuantity > maxSellableQuantity) {
        e.target.value = maxSellableQuantity;
        showTooltip('sell-tooltip', '최대 매도 가능 수량입니다.');
    }
});

// '전체 매도' 버튼 이벤트 리스너
const sellAllBtn = document.getElementById('sell-all-btn');

sellAllBtn.addEventListener('click', async () => {
    // 1. 로그인 상태 및 포트폴리오 유무 확인
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    if (Object.keys(portfolio).length === 0) {
        alert('매도할 주식이 없습니다.');
        return;
    }

    // 2. 사용자에게 최종 확인 받기 (안전장치)
    const isConfirmed = confirm('정말로 모든 주식을 현재가에 매도하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
    if (!isConfirmed) {
        return;
    }

    // 3. 전체 매도 로직 실행
    try {
        let totalSaleValue = 0;
        // 모든 보유 주식의 현재 가치를 합산
        for (const code in portfolio) {
            const item = portfolio[code];
            const currentPrice = stocks[code] ? stocks[code].price : 0;
            totalSaleValue += item.quantity * currentPrice;
        }

        // 4. Firestore에 업데이트할 데이터 준비
        const newCash = cash + totalSaleValue;
        const userRef = doc(db, "users", currentUser.uid);
        
        // 현금은 업데이트하고, 포트폴리오는 빈 객체로 덮어씌워 모두 삭제
        await updateDoc(userRef, {
            cash: newCash,
            portfolio: {}
        });

        // 5. 로컬 데이터 및 UI 업데이트
        cash = newCash;
        portfolio = {}; // 로컬 포트폴리오 비우기

        alert('모든 주식을 성공적으로 매도했습니다.');
        updatePortfolio();
        selectStock(selectedStockCode); // 거래창 정보도 갱신

    } catch (error) {
        console.error("전체 매도 처리 중 오류 발생:", error);
        alert("전체 매도 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
});

// 탭 전환
document.querySelector('nav').addEventListener('click', (e) => {
    if (e.target.classList.contains('nav-link')) {
        e.preventDefault();
        const targetId = e.target.dataset.target;
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
    }
});

// 주식 선택
tradableStocksList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) selectStock(li.dataset.code);
});

// 매수
buyBtn.addEventListener('click', async () => {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }
    const quantity = parseInt(buyQuantityInput.value);
    if (!selectedStockCode || !quantity || quantity <= 0) { alert('매수할 종목과 수량을 정확히 입력해주세요.'); return; }
    
    // 로컬 검증 (빠른 피드백용)
    const currentPrice = stocks[selectedStockCode].price;
    const cost = currentPrice * quantity;
    if (cash < cost) { alert('현금이 부족합니다.'); return; }

    buyBtn.disabled = true;
    buyBtn.textContent = '처리 중...';

    try {
        await buyDomesticStock({ stockCode: selectedStockCode, quantity });
        alert(`${stocks[selectedStockCode].name} ${quantity}주 매수 완료!`);
        buyQuantityInput.value = '';
    } catch (error) {
        console.error("매수 처리 중 오류 발생:", error);
        alert(error.message || "매수 처리 중 오류가 발생했습니다.");
    } finally {
        buyBtn.disabled = false;
        buyBtn.textContent = '매수';
    }
});

// 매도
sellBtn.addEventListener('click', async () => {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }
    const quantity = parseInt(sellQuantityInput.value);
    if (!selectedStockCode || !quantity || quantity <= 0) { alert('매도할 종목과 수량을 정확히 입력해주세요.'); return; }
    
    const stockInPortfolio = portfolio[selectedStockCode];
    if (!stockInPortfolio || stockInPortfolio.quantity < quantity) { alert('보유 수량이 부족합니다.'); return; }

    sellBtn.disabled = true;
    sellBtn.textContent = '처리 중...';

    try {
        await sellDomesticStock({ stockCode: selectedStockCode, quantity });
        alert(`${stocks[selectedStockCode].name} ${quantity}주 매도 완료!`);
        sellQuantityInput.value = '';
    } catch (error) {
        console.error("매도 처리 중 오류 발생:", error);
        alert(error.message || "매도 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
        sellBtn.disabled = false;
        sellBtn.textContent = '매도';
    }
});

// --- 미션 로드 및 표시 함수 (진행도 계산 추가) ---
async function loadAndDisplayMissions() {
    if (!currentUser) return;
    const missionsRef = collection(db, "users", currentUser.uid, "dailyMissions");
    const missionsSnap = await getDocs(missionsRef);

    missionList.innerHTML = '';
    if (missionsSnap.empty) {
        missionList.innerHTML = '<li>오늘의 미션이 아직 도착하지 않았습니다.</li>';
        missionIcon.style.setProperty('--progress', '0%'); // 진행도 초기화
        return;
    }

    let completedCount = 0;
    const totalMissions = missionsSnap.docs.length;

    missionsSnap.docs.forEach(doc => {
        const mission = doc.data();
        const missionId = doc.id;

        if (mission.status === 'rewardClaimed') {
            completedCount++;
        }
        // (이하 li 요소 생성 및 추가 로직은 이전과 동일)
        const li = document.createElement('li');
        
        const h4 = document.createElement('h4');
        h4.textContent = mission.title;
        li.appendChild(h4);
        
        const p = document.createElement('p');
        p.textContent = mission.description;
        li.appendChild(p);
        
        const footerDiv = document.createElement('div');
        footerDiv.className = 'mission-footer';
        
        const rewardSpan = document.createElement('span');
        rewardSpan.className = 'reward';
        rewardSpan.textContent = `보상: ₩${formatNumber(mission.reward)}`;
        footerDiv.appendChild(rewardSpan);
        
        const claimBtn = document.createElement('button');
        claimBtn.className = 'claim-btn';
        claimBtn.dataset.id = missionId;
        if (mission.status !== 'completed') {
            claimBtn.disabled = true;
        }
        claimBtn.textContent = mission.status === 'rewardClaimed' ? '수령완료' : '보상받기';
        footerDiv.appendChild(claimBtn);
        
        li.appendChild(footerDiv);
        missionList.appendChild(li);
    });
    
    // 미션 진행도 계산 및 원형 프로그레스 바 업데이트
    const progressPercentage = (completedCount / totalMissions) * 100;
    missionIcon.style.setProperty('--progress', `${progressPercentage}%`);

    // 보상받기 버튼에 이벤트 리스너 추가
    document.querySelectorAll('.claim-btn').forEach(btn => {
        btn.addEventListener('click', claimMissionReward);
    });
}


// 검색창에 글자를 입력할 때마다 renderGlossary 함수를 호출
glossarySearchInput.addEventListener('input', (e) => {
    renderGlossary(e.target.value);
});


// --- 실시간 데이터 리스너 ---

// '대출받기' 버튼 클릭 시
loanBtn.addEventListener('click', async () => {
    if (!currentUser) return alert('로그인이 필요합니다.');

    const isConfirmed = confirm('정말로 500만원을 대출받으시겠습니까?');
    if (!isConfirmed) return;

    // 로딩 상태 시작
    loanBtn.disabled = true;
    loanBtn.textContent = '처리 중...';

    try {
        const result = await takeLoan(); // Cloud Function 호출
        if (result.data.success) {
            alert(result.data.message);
            // 성공 시 로컬 데이터 즉시 업데이트
            loanAmount += 5000000;
            cash += 5000000;
            updatePortfolio(); // UI 새로고침
        }
    } catch (error) {
        console.error("대출 요청 실패:", error);
        alert(`대출 실패: ${error.message}`);
    } finally {
        // 로딩 상태 종료
        loanBtn.disabled = false;
        loanBtn.textContent = '500만원 대출받기';
    }
});

// '상환하기' 버튼 클릭 시
repayBtn.addEventListener('click', async () => {
    if (!currentUser) return alert('로그인이 필요합니다.');
    
    const isConfirmed = confirm(`대출금 ₩${formatNumber(loanAmount, 0)} 전액을 상환하시겠습니까?`);
    if (!isConfirmed) return;

    // 로딩 상태 시작
    repayBtn.disabled = true;
    repayBtn.textContent = '처리 중...';

    try {
        const result = await repayLoan(); // Cloud Function 호출
        if (result.data.success) {
            alert(result.data.message);
            // 성공 시 로컬 데이터 즉시 업데이트
            cash -= loanAmount;
            loanAmount = 0;
            updatePortfolio(); // UI 새로고침
        }
    } catch (error) {
        console.error("상환 요청 실패:", error);
        alert(`상환 실패: ${error.message}`);
    } finally {
        // 로딩 상태 종료
        repayBtn.disabled = false;
        repayBtn.textContent = '대출금 상환하기';
    }
});

// 실시간으로 주식 데이터를 구독(listen)하는 함수
function listenToGlobalStockData() {
    const stocksRef = collection(db, "stocks");
    
    onSnapshot(stocksRef, (snapshot) => {
        snapshot.docs.forEach(doc => {
            stocks[doc.id] = doc.data();
        });

        // 데이터가 변경되었으니, 화면 UI를 최신 정보로 업데이트합니다.
        updateTradableStocksList();
        if (currentUser) {
            updatePortfolio();
            if (selectedStockCode) {
                updateChart(selectedStockCode);
                selectStock(selectedStockCode);
            }
        }

        // 맨 처음 데이터 로드에 성공했을 때만 실행
        if (isFirstStockLoad && !snapshot.empty) {
            isFirstStockLoad = false; // 다시 실행되지 않도록 플래그 변경
            if (Object.keys(stocks).length > 0 && !selectedStockCode) {
                selectStock(Object.keys(stocks)[0]);
            }
        }
    });
}

// --- 카운트다운 타이머 로직 ---
const updateTimerEl = document.getElementById('update-timer');
const updateTimerEl2 = document.getElementById('update-timer2');

function startUpdateTimer() {
    if (!updateTimerEl||!updateTimerEl2) return;

    // 1초마다 사용자의 현재 시간을 확인하여 남은 시간을 다시 계산합니다.
    setInterval(() => {
        // 현재 시간의 '초'를 가져옵니다 (0~59).
        const seconds = new Date().getSeconds();
        
        // 다음 분 '1초'까지 몇 초가 남았는지 계산합니다.
        // 예: 현재 30초 -> (61 - 30) % 60 = 31초 남음
        // 예: 현재 59초 -> (61 - 59) % 60 = 2초 남음
        let secondsRemaining = (60 - seconds) % 60;
        
        // 업데이트되는 순간(매분 1초)에는 계산 결과가 0이 됩니다.
        // 이때는 다음 업데이트까지 60초가 남은 것이므로 60으로 표시해줍니다.
        if (secondsRemaining < 0) {
            secondsRemaining = 60;
        }

        if(updateTimerEl)
            updateTimerEl.textContent = `다음 변동까지: ${secondsRemaining}초`;
        if(updateTimerEl2)
            updateTimerEl2.textContent = `다음 변동까지: ${secondsRemaining}초`;
    }, 1000);
}

// --- 앱 시작 ---
function startApp() {
    // 앱은 시작 시 주식 데이터를 한번 로드하는 대신,
    // 실시간 리스너를 실행하여 계속해서 업데이트를 받습니다.
    listenToGlobalStockData();
    listenToExchangeRates();
    startUpdateTimer();
    loadUpdates();
    renderGlossary();
    loadAnnouncementsFromDB(); // 공지사항 로드 (Firestore)
    loadNewsFromDB(); // 뉴스 로드 (Firestore)
    
    // 첫번째 주식 기본 선택 (데이터가 로드된 후 선택되도록 약간의 지연을 줍니다)
    setTimeout(() => {
        if (Object.keys(stocks).length > 0 && !selectedStockCode) {
            selectStock(Object.keys(stocks)[0]);
        }
    }, 1500); // 네트워크 상황에 따라 약간의 시간 필요
}

startApp();