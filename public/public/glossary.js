// --- 용어 사전 데이터 ---
const glossaryData = {
    "PER (주가수익비율)": "주가를 주당순이익(EPS)으로 나눈 값으로, 주가가 그 회사 1주당 수익의 몇 배가 되는가를 나타냅니다. 낮을수록 저평가되었다고 해석할 수 있습니다.",
    "PBR (주가순자산비율)": "주가를 주당순자산가치(BPS)로 나눈 값입니다. 주가가 순자산에 비해 몇 배로 거래되고 있는지를 측정하는 지표입니다.",
    "ROE (자기자본이익률)": "회사가 자기자본을 이용하여 얼마만큼의 이익을 냈는지를 나타내는 지표로, 기업의 이익창출능력을 보여줍니다.",
    "예수금": "주식 거래를 위해 계좌에 넣어둔 현금으로, 주식을 매수하는 데 사용됩니다.",
    "지정가": "투자자가 매매하려는 종목의 가격을 직접 지정하여 주문하는 방식입니다.",
    "시장가": "종목과 수량만 지정하고 가격은 지정하지 않는 주문 방식입니다. 현재 가장 유리한 가격으로 즉시 체결됩니다.",
    "시가총액": "상장된 주식의 총 수를 현재 주가로 곱한 값으로, 기업의 전체 가치를 나타냅니다."
};

// --- 용어 사전 기능 함수 ---

// 용어 목록을 화면에 렌더링하는 함수
export function renderGlossary(searchTerm = '') {
    const glossaryList = document.getElementById('glossary-list');
    if (!glossaryList) return;

    glossaryList.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const filteredData = Object.entries(glossaryData).filter(([term, definition]) => 
        term.toLowerCase().includes(lowerCaseSearchTerm) ||
        definition.toLowerCase().includes(lowerCaseSearchTerm)
    );

    if (filteredData.length === 0) {
        glossaryList.innerHTML = '<p>검색 결과가 없습니다.</p>';
        return;
    }

    filteredData.forEach(([term, definition]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = definition;
        glossaryList.appendChild(dt);
        glossaryList.appendChild(dd);
    });
}