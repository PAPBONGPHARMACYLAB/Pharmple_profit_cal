// save.js
// 약국 계산 결과 저장/불러오기 및 저장 목록 UI

// ── 현재 계산 데이터 수집 ──────────────────────────────
function collectCurrentData() {
  const ids = [
    'v1_deposit','v2_rent','v3_maintenance','v4_premium','v5_consulting',
    'v6_size','v7_dispensing','v8_noncov_disp','v9_noncov_margin',
    'v10_daily_otc','v11_monthly_otc','v12_otc_margin_rate','v12_1_monthly_otc_margin',
    'v13_days','v14_drug_cost','v15_pharmacist_salary','v16_staff_salary',
    'v17_loan','v18_interest_rate','v19_etc_expense','v20_weekly_hours',
    'v21_supplies','v22_meal'
  ];
  const inputData = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    inputData[id] = el ? el.value : '';
  });

  const resultData = {
    pretax: document.getElementById('res_pretax')?.textContent ?? '',
    posttax: document.getElementById('res_posttax')?.textContent ?? '',
    hourly: document.getElementById('res_hourly')?.textContent ?? '',
    per: document.getElementById('res_per')?.textContent ?? '',
    add_inventory: document.getElementById('res_add_inventory')?.textContent ?? '',
  };

  const pharmType = document.querySelector('input[name="pharm_type"]:checked')?.value ?? 'existing';

  return { inputData, resultData, pharmType };
}

