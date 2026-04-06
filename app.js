// PLAX Finance Dashboard - Main Application

// State management
const state = {
    currentMonth: { year: 2025, month: 2 },
    data: {
        sales: null,
        creator: null,
        shinhan: null,
        ibk: null,
        hanasg: null,
        tax: null,
        card: null
    },
    rawData: {}, // Store raw CSV data for viewing
    totals: {
        sales: 0,
        expenses: 0,
        profit: 0,
        margin: 0
    }
};

// File type labels
const FILE_LABELS = {
    sales: '매출 (PG사별)',
    creator: '크리에이터 정산',
    shinhan: '신한은행',
    ibk: '기업은행',
    hanasg: '하나은행 싱가폴',
    tax: '매입 세금계산서',
    card: '신용카드'
};

// Exchange rates
const EXCHANGE_RATES = {
    USD: 1470,
    JPY: 9.4
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    loadFromStorage();  // 저장된 데이터 불러오기
    initializeUploadZones();
    initializeMonthSelector();
    initializeTabs();
    updateMonthDisplay();

    // 항상 서버 파일에서 자동 로드 시도
    await autoLoadFromServer();

    calculateTotals();
    updateDisplay();
    updateRawDataGrid();
    restoreUploadUI();  // 업로드 UI 복원
});

// Tab navigation
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update button states
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Month selector
function initializeMonthSelector() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');

    prevBtn.addEventListener('click', () => {
        saveToStorage(); // 현재 월 데이터 저장
        state.currentMonth.month--;
        if (state.currentMonth.month < 1) {
            state.currentMonth.month = 12;
            state.currentMonth.year--;
        }
        switchMonth();
    });

    nextBtn.addEventListener('click', () => {
        saveToStorage(); // 현재 월 데이터 저장
        state.currentMonth.month++;
        if (state.currentMonth.month > 12) {
            state.currentMonth.month = 1;
            state.currentMonth.year++;
        }
        switchMonth();
    });
}

function getMonthKey() {
    return `plaxFinance_${state.currentMonth.year}_${String(state.currentMonth.month).padStart(2, '0')}`;
}

function updateMonthDisplay() {
    const monthDisplay = document.getElementById('currentMonth');
    monthDisplay.textContent = `${state.currentMonth.year}년 ${String(state.currentMonth.month).padStart(2, '0')}월`;
}

async function switchMonth() {
    // 새 월 데이터 로드 (없으면 빈 상태)
    loadFromStorage();
    // UI 전체 갱신
    updateMonthDisplay();
    resetUploadUI();

    // localStorage에 데이터 없으면 서버에서 자동 로드
    const hasData = Object.values(state.data).some(v => v !== null);
    if (!hasData) {
        await autoLoadFromServer();
    }

    restoreUploadUI();
    calculateTotals();
    updateDisplay();
    updateRawDataGrid();
}

function resetUploadUI() {
    const types = ['sales', 'creator', 'shinhan', 'ibk', 'hanasg', 'tax', 'card'];
    const fileHints = {
        sales: 'sales.csv',
        creator: 'creator-settlement.csv',
        shinhan: 'bank-shinhan.csv',
        ibk: 'bank-ibk.csv',
        hanasg: 'bank-hana-sg.pdf',
        tax: 'tax-invoices.csv',
        card: 'card-expense.csv'
    };
    for (const type of types) {
        const zone = document.querySelector(`.upload-zone[data-type="${type}"]`);
        const statusEl = document.getElementById(`status-${type}`);
        const input = zone.querySelector('.file-input');
        const placeholder = zone.querySelector('.upload-placeholder');
        zone.classList.remove('uploaded');
        input.value = '';
        statusEl.textContent = '';
        statusEl.className = 'upload-status';
        placeholder.innerHTML = `
            <span class="upload-plus">+</span>
            <span class="upload-text">${fileHints[type] || '파일 선택'}</span>
        `;
    }
}

// Upload zones initialization
function initializeUploadZones() {
    const uploadZones = document.querySelectorAll('.upload-zone');

    uploadZones.forEach(zone => {
        const input = zone.querySelector('.file-input');
        const type = zone.dataset.type;

        // Drag and drop
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0], type);
            }
        });

        // Click to upload
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], type);
            }
        });
    });
}

// File upload handler
async function handleFileUpload(file, type) {
    const statusEl = document.getElementById(`status-${type}`);
    const zone = document.querySelector(`.upload-zone[data-type="${type}"]`);

    try {
        statusEl.textContent = '처리 중...';
        statusEl.className = 'upload-status';

        const content = await readFile(file);

        // Store raw data
        state.rawData[type] = {
            filename: file.name,
            content: content,
            uploadTime: new Date().toLocaleString('ko-KR')
        };

        const result = await processFile(content, type, file.name);

        state.data[type] = result;
        zone.classList.add('uploaded');

        // Update placeholder with reset button
        const placeholder = zone.querySelector('.upload-placeholder');
        placeholder.innerHTML = `
            <span class="upload-plus" style="background: var(--success); border-color: var(--success); color: white;">✓</span>
            <span class="upload-text">${file.name}</span>
            <button class="upload-reset-btn" onclick="clearUpload('${type}')">✕</button>
        `;

        statusEl.innerHTML = result.summary || '업로드 완료';
        statusEl.className = 'upload-status success';

        calculateTotals();
        updateDisplay();
        updateRawDataGrid();
        saveToStorage();  // 저장

    } catch (error) {
        console.error('File processing error:', error);
        statusEl.textContent = `오류: ${error.message}`;
        statusEl.className = 'upload-status error';
    }
}

