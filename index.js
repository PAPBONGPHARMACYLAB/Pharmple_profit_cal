// index.js

window.freeCalculationsCount = 0;
window.freeCalculationsPerItem = {}; // { [itemId]: 남은 무료 횟수 }
window.currentRecalcItemId = null;  // 현재 다시 계산 중인 항목 ID

// ── 탭 전환 ────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('pane-calc').style.display = tab === 'calc' ? 'flex' : 'none';
  document.getElementById('pane-saved').style.display = tab === 'saved' ? 'flex' : 'none';
  const paneMypage = document.getElementById('pane-mypage');
  if (paneMypage) paneMypage.style.display = 'none';

  document.getElementById('tab-calc').classList.toggle('active', tab === 'calc');
  document.getElementById('tab-saved').classList.toggle('active', tab === 'saved');

  if (tab === 'saved') {
    window.saveAPI?.renderSavedList();
  }
}

// ── Elements ──────────────────────────────────────────
const extractBtn = document.getElementById('extract-btn');
const calculateBtn = document.getElementById('calculate-btn');
const siteSelect = document.getElementById('site-select');
const statusMsg = document.getElementById('extract-status');
const resultsPane = document.getElementById('results-pane');

// ── 입력 필드 IDs ─────────────────────────────────────
const ids = [
  'v1_deposit', 'v2_rent', 'v3_maintenance', 'v4_premium', 'v5_consulting',
  'v6_size', 'v7_dispensing', 'v8_noncov_disp', 'v9_noncov_margin',
  'v10_daily_otc', 'v11_monthly_otc', 'v12_otc_margin_rate', 'v12_1_monthly_otc_margin',
  'v13_days', 'v14_drug_cost', 'v15_pharmacist_salary', 'v16_staff_salary',
  'v17_loan', 'v18_interest_rate', 'v19_etc_expense', 'v20_weekly_hours',
  'v21_supplies', 'v22_meal'
];

const inputs = {};
ids.forEach(id => {
  inputs[id] = document.getElementById(id);
});

// ── 포커스 시 전체 선택 ───────────────────────────────
const zeroDefaultIds = ['v18_interest_rate', 'v13_days', 'v12_otc_margin_rate', 'v20_weekly_hours'];
zeroDefaultIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('focus', () => el.select());
});

// ── 통화 포맷 ─────────────────────────────────────────
const currencyIds = [
  'v1_deposit', 'v2_rent', 'v3_maintenance', 'v4_premium', 'v5_consulting',
  'v7_dispensing', 'v8_noncov_disp', 'v9_noncov_margin', 'v10_daily_otc',
  'v11_monthly_otc', 'v14_drug_cost', 'v15_pharmacist_salary', 'v16_staff_salary',
  'v17_loan', 'v19_etc_expense', 'v12_1_monthly_otc_margin',
  'v21_supplies', 'v22_meal'
];

function formatInputCurrency(val) {
  if (!val && val !== 0) return '';
  let num = parseFloat(String(val).replace(/[^0-9\.]/g, '')) || 0;
  return Math.round(num).toLocaleString('ko-KR') + '원';
}

function getRawNum(id) {
  let val = inputs[id].value;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[^0-9\.]/g, '')) || 0;
}

function numberToKoreanText(num) {
  if (num === 0) return '0원';
  if (!num) return '';

  const digits = ['','일','이','삼','사','오','육','칠','팔','구'];
  const tens = ['','십','백','천'];
  const units = ['','만','억','조','경'];

  let numStr = String(Math.floor(num));
  let result = '';

  for (let i = 0; i < numStr.length; i++) {
    const digit = parseInt(numStr[i], 10);
    const pos = numStr.length - i - 1; 
    
    if (digit !== 0) {
      let digitText = digits[digit];
      if (digit === 1 && pos % 4 !== 0) {
         digitText = ''; 
      }
      result += digitText + tens[pos % 4];
    }
    
    if (pos % 4 === 0) {
      const chunkStartIndex = Math.max(0, i - 3);
      const chunk = parseInt(numStr.slice(chunkStartIndex, i + 1), 10);
      if (chunk !== 0 && units[pos / 4]) {
        result += units[pos / 4];
      }
    }
  }

  if (result.startsWith('일만')) result = result.replace(/^일만/, '만');
  
  return result ? result + '원' : '0원';
}

function updateKorText(id) {
  const el = inputs[id];
  if (!el) return;
  const korDiv = document.getElementById(id + '_kor');
  if (!korDiv) return;
  const raw = getRawNum(id);
  if (raw > 0) {
    korDiv.textContent = numberToKoreanText(raw);
  } else {
    korDiv.textContent = '';
  }
}

