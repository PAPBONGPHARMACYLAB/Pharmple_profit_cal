// Elements
const extractBtn = document.getElementById('extract-btn');
const calculateBtn = document.getElementById('calculate-btn');
const siteSelect = document.getElementById('site-select');
const statusMsg = document.getElementById('extract-status');
const resultsPane = document.getElementById('results-pane');

// Inputs
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

const currencyIds = [
  'v1_deposit', 'v2_rent', 'v3_maintenance', 'v4_premium', 'v5_consulting',
  'v7_dispensing', 'v8_noncov_disp', 'v9_noncov_margin', 'v10_daily_otc',
  'v11_monthly_otc', 'v14_drug_cost', 'v15_pharmacist_salary', 'v16_staff_salary',
  'v17_loan', 'v19_etc_expense', 'v12_1_monthly_otc_margin',
  'v21_supplies', 'v22_meal'
];

// formatting function for UI
function formatInputCurrency(val) {
  if (!val && val !== 0) return '';
  // remove non-digits
  let num = parseFloat(String(val).replace(/[^0-9\.]/g, '')) || 0;
  return Math.round(num).toLocaleString('ko-KR') + '원';
}

function getRawNum(id) {
  let val = inputs[id].value;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[^0-9\.]/g, '')) || 0;
}

function setFormatted(id, num) {
  if (num === null || num === undefined) return;
  inputs[id].value = formatInputCurrency(num);
}

// Add event listeners for focus/blur on currency inputs
currencyIds.forEach(id => {
  const el = inputs[id];
  if (!el) return;
  
  el.addEventListener('focus', () => {
    if (el.readOnly) return;
    // On focus, show raw number to edit easily
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
  
  // also allow calculating dynamically on typing if needed
  if (id === 'v10_daily_otc') el.addEventListener('input', updateDerivedOTC);
});

// Update derived fields
function updateDerivedOTC() {
  const v10 = getRawNum('v10_daily_otc');
  const v13 = getRawNum('v13_days');
  const v12 = getRawNum('v12_otc_margin_rate'); // %
  
  const monthlyOtc = v10 * v13;
  const monthlyOtcMargin = v10 * v13 * (v12 / 100);
  
  setFormatted('v11_monthly_otc', monthlyOtc);
  setFormatted('v12_1_monthly_otc_margin', monthlyOtcMargin);
}

// 소모품비 = 조제료 * 1.5% 자동 계산
function updateSupplies() {
  const dispensing = getRawNum('v7_dispensing');
  const supplies = dispensing * 0.015;
  setFormatted('v21_supplies', supplies);
}

inputs['v13_days'].addEventListener('input', updateDerivedOTC);
inputs['v12_otc_margin_rate'].addEventListener('input', updateDerivedOTC);

// v7 조제료 변경 시 소모품비 반영
inputs['v7_dispensing'].addEventListener('blur', updateSupplies);

// Format output text
function formatOutputCurrency(num) {
  return Math.round(num).toLocaleString('ko-KR') + '원';
}

// Calculate logic
calculateBtn.addEventListener('click', () => {
  const v = {};
  ids.forEach(id => {
    v[id] = getRawNum(id);
  });

  // Calculate 12-1 
  const monthlyOtcMargin = v.v10_daily_otc * v.v13_days * (v.v12_otc_margin_rate / 100);

  // 1. 수입(7+8+9+12-1+14*3.5%) - 비용(2+3+15+16+17*18/12+19+21+22) = 세전 월 순수익
  const income = v.v7_dispensing + v.v8_noncov_disp + v.v9_noncov_margin + monthlyOtcMargin + (v.v14_drug_cost * 0.035);
  // 이자 비용: 대출금액 * 이자율(%) / 100 / 12
  const interest = v.v17_loan * (v.v18_interest_rate / 100) / 12;
  // 소모품비 = 조제료 * 1.5%
  const supplies = v.v7_dispensing * 0.015;
  const expense = v.v2_rent + v.v3_maintenance + v.v15_pharmacist_salary + v.v16_staff_salary + interest + v.v19_etc_expense + supplies + v.v22_meal;
  
  const pretax = income - expense;

  // 2. 세후 월 순수익 = 1번 * 0.9
  const posttax = pretax * 0.9;

  // 3. 약국 개국시 시급 = 1번/20번/4번
  let hourly = 0;
  if (v.v20_weekly_hours > 0) {
    hourly = pretax / v.v20_weekly_hours / 4;
  }

  // 4. PER = (4+5)/1/12
  let per = 0;
  if (pretax > 0) {
    per = (v.v4_premium + v.v5_consulting) / pretax / 12;
  }

  // 5. 추가 재고 인수 비용(전문+일반약 인수비용) = 14*130%
  const addInventory = v.v14_drug_cost * 1.3;

  // Result UI Mapping
  document.getElementById('res_pretax').textContent = formatOutputCurrency(pretax);
  document.getElementById('res_posttax').textContent = formatOutputCurrency(posttax);
  document.getElementById('res_hourly').textContent = formatOutputCurrency(hourly);
  document.getElementById('res_per').textContent = per.toFixed(2);
  document.getElementById('res_add_inventory').textContent = formatOutputCurrency(addInventory);

  resultsPane.style.display = 'block';

  // 결과 영역으로 자동 스크롤
  setTimeout(() => {
    resultsPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
});

// Data extraction
extractBtn.addEventListener('click', async () => {
  statusMsg.textContent = '데이터를 가져오는 중...';
  statusMsg.style.color = '#4F46E5';

  const selectedSite = siteSelect.value;
  
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, () => {
      chrome.tabs.sendMessage(tab.id, { command: "extractData", site: selectedSite }, (response) => {
        if (response && response.data) {
          const d = response.data;
          // Assign data if found
          if (d.v1) setFormatted('v1_deposit', d.v1);
          if (d.v2) setFormatted('v2_rent', d.v2);
          if (d.v3) setFormatted('v3_maintenance', d.v3);
          if (d.v4) setFormatted('v4_premium', d.v4);
          if (d.v5) setFormatted('v5_consulting', d.v5);
          if (d.v6) inputs['v6_size'].value = d.v6; // Size is pyung
          if (d.v7) setFormatted('v7_dispensing', d.v7);
          if (d.v8) setFormatted('v8_noncov_disp', d.v8);
          if (d.v9) setFormatted('v9_noncov_margin', d.v9);
          if (d.v10) setFormatted('v10_daily_otc', d.v10);
          if (d.v11) setFormatted('v11_monthly_otc', d.v11);
          if (d.v12) inputs['v12_otc_margin_rate'].value = d.v12; // Percentage
          if (d.v13) {
            inputs['v13_days'].value = d.v13 == 365 ? 30 : d.v13;
          }
          if (d.v14) setFormatted('v14_drug_cost', d.v14);
          
          updateDerivedOTC();
          updateSupplies();

          statusMsg.textContent = '데이터 추출 완료!';
          statusMsg.style.color = '#10B981';
        } else {
          statusMsg.textContent = '정보를 찾을 수 없습니다. (수동 입력 필요)';
          statusMsg.style.color = '#EAB308';
        }
      });
    });
  } catch(e) {
    statusMsg.textContent = '문제가 발생했습니다. 해당 사이트인지 확인하세요.';
    statusMsg.style.color = '#EF4444';
  }
});

// Auto-extract immediately when the extension opens
document.addEventListener('DOMContentLoaded', () => {
  extractBtn.click();
});