// Read file content
// 서버에서 월별 파일 자동 로드
async function autoLoadFromServer() {
    const { year, month } = state.currentMonth;
    const monthDir = `${year}-${String(month).padStart(2, '0')}`;

    // 파일명 → 타입 매핑
    const fileTypeMap = {
        'sales.csv': 'sales',
        'creator-settlement.csv': 'creator',
        'bank-shinhan.csv': 'shinhan',
        'bank-ibk.csv': 'ibk',
        'tax-invoices.csv': 'tax',
        'card-expense.csv': 'card',
    };

    try {
        let loaded = 0;
        for (const [filename, type] of Object.entries(fileTypeMap)) {
            try {
                const dataRes = await fetch(`${monthDir}/${filename}`);
                if (!dataRes.ok) continue;
                const content = await dataRes.text();

                state.rawData[type] = {
                    filename: filename,
                    content: content,
                    uploadTime: '자동 로드'
                };

                const result = await processFile(content, type, filename);
                state.data[type] = result;
                loaded++;
            } catch (e) {
                console.warn(`Failed to load ${filename}:`, e);
            }
        }

        // hana-sg PDF는 별도 처리
        try {
            const pdfRes = await fetch(`${monthDir}/bank-hana-sg.pdf`);
            if (pdfRes.ok) {
                const arrayBuffer = await pdfRes.arrayBuffer();
                const pdfText = await extractPDFText(arrayBuffer);

                state.rawData['hanasg'] = {
                    filename: 'bank-hana-sg.pdf',
                    content: pdfText,
                    uploadTime: '자동 로드'
                };

                const result = await processFile(pdfText, 'hanasg', 'bank-hana-sg.pdf');
                state.data['hanasg'] = result;
                loaded++;
            }
        } catch (e) {
            console.warn('Failed to load bank-hana-sg.pdf:', e);
        }

        if (loaded > 0) {
            console.log(`${monthDir}: ${loaded}개 파일 자동 로드 완료`);
            saveToStorage();
        }
    } catch (e) {
        console.warn('Auto-load failed:', e);
    }
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        if (file.name.toLowerCase().endsWith('.pdf')) {
            // PDF 파일 처리
            reader.onload = async (e) => {
                try {
                    const pdfText = await extractPDFText(e.target.result);
                    resolve(pdfText);
                } catch (err) {
                    reject(new Error('PDF 파일을 읽을 수 없습니다'));
                }
            };
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
            reader.readAsArrayBuffer(file);
        } else {
            // CSV/텍스트 파일 처리
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
            reader.readAsText(file, 'UTF-8');
        }
    });
}

// PDF 텍스트 추출
async function extractPDFText(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    // 디버깅용 - 콘솔에 추출된 텍스트 출력
    console.log('=== PDF 추출 텍스트 ===');
    console.log(fullText);
    console.log('=== 끝 ===');

    return fullText;
}

// Process file based on type
async function processFile(content, type, filename) {
    let text = content;

    switch (type) {
        case 'sales':
            return processSales(text);
        case 'creator':
            return processCreator(text);
        case 'shinhan':
            return processShinhan(text);
        case 'ibk':
            return processIBK(text);
        case 'tax':
            return processTaxInvoices(text);
        case 'card':
            return processCard(text);
        case 'hanasg':
            return processHanaSG(text);
        default:
            throw new Error('알 수 없는 파일 형식입니다');
    }
}

// Parse CSV
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    });
}

// Process sales file
function processSales(text) {
    const rows = parseCSV(text);
    const items = [];
    let total = 0;

    for (const row of rows) {
        if (row.length < 5) continue;
        const pgName = row[0]?.trim();
        const currency = row[1]?.trim();
        const amount = parseNumber(row[4]);

        if (pgName && amount > 0 && !pgName.includes('합계') && !pgName.includes('PG사')) {
            items.push({ name: pgName, currency, amount });
            total += amount;
        }
    }

    return {
        type: 'sales',
        items,
        total,
        summary: `<span style="color: var(--success)">${items.length}개 PG사, ${formatNumber(total)}원</span>`
    };
}