function setFormatted(id, num) {
  if (num === null || num === undefined) return;
  inputs[id].value = formatInputCurrency(num);
  updateKorText(id);
}

currencyIds.forEach(id => {
  const el = inputs[id];
  if (!el) return;
  el.addEventListener('focus', () => {
    if (el.readOnly) return;
    let raw = getRawNum(id);
    el.value = raw > 0 ? raw : '';
  });
  el.addEventListener('blur', () => {
    if (el.readOnly) return;
    let raw = getRawNum(id);
    if (raw > 0 || el.value !== '') {
      el.value = formatInputCurrency(raw);
    } else {
      el.value = '';
    }
  });
  if (id === 'v10_daily_otc') el.addEventListener('input', updateDerivedOTC);
});

// ── 파생 필드 업데이트 ────────────────────────────────
function updateDerivedOTC() {
  const v10 = getRawNum('v10_daily_otc');
  const v13 = getRawNum('v13_days');
  const v12 = getRawNum('v12_otc_margin_rate');
  setFormatted('v11_monthly_otc', v10 * v13);
  setFormatted('v12_1_monthly_otc_margin', v10 * v13 * (v12 / 100));
}

function updateSupplies() {
  const dispensing = getRawNum('v7_dispensing');
  setFormatted('v21_supplies', dispensing * 0.015);
}

inputs['v13_days'].addEventListener('input', updateDerivedOTC);
inputs['v12_otc_margin_rate'].addEventListener('input', updateDerivedOTC);
inputs['v7_dispensing'].addEventListener('blur', updateSupplies);

// ── 결과 포맷 ─────────────────────────────────────────
function formatOutputCurrency(num) {
  return Math.round(num).toLocaleString('ko-KR') + '원';
}

