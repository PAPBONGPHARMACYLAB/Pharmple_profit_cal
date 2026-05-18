// token.js
// 알약 토큰 관리 및 Polar 결제 연동

// ── 토큰 상태 ──────────────────────────────────────────
let _tokenCache = null; // { tokens, isUnlimited, subType, subExpires }

// ── Supabase에서 현재 토큰/구독 상태 조회 ──────────────
async function getTokenStatus(forceRefresh = false) {
  if (_tokenCache && !forceRefresh) return _tokenCache;

  if (!window.supabaseClient) return null;
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) return null;

  const { data, error } = await window.supabaseClient
    .from('profiles')
    .select('tokens, is_unlimited, subscription_type, subscription_expires_at')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[token] 조회 실패:', error);
    return null;
  }

  // 구독 만료 체크
  let isUnlimited = data.is_unlimited || false;
  if (data.subscription_type !== 'none' && data.subscription_expires_at) {
    const expires = new Date(data.subscription_expires_at);
    if (expires < new Date()) {
      // 만료된 구독 → 리셋
      isUnlimited = false;
      await window.supabaseClient
        .from('profiles')
        .update({ subscription_type: 'none', is_unlimited: false })
        .eq('id', user.id);
    }
  }

  _tokenCache = {
    tokens: data.tokens ?? 0,
    isUnlimited,
    subType: data.subscription_type,
    subExpires: data.subscription_expires_at,
  };
  return _tokenCache;
}

// ── 토큰 수 반환 (무제한이면 Infinity) ──────────────────
async function getAvailableTokens() {
  const status = await getTokenStatus();
  if (!status) return 0;
  if (status.isUnlimited) return Infinity;
  return status.tokens;
}

// ── 토큰 1개 소비 ────────────────────────────────────────
async function consumeToken() {
  const status = await getTokenStatus();
  if (!status) throw new Error('로그인이 필요합니다.');
  if (status.isUnlimited) return true; // 무제한 구독은 소비 없음

  if (status.tokens <= 0) throw new Error('토큰이 부족합니다.');

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  const { error } = await window.supabaseClient
    .from('profiles')
    .update({ tokens: status.tokens - 1 })
    .eq('id', user.id);

  if (error) throw new Error('토큰 차감 실패: ' + error.message);

  _tokenCache.tokens = status.tokens - 1;
  refreshTokenDisplay();
  return true;
}

// ── 상단 토큰 UI 업데이트 ─────────────────────────────────
function refreshTokenDisplay() {
  const tokenDisplay = document.getElementById('token-display');
  const tokenCountEl = document.getElementById('token-count');
  if (!tokenDisplay || !tokenCountEl) return;

  if (!_tokenCache) {
    tokenDisplay.style.display = 'none';
    return;
  }

  tokenDisplay.style.display = 'flex';
  if (_tokenCache.isUnlimited) {
    tokenCountEl.textContent = '∞';
    tokenDisplay.style.background = '#FEF3C7';
    tokenDisplay.style.color = '#92400E';
  } else {
    tokenCountEl.textContent = _tokenCache.tokens;
    const count = _tokenCache.tokens;
    if (count === 0) {
      tokenDisplay.style.background = '#FEE2E2';
      tokenDisplay.style.color = '#991B1B';
    } else if (count <= 2) {
      tokenDisplay.style.background = '#FEF3C7';
      tokenDisplay.style.color = '#92400E';
    } else {
      tokenDisplay.style.background = '#EEF2FF';
      tokenDisplay.style.color = '#4F46E5';
    }
  }
}

// ── Polar 결제 페이지 열기 ───────────────────────────────
async function openPolarCheckout(productId) {
  if (!window.supabaseClient) {
    alert('로그인이 필요합니다.');
    return;
  }

  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) {
    alert('로그인이 필요합니다.');
    return;
  }

  try {
    // Polar API로 Checkout Session 생성
    const res = await fetch('https://api.polar.sh/v1/checkouts/custom/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${window.ENV.POLAR_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        customer_external_id: user.id,  // Supabase user ID → webhook에서 토큰 지급에 사용
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      let errorMsg = '결제 페이지 생성 실패';
      if (err.detail) {
        errorMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      }
      throw new Error(errorMsg);
    }

    const checkout = await res.json();
    // 새 탭으로 Polar 결제 페이지 열기
    chrome.tabs.create({ url: checkout.url });

    // 모달 닫기
    closeTokenModal();

    // 결제 완료 후 토큰 자동 새로고침 (10초마다 3번 체크)
    let checkCount = 0;
    const refreshInterval = setInterval(async () => {
      checkCount++;
      await getTokenStatus(true); // 강제 새로고침
      refreshTokenDisplay();
      if (checkCount >= 3) clearInterval(refreshInterval);
    }, 10000);

  } catch (err) {
    console.error('[token] 결제 페이지 오류:', err);
    alert('결제 페이지 열기 실패: ' + err.message);
  }
}

// ── 토큰 부족 모달 ─────────────────────────────────────
function showTokenModal() {
  const modal = document.getElementById('token-modal');
  if (modal) modal.style.display = 'flex';
}

function closeTokenModal() {
  const modal = document.getElementById('token-modal');
  if (modal) modal.style.display = 'none';
}

// ── 토큰 초기화 (로그인 직후 호출) ────────────────────
async function initTokenSystem() {
  _tokenCache = null;
  await getTokenStatus(true);
  refreshTokenDisplay();
}

window.tokenAPI = {
  getAvailableTokens,
  consumeToken,
  refreshTokenDisplay,
  openPolarCheckout,
  showTokenModal,
  closeTokenModal,
  initTokenSystem,
};