// Process creator settlement
function processCreator(text) {
    const rows = parseCSV(text);
    const items = [];
    let total = 0;

    for (const row of rows) {
        if (row.length < 2) continue;
        const label = row[0]?.trim();
        // 모든 셀에서 숫자 찾기 (₩, 쉼표, 소수점 제거)
        for (let i = 1; i < row.length; i++) {
            const cleaned = row[i]?.toString().replace(/[₩,\s]/g, '');
            const num = parseFloat(cleaned);
            if (!isNaN(num) && num > 0) {
                const amount = Math.round(num);
                items.push({ name: label || `항목${items.length + 1}`, amount });
                total += amount;
            }
        }
    }

    return {
        type: 'creator',
        items,
        total,
        summary: `<span style="color: var(--danger)">크리에이터 정산 ${formatNumber(total)}원</span>`
    };
}

// Process Shinhan bank (세금/보험 관련)
function processShinhan(text) {
    const rows = parseCSV(text);
    const deposits = { total: 0, items: [] };  // 입금 → 매출
    const withdrawals = { total: 0, items: [] };  // 출금 → 매입

    // 찾을 키워드: 국세, 의보, 연금, 보험료, BZ공과
    const keywords = ['국세', '의보', '연금', '보험료', 'BZ공과'];
    const insurancePattern = /^\d{4}/;  // YYMM 형식 (2601, 2702, etc.)

    for (const row of rows) {
        if (row.length < 6) continue;
        const col1 = row[1]?.trim() || '';  // 적요
        const col2 = row[2]?.trim() || '';  // 내용
        const combined = col1 + ' ' + col2;  // 둘 다 확인
        const deposit = parseNumber(row[3]);
        const withdrawal = parseNumber(row[4]);

        // 키워드 매칭 또는 4대보험 패턴 매칭 (적요 또는 내용에서)
        const isMatch = keywords.some(kw => combined.includes(kw)) || insurancePattern.test(col1);

        if (!isMatch) continue;

        // 항목 이름 정리
        let itemName = col1;
        if (insurancePattern.test(col1)) {
            if (combined.includes('건강') || combined.includes('의보')) itemName = '국민건강보험';
            else if (combined.includes('연금')) itemName = '국민연금';
            else if (combined.includes('고용')) itemName = '고용보험';
            else if (combined.includes('산재')) itemName = '산재보험';
            else itemName = '4대보험';
        } else if (combined.includes('국세') && deposit > 0) {
            itemName = '국세 환급';
        } else if (combined.includes('국세납부')) {
            itemName = '국세 납부';
        } else if (combined.includes('지방세')) {
            itemName = '지방세';
        } else if (combined.includes('BZ공과')) {
            itemName = col1;
        }

        if (deposit > 0) {
            deposits.items.push({ name: itemName, amount: deposit });
            deposits.total += deposit;
        }
        if (withdrawal > 0) {
            withdrawals.items.push({ name: itemName, amount: withdrawal });
            withdrawals.total += withdrawal;
        }
    }

    return {
        type: 'shinhan',
        deposits,      // 입금 (매출로 잡힘)
        withdrawals,   // 출금 (매입으로 잡힘)
        depositTotal: deposits.total,
        withdrawalTotal: withdrawals.total,
        summary: `<span style="color: var(--success)">입금 ${formatNumber(deposits.total)}원</span> / <span style="color: var(--danger)">출금 ${formatNumber(withdrawals.total)}원</span>`
    };
}

// Process IBK bank
function processIBK(text) {
    const rows = parseCSV(text);
    let salary = 0;

    // 급여 패턴: YYMM 급여 또는 YYMM　급여 (전각 스페이스 포함)
    const salaryPattern = /\d{4}\s*급여/;

    for (const row of rows) {
        if (row.length < 6) continue;
        const desc = row[1]?.trim() || '';
        const memo = row[7]?.trim() || '';  // 비고 컬럼도 확인
        const withdrawal = parseNumber(row[4]);

        // 급여 패턴 매칭 또는 비고에 "직원급여" 포함 또는 적요에 "급여"/"상여" 포함
        if ((salaryPattern.test(desc) || memo.includes('직원급여') || desc.includes('급여') || desc.includes('상여')) && withdrawal > 0) {
            salary += withdrawal;
        }
    }

    return {
        type: 'ibk',
        salary,
        total: salary,
        summary: salary > 0 ? `<span style="color: var(--danger)">급여 ${formatNumber(salary)}원</span>` : '급여 항목 없음'
    };
}

// Process tax invoices
function processTaxInvoices(text) {
    const rows = parseCSV(text);
    const companies = {};
    let total = 0;

    for (const row of rows) {
        if (row.length < 15) continue;
        const company = row[6]?.trim();
        const amount = parseNumber(row[14]);

        if (company && amount !== 0) {
            companies[company] = (companies[company] || 0) + amount;
            total += amount;
        }
    }

    const items = Object.entries(companies)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    return {
        type: 'tax',
        items,
        allItems: Object.entries(companies).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
        total,
        summary: `<span style="color: var(--danger)">세금계산서 ${formatNumber(total)}원</span>`
    };
}