// ── 계산 실행 (토큰 소비 or 무료) ─────────────────────────────
calculateBtn.addEventListener('click', async () => {
  let skipToken = false;
  if (window.freeCalculationsCount > 0) {
    window.freeCalculationsCount--;
    skipToken = true;

    // 항목별 횟수도 함께 차감
    if (window.currentRecalcItemId) {
      window.freeCalculationsPerItem[window.currentRecalcItemId] = window.freeCalculationsCount;
    }

    // 무료 버튼 카운트 업데이트 or 숨기기
    const recalcFreeBtn = document.getElementById('recalc-free-btn');
    const recalcFreeCount = document.getElementById('recalc-free-count');
    if (recalcFreeCount) recalcFreeCount.textContent = window.freeCalculationsCount;
    if (recalcFreeBtn && window.freeCalculationsCount <= 0) {
      recalcFreeBtn.style.display = 'none';
    }
  }

  if (!skipToken) {
    // 토큰 확인
    const available = await window.tokenAPI.getAvailableTokens();
    if (available <= 0) {
      window.tokenAPI.showTokenModal();
      return;
    }

    // 토큰 차감
    try {
      await window.tokenAPI.consumeToken();
    } catch (e) {
      window.tokenAPI.showTokenModal();
      return;
    }
  }

  // ── 계산 로직 ──
  const v = {};
  ids.forEach(id => { v[id] = getRawNum(id); });

  const monthlyOtcMargin = v.v10_daily_otc * v.v13_days * (v.v12_otc_margin_rate / 100);
  const income = v.v7_dispensing + v.v8_noncov_disp + v.v9_noncov_margin + monthlyOtcMargin + (v.v14_drug_cost * 0.035);
  const interest = v.v17_loan * (v.v18_interest_rate / 100) / 12;
  const supplies = v.v7_dispensing * 0.015;
  const expense = v.v2_rent + v.v3_maintenance + v.v15_pharmacist_salary + v.v16_staff_salary + interest + v.v19_etc_expense + supplies + v.v22_meal;

  const pretax = income - expense;
  const posttax = pretax * 0.9;
  let hourly = v.v20_weekly_hours > 0 ? pretax / v.v20_weekly_hours / 4 : 0;
  let per = pretax > 0 ? (v.v4_premium + v.v5_consulting) / pretax / 12 : 0;
  const addInventory = v.v14_drug_cost * 1.3;

  document.getElementById('res_pretax').textContent = formatOutputCurrency(pretax);
  document.getElementById('res_posttax').textContent = formatOutputCurrency(posttax);
  document.getElementById('res_hourly').textContent = formatOutputCurrency(hourly);

  const perEl = document.getElementById('res_per');
  if (per === 0) {
    perEl.textContent = '0';
  } else if (per <= 2.30) {
    perEl.innerHTML = `<span style="color: #10B981; font-weight: bold;">${per.toFixed(2)} (안정)</span>`;
  } else if (per <= 3.00) {
    perEl.innerHTML = `<span style="color: #CA8A04; font-weight: bold;">${per.toFixed(2)} (적정)</span>`;
  } else {
    perEl.innerHTML = `<span style="color: #EF4444; font-weight: bold;">${per.toFixed(2)} (소신)</span>`;
  }

  document.getElementById('res_add_inventory').textContent = formatOutputCurrency(addInventory);

  resultsPane.style.display = 'block';
  setTimeout(() => {
    resultsPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
});

// ── 다시 계산하기 무료 버튼 → calculateBtn 트리거 ───────────────────
const recalcFreeBtn = document.getElementById('recalc-free-btn');
if (recalcFreeBtn) {
  recalcFreeBtn.addEventListener('click', () => {
    calculateBtn.click();
  });
}

// ── 데이터 추출 ────────────────────────────────────────
extractBtn.addEventListener('click', async () => {
  statusMsg.textContent = '데이터를 가져오는 중...';
  statusMsg.style.color = '#4F46E5';
  const selectedSite = siteSelect.value;

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['content.js'] },
      () => {
        chrome.tabs.sendMessage(tab.id, { command: "extractData", site: selectedSite }, (response) => {
          if (response && response.data) {
            const d = response.data;
            setFormatted('v1_deposit', d.v1 || 0);
            setFormatted('v2_rent', d.v2 || 0);
            setFormatted('v3_maintenance', d.v3 || 0);
            setFormatted('v4_premium', d.v4 || 0);
            setFormatted('v5_consulting', d.v5 || 0);
            inputs['v6_size'].value = d.v6 || 0;
            setFormatted('v7_dispensing', d.v7 || 0);
            setFormatted('v8_noncov_disp', d.v8 || 0);
            setFormatted('v9_noncov_margin', d.v9 || 0);
            setFormatted('v10_daily_otc', d.v10 || 0);
            setFormatted('v11_monthly_otc', d.v11 || 0);
            inputs['v12_otc_margin_rate'].value = d.v12 || 0;
            inputs['v13_days'].value = d.v13 ? (d.v13 == 365 ? 30 : d.v13) : 0;
            setFormatted('v14_drug_cost', d.v14 || 0);
            setFormatted('v15_pharmacist_salary', 0);
            setFormatted('v16_staff_salary', 0);
            setFormatted('v17_loan', 0);
            inputs['v18_interest_rate'].value = 0;
            setFormatted('v19_etc_expense', 0);
            inputs['v20_weekly_hours'].value = 0;
            setFormatted('v22_meal', 0);

            // 신규: 약국명 및 연락처 정보 저장
            window.extractedContactInfo = {
              pharmacyName: d.pharmacy_name || '',
              companyName: d.company_name || '',
              representative: d.representative || '',
              mainPhone: d.main_phone || '',
              mobilePhone: d.mobile_phone || ''
            };

            updateDerivedOTC();
            updateSupplies();
            statusMsg.textContent = '데이터 추출 완료!';
            statusMsg.style.color = '#10B981';
          } else {
            statusMsg.textContent = '정보를 찾을 수 없습니다. (수동 입력 필요)';
            statusMsg.style.color = '#EAB308';
          }
        });
      }
    );
  } catch(e) {
    statusMsg.textContent = '문제가 발생했습니다. 해당 사이트인지 확인하세요.';
    statusMsg.style.color = '#EF4444';
  }
});

// ── 저장 확인 버튼 이벤트 ─────────────────────────────
document.getElementById('save-confirm-btn').addEventListener('click', async () => {
  const name = document.getElementById('save-pharmacy-name').value.trim();
  const note = document.getElementById('save-feature-note').value.trim();
  const companyName = document.getElementById('save-company-name').value.trim();
  const representative = document.getElementById('save-representative').value.trim();
  const mainPhone = document.getElementById('save-main-phone').value.trim();
  const mobilePhone = document.getElementById('save-mobile-phone').value.trim();
  const consultingNote = document.getElementById('save-consulting-note').value.trim();

  if (!name) {
    alert('약국명을 입력해주세요.');
    return;
  }

  const btn = document.getElementById('save-confirm-btn');
  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    await window.saveAPI.saveCalculation(name, note, companyName, representative, mainPhone, mobilePhone, consultingNote);
    document.getElementById('save-pharmacy-name').value = '';
    document.getElementById('save-feature-note').value = '';
    document.getElementById('save-company-name').value = '';
    document.getElementById('save-representative').value = '';
    document.getElementById('save-main-phone').value = '';
    document.getElementById('save-mobile-phone').value = '';
    document.getElementById('save-consulting-note').value = '';
    window.saveAPI.closeSaveModal();
    alert('✅ 저장되었습니다!');
  } catch (e) {
    alert('저장 실패: ' + e.message);
  } finally {
    btn.textContent = '저장하기';
    btn.disabled = false;
  }
});

