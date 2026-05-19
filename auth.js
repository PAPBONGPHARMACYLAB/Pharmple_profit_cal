// auth.js
// 로그인/로그아웃 UI - background에서 받은 id_token으로 Supabase 로그인

const loginBtn = document.getElementById('login-btn');     // 로그인 화면의 카카오 로그인 버튼
const logoutBtn = document.getElementById('logout-btn');   // 메인 앱의 로그아웃 버튼
const tokenDisplay = document.getElementById('token-display');
const tokenCountEl = document.getElementById('token-count');
const chargeBtn = document.getElementById('charge-btn');

let currentUser = null;

// ────────────────────────────
// 로그인
// ────────────────────────────
async function handleLogin() {
  if (!window.supabaseClient) {
    alert("Supabase 클라이언트가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  loginBtn.textContent = '로그인 중...';
  loginBtn.disabled = true;

  try {
    // 1) background.js에서 카카오 ID 토큰 획득
    const result = await chrome.runtime.sendMessage({ action: 'kakaoLogin' });
    console.log("[auth] background 응답:", result);

    if (!result || !result.success) {
      throw new Error(result?.error || "카카오 로그인 실패");
    }

    // 2) 카카오 id_token + access_token으로 Supabase 로그인
    //    accessToken을 함께 넘기면 Supabase가 카카오 사용자 정보 API로 이메일을 자동 조회함
    const { data, error } = await window.supabaseClient.auth.signInWithIdToken({
      provider: 'kakao',
      token: result.idToken,
      accessToken: result.accessToken,  // 이메일 조회 fallback용
    });

    if (error) throw error;

    console.log("[auth] Supabase 로그인 성공:", data.user);

    // 3) 세션 저장 및 UI 갱신
    if (data.session) {
      await chrome.storage.local.set({
        supabase_session: JSON.stringify(data.session),
        supabase_user: JSON.stringify(data.user),
      });
    }

    updateAuthUI(data.user);

  } catch (err) {
    console.error("[auth] 로그인 에러:", err);
    alert("로그인 실패: " + err.message);
  } finally {
    loginBtn.textContent = '카카오 로그인';
    loginBtn.disabled = false;
  }
}

// ────────────────────────────
// 로그아웃
// ────────────────────────────
async function handleLogout() {
  logoutBtn.disabled = true;
  logoutBtn.textContent = '로그아웃 중...';
  try {
    await chrome.runtime.sendMessage({ action: 'kakaoLogout' });
    if (window.supabaseClient) {
      await window.supabaseClient.auth.signOut();
    }
    updateAuthUI(null);
  } catch (err) {
    console.error("[auth] 로그아웃 오류:", err);
  } finally {
    logoutBtn.disabled = false;
    logoutBtn.textContent = '로그아웃';
  }
}

// ────────────────────────────
// UI 업데이트
// ────────────────────────────
function updateAuthUI(user) {
  currentUser = user;
  const loginScreen = document.getElementById('login-screen');
  const mainApp = document.getElementById('main-app');
  const mypageBtn = document.getElementById('mypage-btn');

  if (user) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';
    logoutBtn.style.display = 'inline-block';
    if (chargeBtn) chargeBtn.style.display = 'inline-block';
    if (mypageBtn) mypageBtn.style.display = 'inline-block';
    // 토큰 시스템 초기화 (token.js 로드 후 실행)
    if (window.tokenAPI) {
      window.tokenAPI.initTokenSystem();
    }
    // 온보딩 확인
    checkOnboarding(user);
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    logoutBtn.style.display = 'none';
    if (chargeBtn) chargeBtn.style.display = 'none';
    if (mypageBtn) mypageBtn.style.display = 'none';
    if (tokenDisplay) tokenDisplay.style.display = 'none';
  }
}

// ────────────────────────────
// 온보딩 (회원가입) 확인
// ────────────────────────────
async function checkOnboarding(user) {
  if (!window.supabaseClient) return;
  const { data: profile, error } = await window.supabaseClient
    .from('profiles')
    .select('is_onboarded, display_name, phone_number, email')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[auth] profile fetch error:', error);
    return;
  }

  if (!profile.is_onboarded) {
    const obModal = document.getElementById('onboarding-modal');
    if (obModal) {
      obModal.style.display = 'flex';
      document.getElementById('ob-nickname').value = profile.display_name || '';
      document.getElementById('ob-email').value = profile.email || user.email || '';
    }
  }
}

// 온보딩 폼 제출
document.getElementById('ob-submit-btn')?.addEventListener('click', async () => {
  const nickname = document.getElementById('ob-nickname').value.trim();
  const phone = document.getElementById('ob-phone').value.trim();
  const email = document.getElementById('ob-email').value.trim();

  if (!nickname || !phone || !email) {
    alert('모든 정보를 입력해주세요.');
    return;
  }

  const btn = document.getElementById('ob-submit-btn');
  btn.textContent = '처리 중...';
  btn.disabled = true;

  try {
    const { error } = await window.supabaseClient
      .from('profiles')
      .update({
        display_name: nickname,
        phone_number: phone,
        email: email,
        is_onboarded: true
      })
      .eq('id', currentUser.id);

    if (error) throw error;

    document.getElementById('onboarding-modal').style.display = 'none';
    alert('가입이 완료되었습니다!');
  } catch (err) {
    alert('오류 발생: ' + err.message);
  } finally {
    btn.textContent = '가입 완료하기';
    btn.disabled = false;
  }
});

// ────────────────────────────
// 초기 세션 확인
// ────────────────────────────
async function initAuth() {
  const result = await new Promise((resolve) =>
    chrome.storage.local.get(['supabase_user', 'supabase_session'], resolve)
  );

  if (result.supabase_user && result.supabase_session) {
    try {
      const user = JSON.parse(result.supabase_user);
      const session = JSON.parse(result.supabase_session);
      if (window.supabaseClient) {
        await window.supabaseClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
      updateAuthUI(user);
    } catch (e) {
      console.warn("[auth] 세션 복원 실패:", e);
    }
  }
}

// ────────────────────────────
// 이벤트 등록 & 초기화
// ────────────────────────────
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
initAuth();