// Process Hana Bank Singapore - 해외 크리에이터 정산
function processHanaSG(text) {
    const items = [];
    let total = 0;
    let plaxTotal = 0;
    const HANA_USD_RATE = 1480;

    console.log('=== 하나은행 싱가폴 파싱 시작 ===');

    // Outward Remittance 항목 매칭: 금액이 TO 이름 앞에 나옴
    // 패턴: "Outward Remittance Internet Banking   금액   잔액   비고"
    const outwardPattern = /Outward Remittance[^\d]*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(.+?)(?=\s+(?:Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb)\s|\s+Singapore Branch|\s+Date\s+Remark|$)/gi;

    let match;
    while ((match = outwardPattern.exec(text)) !== null) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const remark = match[3].trim();

        console.log('Outward:', amount, 'USD -', remark);

        // PLAX가 포함된 항목은 전부 제외 (계좌간 이동)
        if (remark.toUpperCase().includes('PLAX')) {
            plaxTotal += amount;
            console.log('  → PLAX 제외 (계좌간 이동)');
            continue;
        }

        if (amount > 0) {
            const krwAmount = Math.round(amount * HANA_USD_RATE);
            // TO 이름/국가에서 이름 추출
            const toMatch = remark.match(/TO\s+(.+?)\/(.+)/i);
            const name = toMatch ? toMatch[1].trim().substring(0, 20) : remark.substring(0, 20);
            const country = toMatch ? toMatch[2].trim() : '';
            items.push({
                name: name,
                country: country,
                usdAmount: amount,
                krwAmount: krwAmount
            });
            total += krwAmount;
            console.log('  → 추가:', amount, 'USD =', krwAmount, 'KRW');
        }
    }

    const totalUSD = total / HANA_USD_RATE;
    console.log('=== 하나은행 싱가폴 파싱 완료 ===');
    console.log('해외정산:', items.length + '건,', totalUSD.toFixed(2), 'USD =', formatNumber(total), 'KRW');
    console.log('PLAX 제외:', plaxTotal.toFixed(2), 'USD');

    return {
        type: 'hanasg',
        items,
        total,
        totalUSD: totalUSD,
        plaxExcluded: plaxTotal,
        summary: items.length > 0
            ? `<span style="color: var(--danger)">해외정산(SG) ${formatNumber(total)}원 (${items.length}건, $${Math.round(totalUSD).toLocaleString()})</span>`
            : 'PDF 파싱 결과 없음'
    };
}

// Process credit card
function processCard(text) {
    const rows = parseCSV(text);
    let total = 0;
    const overseas = {};
    const largeByVendor = {};
    let domesticOther = 0;

    for (const row of rows) {
        if (row.length < 10) continue;
        let vendor = row[3]?.trim() || '';
        const category = row[5]?.trim() || '';
        const amount = Math.abs(parseNumber(row[9]));

        if (amount === 0 || !vendor) continue;
        total += amount;

        const isOverseas = category.includes('해외');

        // 사용처명 정리 (중복 합산을 위해)
        let normalizedVendor = normalizeVendorName(vendor);

        if (amount > 1200000) {
            // 120만원 초과 - 사용처별 합산
            largeByVendor[normalizedVendor] = (largeByVendor[normalizedVendor] || 0) + amount;
        } else if (isOverseas) {
            // 해외결제 - 사용처별 합산
            overseas[normalizedVendor] = (overseas[normalizedVendor] || 0) + amount;
        } else {
            // 기타 국내
            domesticOther += amount;
        }
    }

    const largeItems = Object.entries(largeByVendor)
        .map(([vendor, amount]) => ({ vendor, amount }))
        .sort((a, b) => b.amount - a.amount);

    const overseasItems = Object.entries(overseas)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

    return {
        type: 'card',
        largeItems,
        overseasItems,
        domesticOther,
        total,
        summary: `<span style="color: var(--danger)">신용카드 ${formatNumber(total)}원</span>`
    };
}

// 사용처명 정규화 (중복 합산용)
function normalizeVendorName(vendor) {
    const v = vendor.toUpperCase();

    // 광고 플랫폼
    if (v.includes('FACEBK') || v.includes('FB.ME')) return 'Facebook 광고';
    if (v.includes('BYTEPLUS')) return 'BytePlus (TikTok)';
    if (v.includes('REDDIT')) return 'Reddit 광고';
    if (v.includes('EXOCLICK')) return 'ExoClick 광고';

    // AI 서비스
    if (v.includes('ANTHROPIC')) return 'Anthropic (Claude)';
    if (v.includes('OPENAI') || v.includes('CHATGPT')) return 'OpenAI';
    if (v.includes('OPENROUTER')) return 'OpenRouter';
    if (v.includes('CLAUDE.AI')) return 'Claude.ai 구독';
    if (v.includes('XAI')) return 'xAI (Grok)';
    if (v.includes('MIDJOURNEY')) return 'Midjourney';

    // 클라우드/서버
    if (v.includes('GOOGLE') && !v.includes('PLAY')) return 'Google Cloud/서비스';
    if (v.includes('SENTRY')) return 'Sentry';
    if (v.includes('MAILGUN') || v.includes('SINCH')) return 'Mailgun';
    if (v.includes('MIXPANEL')) return 'Mixpanel';
    if (v.includes('BITMOVIN')) return 'Bitmovin (비디오)';
    if (v.includes('EZDRM')) return 'EZDRM (DRM)';

    // 개발 도구
    if (v.includes('GITHUB')) return 'GitHub';
    if (v.includes('FIGMA')) return 'Figma';
    if (v.includes('SLACK')) return 'Slack';
    if (v.includes('CURSOR')) return 'Cursor';
    if (v.includes('SUPABASE')) return 'Supabase';

    // 기타 - 처음 25자만
    return vendor.substring(0, 25).trim();
}