// ── Polar 상품 구매 버튼 이벤트 ────────────────────────
document.querySelectorAll('.polar-buy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const productKey = btn.dataset.product;
    const product = window.ENV.POLAR_PRODUCTS[productKey];
    if (product) {
      window.tokenAPI.openPolarCheckout(product.id);
    }
  });
});

// ── 스크롤 상단 버튼 ─────────────────────────────────
const scrollTopBtn = document.getElementById('scroll-to-top');
window.addEventListener('scroll', () => {
  scrollTopBtn.classList.toggle('show', window.scrollY > 200);
});
scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── 이벤트 리스너 바인딩 (CSP 우회용) ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 한글 금액 표기용 div 생성 및 바인딩
  currencyIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
      const korDiv = document.createElement('div');
      korDiv.id = id + '_kor';
      korDiv.className = 'kor-text';
      korDiv.style.fontSize = '12px';
      korDiv.style.color = 'var(--primary)';
      korDiv.style.textAlign = 'right';
      korDiv.style.marginTop = '4px';
      korDiv.style.fontWeight = '600';
      
      // input과 같은 레벨로 삽입
      el.parentNode.appendChild(korDiv);
      
      // 입력이나 포커스 이동 시 업데이트
      el.addEventListener('input', () => updateKorText(id));
      el.addEventListener('blur', () => updateKorText(id));
      
      // 초기 업데이트
      updateKorText(id);
    }
  });

  // 탭 네비게이션
  const tabCalc = document.getElementById('tab-calc');
  const tabSaved = document.getElementById('tab-saved');
  
  if (tabCalc) tabCalc.addEventListener('click', () => switchTab('calc'));
  if (tabSaved) tabSaved.addEventListener('click', () => switchTab('saved'));

  // 헤더 및 토큰 버튼
  const tokenDisplay = document.getElementById('token-display');
  const chargeBtn = document.getElementById('charge-btn');
  if (tokenDisplay) tokenDisplay.addEventListener('click', () => window.tokenAPI?.showTokenModal());
  if (chargeBtn) chargeBtn.addEventListener('click', () => window.tokenAPI?.showTokenModal());

  // 저장 버튼 및 모달
  const saveResultBtn = document.getElementById('save-result-btn');
  const saveCancelBtn = document.getElementById('save-cancel-btn');
  const refreshSavedBtn = document.getElementById('refresh-saved-btn');
  
  if (saveResultBtn) saveResultBtn.addEventListener('click', () => window.saveAPI?.openSaveModal());
  if (saveCancelBtn) saveCancelBtn.addEventListener('click', () => window.saveAPI?.closeSaveModal());
  if (refreshSavedBtn) refreshSavedBtn.addEventListener('click', () => window.saveAPI?.renderSavedList());

  // 새로 계산하기 버튼
  const newCalcBtn = document.getElementById('new-calc-btn');
  if (newCalcBtn) {
    newCalcBtn.addEventListener('click', () => {
      // 입력필드 전체 초기화
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.readOnly) return; // readonly 필드는 다른 곳에서 자동 업데이트됨
        el.value = '';
        el.dispatchEvent(new Event('input'));
      });
      // 라디오 기본값 복원 (existing)
      const radios = document.getElementsByName('pharm_type');
      radios.forEach(r => { r.checked = r.value === 'existing'; });

      // 기본값 0으로 채워야 하는 필드
      const zeroFields = ['v18_interest_rate', 'v13_days', 'v12_otc_margin_rate', 'v20_weekly_hours'];
      zeroFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = '0'; el.dispatchEvent(new Event('input')); }
      });

      // 전역변수 초기화
      window.freeCalculationsCount = 0;
      window.currentRecalcItemId = null;
      window.extractedContactInfo = null;

      // 다시 계산하기 버튼 숨기기
      const recalcFreeBtn = document.getElementById('recalc-free-btn');
      if (recalcFreeBtn) recalcFreeBtn.style.display = 'none';

      // 데이터 가져오기 영역 다시 표시
      const actionCard = document.querySelector('.action-card');
      if (actionCard) actionCard.style.display = '';

      // 가져오기 상태 메시지 초기화
      const statusMsgEl = document.getElementById('extract-status');
      if (statusMsgEl) statusMsgEl.textContent = '';

      // 계산 결과 숨기기
      const resultsPaneEl = document.getElementById('results-pane');
      if (resultsPaneEl) resultsPaneEl.style.display = 'none';

      // 맨 위로 스크롤
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 모달 닫기
  const tokenCloseBtn = document.getElementById('token-close-btn');
  if (tokenCloseBtn) tokenCloseBtn.addEventListener('click', () => window.tokenAPI?.closeTokenModal());
  
  // 자동 데이터 추출
  extractBtn.click();
});

