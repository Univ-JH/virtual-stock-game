import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const formatNumber = (num) => Math.round(num).toLocaleString();

async function loadTop10Rankings() {
    const returnRateRankBody = document.getElementById('return-rate-rank-body');
    const totalAssetsRankBody = document.getElementById('total-assets-rank-body');
    returnRateRankBody.innerHTML = `<tr><td colspan="3">랭킹을 불러오는 중입니다...</td></tr>`;
    totalAssetsRankBody.innerHTML = `<tr><td colspan="3">랭킹을 불러오는 중입니다...</td></tr>`;

    try {
        // 1. 서버가 미리 계산해 둔 'rankings/top10' 문서 하나만 읽어옵니다.
        const rankingRef = doc(db, "rankings", "top10");
        const docSnap = await getDoc(rankingRef);

        if (!docSnap.exists()) {
            throw new Error("랭킹 데이터가 아직 준비되지 않았습니다.");
        }

        const rankings = docSnap.data();
        
        // 2. 마지막 업데이트 시간 표시
        const lastUpdated = rankings.lastUpdated.toDate();
        document.getElementById('last-updated-time').textContent = `(업데이트: ${lastUpdated.toLocaleString()})`;

        // 3. 테이블에 랭킹을 렌더링합니다.
        renderRankings(rankings.byReturnRate, returnRateRankBody, 'returnRate');
        renderRankings(rankings.byTotalAssets, totalAssetsRankBody, 'totalAssets');

    } catch (error) {
        console.error("랭킹 로드 중 오류 발생:", error);
        const errorMessage = `<tr><td colspan="3">랭킹을 불러오는 데 실패했습니다.</td></tr>`;
        returnRateRankBody.innerHTML = errorMessage;
        totalAssetsRankBody.innerHTML = errorMessage;
    }
}

function renderRankings(sortedUsers, tableBody, type) {
    tableBody.innerHTML = '';
    if (!sortedUsers || sortedUsers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3">랭킹 정보가 없습니다.</td></tr>`;
            return;
    }
    sortedUsers.forEach((user, index) => {
        const rank = index + 1;
        let value;
        if (type === 'returnRate') {
            value = `${user.returnRate.toFixed(2)}%`;
        } else {
            value = `₩${formatNumber(user.totalAssets)}`;
        }
        const row = `<tr><td>${rank}</td><td>${user.name}</td><td>${value}</td></tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

loadTop10Rankings();