// Calculate totals
function calculateTotals() {
    let sales = 0;
    let expenses = 0;

    // 매출
    if (state.data.sales) {
        sales += state.data.sales.total;
    }
    if (state.data.shinhan) {
        sales += state.data.shinhan.depositTotal;  // 신한 입금 → 매출
    }

    // 매입
    if (state.data.creator) {
        expenses += state.data.creator.total;
    }
    if (state.data.shinhan) {
        expenses += state.data.shinhan.withdrawalTotal;  // 신한 출금 → 매입
    }
    if (state.data.ibk) {
        expenses += state.data.ibk.total;
    }
    if (state.data.hanasg) {
        expenses += state.data.hanasg.total;  // 하나은행 싱가폴 → 해외정산
    }
    if (state.data.tax) {
        expenses += state.data.tax.total;
    }
    if (state.data.card) {
        expenses += state.data.card.total;
    }

    state.totals.sales = sales;
    state.totals.expenses = expenses;
    state.totals.profit = sales - expenses;
    state.totals.margin = sales > 0 ? ((sales - expenses) / sales * 100) : 0;
}

// Update display
function updateDisplay() {
    document.getElementById('totalSales').textContent = formatNumber(state.totals.sales) + '원';
    document.getElementById('totalExpenses').textContent = formatNumber(state.totals.expenses) + '원';
    document.getElementById('totalProfit').textContent = formatNumber(state.totals.profit) + '원';
    document.getElementById('profitMargin').textContent = state.totals.margin.toFixed(1) + '%';

    const profitCard = document.querySelector('.summary-card.profit');
    if (state.totals.profit < 0) {
        profitCard.querySelector('.card-value').style.color = 'var(--danger)';
    } else {
        profitCard.querySelector('.card-value').style.color = 'var(--primary)';
    }

    updateSalesDetails();
    updateExpenseDetails();
}

// Update sales details
function updateSalesDetails() {
    const container = document.getElementById('salesDetails');

    const hasData = state.data.sales || (state.data.shinhan && state.data.shinhan.depositTotal > 0);

    if (!hasData) {
        container.innerHTML = '<div class="empty-state">파일을 업로드하면 상세 내역이 표시됩니다</div>';
        return;
    }

    let html = '';

    // PG사별 매출
    if (state.data.sales) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">PG사별 매출</div>';

        for (const item of state.data.sales.items) {
            html += `
                <div class="detail-item">
                    <span class="detail-label">${item.name}</span>
                    <span class="detail-value">${formatNumber(item.amount)}원</span>
                </div>
            `;
        }
        html += '</div>';
    }

    // 신한은행 입금 (세금 환급 등)
    if (state.data.shinhan && state.data.shinhan.depositTotal > 0) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">세금/보험 환급</div>';

        for (const item of state.data.shinhan.deposits.items) {
            html += `
                <div class="detail-item sub-item">
                    <span class="detail-label">${item.name}</span>
                    <span class="detail-value">${formatNumber(item.amount)}원</span>
                </div>
            `;
        }
        html += '</div>';
    }

    html += `
        <div class="detail-item total">
            <span class="detail-label">매출 합계</span>
            <span class="detail-value" style="color: var(--success)">${formatNumber(state.totals.sales)}원</span>
        </div>
    `;

    container.innerHTML = html;
}

