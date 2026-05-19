// mypage.js
// 마이페이지 탭 동작 및 데이터 로드/저장 관리

const mypageBtn = document.getElementById('mypage-btn');
const tabCalc = document.getElementById('tab-calc');
const tabSaved = document.getElementById('tab-saved');

// 마이페이지 탭 열기
mypageBtn?.addEventListener('click', () => {
  // 메인 네비게이션 탭들의 active 상태 제거
  tabCalc?.classList.remove('active');
  tabSaved?.classList.remove('active');
  
  document.getElementById('pane-calc').style.display = 'none';
  document.getElementById('pane-saved').style.display = 'none';
  document.getElementById('pane-mypage').style.display = 'flex';

  loadMyInfo();
});

// 기존 탭 클릭 시 마이페이지 닫기
[tabCalc, tabSaved].forEach(tab => {
  tab?.addEventListener('click', () => {
    document.getElementById('pane-mypage').style.display = 'none';
  });
});

// 하위 탭 스위칭 로직
const subTabs = ['info', 'payment', 'usage'];
subTabs.forEach(tab => {
  const btn = document.getElementById(`mypage-tab-${tab}`);
  btn?.addEventListener('click', () => {
    subTabs.forEach(t => {
      const b = document.getElementById(`mypage-tab-${t}`);
      const v = document.getElementById(`mypage-view-${t}`);
      if (b) {
        b.style.borderBottom = t === tab ? '2px solid var(--primary)' : 'none';
        b.style.color = t === tab ? 'var(--primary)' : 'var(--text-muted)';
      }
      if (v) {
        v.style.display = t === tab ? 'block' : 'none';
      }
    });

    if (tab === 'info') loadMyInfo();
    if (tab === 'payment') loadPaymentHistory();
    if (tab === 'usage') loadTokenUsageHistory();
  });
});

// ── 1. 내 정보 뷰 ──
async function loadMyInfo() {
  if (!window.supabaseClient) return;
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await window.supabaseClient
    .from('profiles')
    .select('display_name, phone_number, email')
    .eq('id', user.id)
    .single();

  if (error || !data) return;
  
  document.getElementById('mp-nickname').value = data.display_name || '';
  document.getElementById('mp-phone').value = data.phone_number || '';
  document.getElementById('mp-email').value = data.email || user.email || '';
}

document.getElementById('mp-save-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('mp-save-btn');
  const name = document.getElementById('mp-nickname').value.trim();
  const phone = document.getElementById('mp-phone').value.trim();

  if (!name) {
    alert('닉네임을 입력해주세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '저장 중...';

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (user) {
    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ display_name: name, phone_number: phone })
      .eq('id', user.id);

    if (error) {
      alert('저장 실패: ' + error.message);
    } else {
      alert('✅ 정보가 수정되었습니다.');
    }
  }
  
  btn.disabled = false;
  btn.textContent = '정보 수정하기';
});

// ── 2. 결제 내역 뷰 ──
async function loadPaymentHistory() {
  const listContainer = document.getElementById('mp-payment-list');
  listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">불러오는 중...</p>';

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await window.supabaseClient
    .from('polar_orders')
    .select('product_id, tokens_granted, processed_at')
    .eq('user_id', user.id)
    .order('processed_at', { ascending: false });

  if (error) {
    listContainer.innerHTML = '<p style="text-align:center; color:red; padding:20px;">결제 내역을 불러올 수 없습니다.</p>';
    return;
  }

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">결제 내역이 없습니다.</p>';
    return;
  }

  const getProductName = (pid) => {
    const names = {
      'pills_5': '알약 5개',
      'pills_10': '알약 10개',
      'pills_100': '알약 100개',
      'sub_week': '1주일 구독권',
      'sub_month': '1달 구독권',
      'sub_life': '무제한 평생 구독권'
    };
    return names[pid] || pid;
  };

  listContainer.innerHTML = data.map(item => `
    <div style="padding:12px; border:1px solid var(--border); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:600; font-size:14px;">${getProductName(item.product_id)}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${new Date(item.processed_at).toLocaleString('ko-KR')}</div>
      </div>
      <div style="font-weight:600; color:var(--primary); font-size:14px;">
        ${item.tokens_granted > 0 ? '+' + item.tokens_granted + '개' : '구독/기타'}
      </div>
    </div>
  `).join('');
}

// ── 3. 알약 사용 내역 뷰 ──
async function loadTokenUsageHistory() {
  const listContainer = document.getElementById('mp-usage-list');
  listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">불러오는 중...</p>';

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await window.supabaseClient
    .from('token_usage_history')
    .select('usage_type, amount, description, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    listContainer.innerHTML = '<p style="text-align:center; color:red; padding:20px;">내역을 불러올 수 없습니다.</p>';
    return;
  }

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">사용 내역이 없습니다.</p>';
    return;
  }

  listContainer.innerHTML = data.map(item => {
    const isPositive = item.amount > 0;
    const color = isPositive ? '#10B981' : '#EF4444';
    const sign = isPositive ? '+' : '';
    
    return `
      <div style="padding:12px; border:1px solid var(--border); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:600; font-size:14px;">${item.description || item.usage_type}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${new Date(item.created_at).toLocaleString('ko-KR')}</div>
        </div>
        <div style="font-weight:600; color:${color}; font-size:14px;">
          ${sign}${item.amount}개
        </div>
      </div>
    `;
  }).join('');
}
