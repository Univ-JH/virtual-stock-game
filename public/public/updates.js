// --- 업데이트 게시판 데이터 ---
const updatesData = [
    {
        title: "v0.2.7 업데이트: 버그 수정 및 UI 개편, 대출기능 추가",
        date: "2025.10.02",
        content: "타이머가 안보이는 버그를 수정하였습니다.\n'내 포트폴리오'에서 타이머의 위치와 '전체 매도' 버튼 위치를 조정하였습니다."
    },
    {
        title: "v0.2.6 업데이트: 버그 수정 및 UI 개편, 대출기능 추가",
        date: "2025.10.02",
        content: "모바일 버전에서 '내 포트폴리오' UI가 비정상적으로 늘어진 부분을 수정하였습니다.\n메인화면 '내 포트폴리오'에서 보유한 모든 화폐량을 확인할 수 있습니다.\n환전소에서도 본인이 보유한 화폐가 표시됩니다.\n대출 기능이 추가되었습니다. (대출은 500만원미만일 때 활성화 되며 500만원을 대출할 수 있습니다)\n대출에 따른 큰 패널티는 없지만 공지사항/뉴스에 박제되실 수 있습니다."
    },
    {
        title: "v0.2.5 업데이트: 버그 수정 및 편의성 기능 개발중",
        date: "2025.09.30",
        content: "환전소 같은 통화를 선택하여 환전하는 경우 돈 복사가 되는 버그를 수정하였습니다.\n보내는 통화량을 보유량보다 많이 입력할 경우 자동으로 최대 환전량으로 입력됩니다."
    },
    {
        title: "v0.2.4 업데이트: 버그 수정 및 개발 단계",
        date: "2025.09.30",
        content: "몇몇 일일 미션이 완료되지 않는 버그를 수정하였습니다.\n환전소가 개발되었습니다. (환율 변동은 10분마다, 변동폭은 작습니다)"
    },
    {
        title: "v0.2.3 업데이트: 일일 미션",
        date: "2025.09.28",
        content: "일일 미션이 생겼습니다! 우측 상단 🎯을 클릭하면 확인할 수 있습니다!\n미션은 매일 8시에 초기화됩니다!"
    },
    {
        title: "v0.2.2 업데이트: 버그 수정 및 편의성 개선, 랭킹 시스템 도입",
        date: "2025.09.28",
        content: "웹페이지에 작은 버그들을 수정하였습니다.\n'내 포트폴리오'에서 주식 전체 매도 기능을 추가하였습니다. (사용시 가진 주식에 모든 수량을 매도하기에 주의해주세요)\n랭킹 기능을 추가하였습니다. 1시간마다 갱신됩니다."
    },
    {
        title: "v0.2.1 업데이트: 버그 수정 및 편의성 개선",
        date: "2025.09.27",
        content: "풀매도시 매도가 되지 않는 버그를 수정하였습니다.\n매수/매도 시 최대 수량을 초과하여 입력하면 자동으로 최대치로 변경되는 기능이 추가되었습니다. 이제 더 편리하게 거래해 보세요!\n가격 변동까지의 남은 시간을 보여주는 타이머를 추가하였습니다."
    },
    {
        title: "v0.2.0 업데이트: 서버 생성",
        date: "2025.09.27",
        content: "구글 계정 로그인 서비스를 시작하였습니다! 이제 거래한 주식들과 자금들이 서버에 저장됩니다!\n주식 가격은 서버에서 관리합니다! 모든 사람들은 같은 주식을 보고 같은 가격에 주식을 매수/매도합니다!\n(주식 변동 시간은 1분마다 입니다!)"
    },
    {
        title: "가상 주식 게임 v0.1.0 체험판 출시!",
        date: "2025.09.25",
        content: "가상 주식게임 체험판을 출시하였습니다! 주식으로 최고의 부자가 되어보세요!"
    }
];

// --- 업데이트 게시판 기능 (로컬 데이터 방식) ---
export function loadUpdates() {
    const postsContainer = document.getElementById('update-posts-container');
    if (!postsContainer) return;

    if (!updatesData || updatesData.length === 0) {
        postsContainer.innerHTML = '<p>아직 업데이트 소식이 없습니다.</p>';
        return;
    }

    postsContainer.innerHTML = '';

    updatesData.forEach(post => {
        const postElement = document.createElement('div');
        postElement.classList.add('update-post');
        const formattedContent = post.content.replace(/\n/g, '<br>');

        postElement.innerHTML = `
            <div class="post-header">
                <h3>${post.title}</h3>
                <span class="post-date">${post.date}</span>
            </div>
            <div class="post-content">
                <p>${formattedContent}</p>
            </div>
        `;
        postsContainer.appendChild(postElement);
    });
}