// Update expense details
function updateExpenseDetails() {
    const container = document.getElementById('expenseDetails');

    const hasData = state.data.creator ||
                   (state.data.shinhan && state.data.shinhan.withdrawalTotal > 0) ||
                   state.data.ibk || state.data.hanasg ||
                   state.data.tax || state.data.card;

    if (!hasData) {
        container.innerHTML = '<div class="empty-state">파일을 업로드하면 상세 내역이 표시됩니다</div>';
        return;
    }

    let html = '';

    // 크리에이터 정산
    if (state.data.creator) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">크리에이터 정산</div>';
        for (const item of state.data.creator.items) {
            html += `
                <div class="detail-item sub-item">
                    <span class="detail-label">${item.name}</span>
                    <span class="detail-value">${formatNumber(item.amount)}원</span>
                </div>
            `;
        }
        html += '</div>';
    }

    // 인건비 (급여)
    if (state.data.ibk && state.data.ibk.salary > 0) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">인건비</div>';
        html += `
            <div class="detail-item sub-item">
                <span class="detail-label">급여</span>
                <span class="detail-value">${formatNumber(state.data.ibk.salary)}원</span>
            </div>
        `;
        html += '</div>';
    }

    // 세금/보험 (신한은행 출금)
    if (state.data.shinhan && state.data.shinhan.withdrawalTotal > 0) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">세금/보험</div>';

        for (const item of state.data.shinhan.withdrawals.items) {
            html += `
                <div class="detail-item sub-item">
                    <span class="detail-label">${item.name}</span>
                    <span class="detail-value">${formatNumber(item.amount)}원</span>
                </div>
            `;
        }
        html += '</div>';
    }

    // 해외 크리에이터 정산
    if (state.data.hanasg && state.data.hanasg.total > 0) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">해외 크리에이터 정산</div>';
        html += `
            <div class="detail-item sub-item">
                <span class="detail-label">하나은행 (싱가폴)</span>
                <span class="detail-value">${formatNumber(state.data.hanasg.total)}원</span>
            </div>
        `;
        html += '</div>';
    }

    // 매입 세금계산서 - 전체 표시
    if (state.data.tax) {
        const allItems = state.data.tax.allItems || state.data.tax.items;
        html += '<div class="detail-group">';
        html += `<div class="detail-group-title">매입 세금계산서 (${allItems.length}개 업체)</div>`;
        for (const item of allItems) {
            html += `
                <div class="detail-item sub-item">
                    <span class="detail-label">${item.name.substring(0, 20)}</span>
                    <span class="detail-value">${formatNumber(item.amount)}원</span>
                </div>
            `;
        }
        html += '</div>';
    }

    // 신용카드 - 상세 표시
    if (state.data.card) {
        html += '<div class="detail-group">';
        html += '<div class="detail-group-title">신용카드</div>';

        // 120만원 초과 항목들 (사용처별)
        if (state.data.card.largeItems.length > 0) {
            // 사용처별로 합산
            const largeByVendor = {};
            for (const item of state.data.card.largeItems) {
                const vendor = item.vendor.trim();
                largeByVendor[vendor] = (largeByVendor[vendor] || 0) + item.amount;
            }

            html += '<div style="margin-left: 8px; margin-bottom: 8px; color: var(--text-muted); font-size: 11px;">▸ 120만원 초과</div>';
            for (const [vendor, amount] of Object.entries(largeByVendor).sort((a, b) => b[1] - a[1])) {
                html += `
                    <div class="detail-item sub-item" style="padding-left: 20px;">
                        <span class="detail-label">${vendor.substring(0, 25)}</span>
                        <span class="detail-value">${formatNumber(amount)}원</span>
                    </div>
                `;
            }
        }

        // 해외결제 (사용처별, 중복 합산됨)
        if (state.data.card.overseasItems.length > 0) {
            html += '<div style="margin-left: 8px; margin-top: 12px; margin-bottom: 8px; color: var(--text-muted); font-size: 11px;">▸ 해외결제</div>';
            for (const item of state.data.card.overseasItems) {
                html += `
                    <div class="detail-item sub-item" style="padding-left: 20px;">
                        <span class="detail-label">${item.name.substring(0, 25)}</span>
                        <span class="detail-value">${formatNumber(item.amount)}원</span>
                    </div>
                `;
            }
        }

        // 기타 국내
        if (state.data.card.domesticOther > 0) {
            html += `
                <div class="detail-item sub-item" style="margin-top: 8px;">
                    <span class="detail-label">기타</span>
                    <span class="detail-value">${formatNumber(state.data.card.domesticOther)}원</span>
                </div>
            `;
        }

        html += '</div>';
    }

    html += `
        <div class="detail-item total">
            <span class="detail-label">매입 합계</span>
            <span class="detail-value" style="color: var(--danger)">${formatNumber(state.totals.expenses)}원</span>
        </div>
    `;

    container.innerHTML = html;
}