// ── 저장 모달 열기 ──────────────────────────────────────
function openSaveModal() {
  const resultsPane = document.getElementById('results-pane');
  if (!resultsPane || resultsPane.style.display === 'none') {
    alert('먼저 계산을 실행해주세요.');
    return;
  }

  if (window.extractedContactInfo) {
    const info = window.extractedContactInfo;
    const pName = document.getElementById('save-pharmacy-name');
    const cName = document.getElementById('save-company-name');
    const rep = document.getElementById('save-representative');
    const mPhone = document.getElementById('save-main-phone');
    const moPhone = document.getElementById('save-mobile-phone');
    
    if (pName && !pName.value) pName.value = info.pharmacyName || '';
    if (cName && !cName.value) cName.value = info.companyName || '';
    if (rep && !rep.value) rep.value = info.representative || '';
    if (mPhone && !mPhone.value) mPhone.value = info.mainPhone || '';
    if (moPhone && !moPhone.value) moPhone.value = info.mobilePhone || '';
  }

  const modal = document.getElementById('save-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSaveModal() {
  const modal = document.getElementById('save-modal');
  if (modal) modal.style.display = 'none';
}

// ── Supabase에 저장 ─────────────────────────────────────
async function saveCalculation(pharmacyName, note, companyName, representative, mainPhone, mobilePhone, consultingNote) {
  if (!window.supabaseClient) throw new Error('Supabase 초기화 안됨');
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { inputData, resultData, pharmType } = collectCurrentData();
  const siteSource = document.getElementById('site-select')?.value ?? 'pharmple';

  // 연락처 정보 및 컨설팅 메모 추가
  inputData.companyName = companyName;
  inputData.representative = representative;
  inputData.mainPhone = mainPhone;
  inputData.mobilePhone = mobilePhone;
  inputData.consultingNote = consultingNote;

  const { data, error } = await window.supabaseClient
    .from('calculations')
    .insert({
      user_id: user.id,
      pharmacy_name: pharmacyName.trim(),
      feature_note: note.trim(),
      site_source: siteSource,
      pharm_type: pharmType,
      input_data: inputData,
      result_data: resultData,
    })
    .select()
    .single();

  if (error) throw new Error('저장 실패: ' + error.message);
  return data;
}

// ── 저장 목록 불러오기 ──────────────────────────────────
async function loadCalculations() {
  if (!window.supabaseClient) return [];
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return [];

  const { data, error } = await window.supabaseClient
    .from('calculations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('[save] 목록 로드 실패:', error); return []; }
  return data;
}

// ── 1개월 후 상황 업데이트 ───────────────────────────────
async function updateAfterOneMonth(id, text) {
  if (!window.supabaseClient) return;
  const { error } = await window.supabaseClient
    .from('calculations')
    .update({ after_one_month: text })
    .eq('id', id);
  if (error) console.error('[save] 업데이트 실패:', error);
}

// ── 삭제 ─────────────────────────────────────────────────
async function deleteCalculation(id) {
  if (!window.supabaseClient) return;
  const { error } = await window.supabaseClient
    .from('calculations')
    .delete()
    .eq('id', id);
  if (error) console.error('[save] 삭제 실패:', error);
}

// ── 약국 형태 레이블 ────────────────────────────────────
function pharmTypeLabel(type) {
  return { new: '🆕 신규', existing: '🏪 기존', other: '📋 기타' }[type] ?? type;
}

// ── 입력값 테이블 행 생성 ───────────────────────────────
function buildDetailTable(item) {
  const inputData = item.input_data;
  const resultData = item.result_data;

  const labelMap = {
    v1_deposit: '보증금', v2_rent: '월세(임차료)', v3_maintenance: '관리비',
    v4_premium: '권리금(인테리어)', v5_consulting: '컨설팅비', v6_size: '약국 평수(평)',
    v7_dispensing: '조제료', v8_noncov_disp: '비급여 조제료', v9_noncov_margin: '비급여 약가마진',
    v10_daily_otc: '일일 매약 매출', v11_monthly_otc: '월 매약 매출',
    v12_otc_margin_rate: '매약 마진률(%)', v12_1_monthly_otc_margin: '월 매약 마진',
    v13_days: '영업일수(일)', v14_drug_cost: '한달 평균 약제비',
    v15_pharmacist_salary: '약사 급여', v16_staff_salary: '직원 급여',
    v17_loan: '대출금액', v18_interest_rate: '이자율(%)',
    v19_etc_expense: '기타잡비', v20_weekly_hours: '주당 영업시간(시간)',
    v21_supplies: '소모품비', v22_meal: '직원 식비',
    companyName: '업체명', representative: '대표자/담당자',
    mainPhone: '대표전화', mobilePhone: '휴대전화',
    consultingNote: '컨설팅 특징'
  };

  let rows = Object.entries(labelMap)
    .filter(([k]) => inputData[k] && inputData[k] !== '' && inputData[k] !== '0원' && inputData[k] !== '0')
    .map(([k, label]) => `<tr><td>${label}</td><td>${inputData[k]}</td></tr>`)
    .join('');

  const resRows = `
    <tr class="result-row"><td>세전 월 순수익</td><td><strong>${resultData.pretax}</strong></td></tr>
    <tr class="result-row"><td>세후 월 순수익</td><td><strong>${resultData.posttax}</strong></td></tr>
    <tr class="result-row"><td>약국 개국 시급</td><td>${resultData.hourly}</td></tr>
    <tr class="result-row"><td>PER</td><td>${resultData.per}</td></tr>
    <tr class="result-row"><td>추가 재고 비용</td><td>${resultData.add_inventory}</td></tr>
  `;

  return `
    <table class="detail-table">
      <thead><tr><th>항목</th><th>값</th></tr></thead>
      <tbody>${rows}${resRows}</tbody>
    </table>
    <div style="margin-top: 16px;">
      <button class="recalc-btn btn" data-id="${item.id}" style="padding: 10px 24px; font-size: 14px; width: 100%; background: #EEF2FF; color: var(--primary); border: 1px solid var(--primary); border-radius: 8px; font-weight: bold; cursor: pointer;">🔄 다시 계산하기</button>
    </div>
  `;
}

// ── 저장 목록 탭 렌더링 ─────────────────────────────────
async function renderSavedList() {
  const container = document.getElementById('saved-list-container');
  if (!container) return;

  container.innerHTML = '<p style="text-align:center; color:#9CA3AF; padding:24px;">불러오는 중...</p>';

  const list = await loadCalculations();

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:#9CA3AF;">
        <div style="font-size:40px; margin-bottom:12px;">📋</div>
        <p>저장된 약국이 없습니다.</p>
        <p style="font-size:12px;">계산 후 [💾 저장하기]를 눌러 저장하세요.</p>
      </div>`;
    return;
  }

  // 요약 카드 (세로 배열)
  const summaryRows = list.map(item => {
    const d = new Date(item.created_at).toLocaleDateString('ko-KR');
    return `
      <div class="card saved-item-card" data-id="${item.id}" style="margin-bottom: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <span style="font-size: 12px; font-weight: 600; color: var(--primary); background: #EEF2FF; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">
              ${pharmTypeLabel(item.pharm_type)}
            </span>
            <strong style="font-size: 15px; color: var(--text-main);">${item.pharmacy_name}</strong>
          </div>
          <span style="font-size: 11px; color: #9CA3AF;">${d}</span>
        </div>
        
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">
          <strong>특이사항:</strong> ${item.feature_note || '-'}
        </div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
          <strong>컨설팅 특징:</strong> ${item.input_data?.consultingNote || '-'}
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 4px;">1개월 후 상황:</strong>
          <input class="after-month-input" type="text" value="${item.after_one_month || ''}"
            placeholder="메모 입력..." data-id="${item.id}"
            style="width:100%; border:1px solid #E5E7EB; border-radius:6px; padding:6px 8px; font-size:13px; box-sizing: border-box;">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="edit-feature-btn" data-id="${item.id}" data-current="${item.feature_note || ''}" style="background:none; border:1px solid #9CA3AF; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; font-weight: 500; color:#4B5563;">수정</button>
          <button class="detail-toggle-btn" data-id="${item.id}" style="background:none; border:1px solid #E5E7EB; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; font-weight: 500;">상세 보기</button>
          <button class="delete-btn" data-id="${item.id}" style="background:none; border:1px solid #FCA5A5; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; font-weight: 500; color:#EF4444;">삭제</button>
        </div>

        <div class="detail-row" id="detail-${item.id}" style="display:none; margin-top: 12px; border-top: 1px dashed #E5E7EB; padding-top: 12px;">
          <div class="detail-content">
            ${buildDetailTable(item)}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="padding: 0 16px;">
      ${summaryRows}
    </div>`;

  // ── 다시 계산하기 ──────────────────────────────────
  container.querySelectorAll('.recalc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = list.find(x => x.id === id);
      if (!item) return;

      const inputData = item.input_data;
      
      // 약국 형태 세팅
      const radios = document.getElementsByName('pharm_type');
      radios.forEach(r => {
        if (r.value === item.pharm_type) r.checked = true;
      });

      // 입력 필드 복원
      for (const key in inputData) {
        const el = document.getElementById(key);
        if (el) {
          el.value = inputData[key];
          el.dispatchEvent(new Event('input')); // 한글 표기 등 트리거
        }
      }

      // 저장용 전역 데이터 복원
      window.extractedContactInfo = {
        pharmacyName: item.pharmacy_name,
        companyName: inputData.companyName || '',
        representative: inputData.representative || '',
        mainPhone: inputData.mainPhone || '',
        mobilePhone: inputData.mobilePhone || '',
        consultingNote: inputData.consultingNote || ''
      };

      // 특이사항도 복원하고 싶다면 계산기 탭에 별도 필드가 없으므로 생략.

      // 계산기 탭으로 전환
      const calcTab = document.getElementById('tab-calc');
      if (calcTab) calcTab.click();
    });
  });

  // ── 특이사항 수정 ─────────────────────────────────
  container.querySelectorAll('.edit-feature-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const currentNote = btn.dataset.current;
      const newNote = prompt('특이사항을 수정하세요:', currentNote);
      
      if (newNote !== null && newNote.trim() !== currentNote) {
        btn.textContent = '수정 중...';
        btn.disabled = true;
        
        try {
          const { error } = await window.supabaseClient
            .from('calculations')
            .update({ feature_note: newNote.trim() })
            .eq('id', id);
            
          if (error) throw new Error(error.message);
          renderSavedList(); // 목록 새로고침
        } catch (e) {
          alert('수정 실패: ' + e.message);
          btn.textContent = '수정';
          btn.disabled = false;
        }
      }
    });
  });

  // ── 상세 토글 ─────────────────────────────────────
  container.querySelectorAll('.detail-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = document.getElementById(`detail-${id}`);
      if (row) {
        const isHidden = row.style.display === 'none';
        row.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? '닫기' : '상세';
      }
    });
  });

  // 삭제 버튼
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 항목을 삭제하시겠습니까?')) return;
      await deleteCalculation(btn.dataset.id);
      renderSavedList();
    });
  });

  // 1개월 후 상황 입력 저장 (포커스 아웃 시)
  container.querySelectorAll('.after-month-input').forEach(input => {
    input.addEventListener('blur', async () => {
      await updateAfterOneMonth(input.dataset.id, input.value);
    });
  });
}

window.saveAPI = {
  openSaveModal,
  closeSaveModal,
  saveCalculation,
  renderSavedList,
};