// Update raw data grid
function updateRawDataGrid() {
    const container = document.getElementById('rawDataGrid');
    const types = ['sales', 'creator', 'shinhan', 'ibk', 'hanasg', 'tax', 'card'];

    let html = '';

    for (const type of types) {
        const rawData = state.rawData[type];
        const hasData = !!rawData;

        html += `
            <div class="raw-data-card">
                <div class="raw-data-header">
                    <span class="raw-data-title">${FILE_LABELS[type]}</span>
                    <span class="raw-data-badge ${hasData ? '' : 'empty'}">${hasData ? '업로드됨' : '대기중'}</span>
                </div>
                <div class="raw-data-content">
        `;

        if (hasData) {
            // Parse and display as table
            const rows = parseCSV(rawData.content);
            if (rows.length > 0) {
                html += `<div style="margin-bottom: 8px; color: var(--text-muted); font-size: 10px;">📄 ${rawData.filename} (${rawData.uploadTime})</div>`;
                html += '<table class="raw-data-table">';

                // Header row
                if (rows.length > 0) {
                    html += '<tr>';
                    for (let i = 0; i < Math.min(rows[0].length, 6); i++) {
                        html += `<th>${rows[0][i]?.substring(0, 10) || '-'}</th>`;
                    }
                    html += '</tr>';
                }

                // Data rows (limit to 20)
                for (let r = 1; r < Math.min(rows.length, 21); r++) {
                    html += '<tr>';
                    for (let i = 0; i < Math.min(rows[r].length, 6); i++) {
                        html += `<td>${rows[r][i]?.substring(0, 12) || '-'}</td>`;
                    }
                    html += '</tr>';
                }

                if (rows.length > 21) {
                    html += `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">... 외 ${rows.length - 21}개 행</td></tr>`;
                }

                html += '</table>';
            }
        } else {
            html += '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">파일을 업로드해주세요</div>';
        }

        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// Save to localStorage (월별 키)
function saveToStorage() {
    const key = getMonthKey();
    const saveData = {
        data: state.data,
        rawData: state.rawData
    };
    localStorage.setItem(key, JSON.stringify(saveData));
    // 마지막 선택 월 기억
    localStorage.setItem('plaxFinance_lastMonth', JSON.stringify(state.currentMonth));
}

// Load from localStorage (월별 키)
function loadFromStorage() {
    // 마지막 월 복원 (초기 로드 시)
    const lastMonth = localStorage.getItem('plaxFinance_lastMonth');
    if (lastMonth && !state._initialized) {
        try {
            state.currentMonth = JSON.parse(lastMonth);
        } catch (e) {}
    }
    state._initialized = true;

    const key = getMonthKey();
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.data = parsed.data || { sales: null, creator: null, shinhan: null, ibk: null, hanasg: null, tax: null, card: null };
            state.rawData = parsed.rawData || {};
        } catch (e) {
            console.error('Failed to load saved data:', e);
            state.data = { sales: null, creator: null, shinhan: null, ibk: null, hanasg: null, tax: null, card: null };
            state.rawData = {};
        }
    } else {
        // 해당 월 데이터 없음 → 빈 상태
        state.data = { sales: null, creator: null, shinhan: null, ibk: null, hanasg: null, tax: null, card: null };
        state.rawData = {};
    }

    // 기존 단일 키 데이터 마이그레이션
    const legacy = localStorage.getItem('plaxFinanceData');
    if (legacy) {
        try {
            const parsed = JSON.parse(legacy);
            if (parsed.currentMonth) {
                const legacyKey = `plaxFinance_${parsed.currentMonth.year}_${String(parsed.currentMonth.month).padStart(2, '0')}`;
                if (!localStorage.getItem(legacyKey)) {
                    localStorage.setItem(legacyKey, JSON.stringify({
                        data: parsed.data,
                        rawData: parsed.rawData
                    }));
                }
                localStorage.removeItem('plaxFinanceData');
                // 마이그레이션한 데이터가 현재 월이면 다시 로드
                if (parsed.currentMonth.year === state.currentMonth.year && parsed.currentMonth.month === state.currentMonth.month) {
                    state.data = parsed.data || state.data;
                    state.rawData = parsed.rawData || state.rawData;
                }
            }
        } catch (e) {}
    }
}

// Restore upload UI from saved state
function restoreUploadUI() {
    const types = ['sales', 'creator', 'shinhan', 'ibk', 'hanasg', 'tax', 'card'];

    for (const type of types) {
        if (state.rawData[type]) {
            const zone = document.querySelector(`.upload-zone[data-type="${type}"]`);
            const statusEl = document.getElementById(`status-${type}`);
            const placeholder = zone.querySelector('.upload-placeholder');

            zone.classList.add('uploaded');

            placeholder.innerHTML = `
                <span class="upload-plus" style="background: var(--success); border-color: var(--success); color: white;">✓</span>
                <span class="upload-text">${state.rawData[type].filename}</span>
                <button class="upload-reset-btn" onclick="clearUpload('${type}')">✕</button>
            `;

            if (state.data[type] && state.data[type].summary) {
                statusEl.innerHTML = state.data[type].summary;
                statusEl.className = 'upload-status success';
            }
        }
    }

    updateMonthDisplay();
}

// Clear upload
function clearUpload(type) {
    // Reset state
    state.data[type] = null;
    delete state.rawData[type];

    // Reset UI
    const zone = document.querySelector(`.upload-zone[data-type="${type}"]`);
    const statusEl = document.getElementById(`status-${type}`);
    const input = zone.querySelector('.file-input');
    const placeholder = zone.querySelector('.upload-placeholder');

    zone.classList.remove('uploaded');
    input.value = '';
    statusEl.textContent = '';
    statusEl.className = 'upload-status';

    // Restore original placeholder
    const fileHints = {
        sales: 'sales.csv',
        creator: 'creator-settlement.csv',
        shinhan: 'bank-shinhan.csv',
        ibk: 'bank-ibk.csv',
        hanasg: 'bank-hana-sg.pdf',
        tax: 'tax-invoices.csv',
        card: 'card-expense.csv'
    };

    placeholder.innerHTML = `
        <span class="upload-plus">+</span>
        <span class="upload-text">${fileHints[type] || '파일 선택'}</span>
    `;

    // Recalculate totals
    calculateTotals();
    updateDisplay();
    updateRawDataGrid();
    saveToStorage();  // 저장
}

// Utility functions
function parseNumber(str) {
    if (!str) return 0;
    const cleaned = str.toString().replace(/[,\s원]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

function formatNumber(num) {
    return Math.round(num).toLocaleString('ko-KR');
}

// Manual save
function manualSave() {
    saveToStorage();
    const btn = document.querySelector('.save-btn');
    const originalText = btn.textContent;
    btn.textContent = '✓ 저장됨';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
    }, 1500);
}

// Clear all data
function clearAllData() {
    if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;

    localStorage.removeItem(getMonthKey());
    location.reload();
}

// Share to Slack
async function shareToSlack() {
    const { year, month } = state.currentMonth;
    const monthStr = `${year}년 ${String(month).padStart(2, '0')}월`;

    // Build message blocks
    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `💎 ${monthStr} 결산 완료`, emoji: true }
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*💰 매출*\n${formatNumber(state.totals.sales)}원` },
                { type: "mrkdwn", text: `*💸 매입*\n${formatNumber(state.totals.expenses)}원` },
                { type: "mrkdwn", text: `*📈 영업이익*\n${formatNumber(state.totals.profit)}원` },
                { type: "mrkdwn", text: `*% 이익률*\n${state.totals.margin.toFixed(1)}%` }
            ]
        },
        { type: "divider" }
    ];

    // 매출 상세
    let salesText = '';
    if (state.data.sales) {
        salesText += '*PG사별 매출*\n';
        state.data.sales.items.forEach(item => {
            salesText += `• ${item.name}: ${formatNumber(item.amount)}원\n`;
        });
    }
    if (state.data.shinhan?.depositTotal > 0) {
        salesText += '\n*세금/보험 환급*\n';
        state.data.shinhan.deposits.items.forEach(item => {
            salesText += `• ${item.name}: ${formatNumber(item.amount)}원\n`;
        });
    }
    if (salesText) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: salesText.trim() } });
    }

    // 매입 상세
    let expenseText = '';
    if (state.data.creator) {
        expenseText += '*크리에이터 정산*\n';
        state.data.creator.items.forEach(item => {
            expenseText += `• ${item.name}: ${formatNumber(item.amount)}원\n`;
        });
    }
    if (state.data.ibk?.salary > 0) {
        expenseText += `\n*인건비*\n• 급여: ${formatNumber(state.data.ibk.salary)}원\n`;
    }
    if (state.data.shinhan?.withdrawalTotal > 0) {
        expenseText += '\n*세금/보험*\n';
        state.data.shinhan.withdrawals.items.forEach(item => {
            expenseText += `• ${item.name}: ${formatNumber(item.amount)}원\n`;
        });
    }
    if (state.data.hanasg?.total > 0) {
        expenseText += `\n*해외 크리에이터 정산*\n• 하나은행(SG): ${formatNumber(state.data.hanasg.total)}원\n`;
    }
    if (state.data.tax) {
        expenseText += '\n*매입 세금계산서*\n';
        state.data.tax.items.slice(0, 5).forEach(item => {
            expenseText += `• ${item.name.substring(0, 15)}: ${formatNumber(item.amount)}원\n`;
        });
        if (state.data.tax.items.length > 5) {
            expenseText += `  _외 ${state.data.tax.items.length - 5}개 업체_\n`;
        }
    }
    if (state.data.card) {
        expenseText += `\n*신용카드*\n• 총액: ${formatNumber(state.data.card.total)}원\n`;
    }
    if (expenseText) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: expenseText.trim() } });
    }

    // Context footer
    blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `📊 PLAX Finance Dashboard • ${new Date().toLocaleString('ko-KR')}` }]
    });

    // Send to Slack
    const btn = document.querySelector('.share-btn');
    btn.textContent = '전송 중...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/slack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks })
        });

        if (response.ok) {
            btn.textContent = '✓ 전송됨';
            btn.style.background = 'var(--success)';
        } else {
            throw new Error('전송 실패');
        }
    } catch (error) {
        console.error('Slack error:', error);
        btn.textContent = '❌ 실패';
        btn.style.background = 'var(--danger)';
    }

    setTimeout(() => {
        btn.textContent = '📢 슬랙 공유';
        btn.style.background = '';
        btn.disabled = false;
    }, 2000);
}
