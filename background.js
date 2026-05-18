// background.js
// 서비스 워커 - 카카오 직접 OAuth → ID토큰 획득 → side panel이 Supabase에 교환

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('약국 수익 계산기 확장 프로그램이 설치되었습니다.');
});

const KAKAO_REST_API_KEY = "75b73f09d2e6fc8013ae95ddd5e35f94";
const KAKAO_CLIENT_SECRET = "EsF7AocsSRkom01k22eDLlAKy8qqBour";
const SUPABASE_URL = "https://nhkdpgaskszkuhmjpgto.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oa2RwZ2Fza3N6a3VobWpwZ3RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDEyNjQsImV4cCI6MjA5MjUxNzI2NH0.QMV4Nb5C9eC8qBCy9BNUw6-eFf8EQSxicwcJOGSeqWM";

// ── 메시지 리스너 ──────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'kakaoLogin') {
    handleKakaoLogin().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  if (message.action === 'kakaoLogout') {
    handleKakaoLogout().then(sendResponse);
    return true;
  }
});

// ── 카카오 직접 OAuth 로그인 ───────────────────
async function handleKakaoLogin() {
  try {
    // 1) 카카오 authorize URL 직접 구성 (Supabase 우회)
    const redirectUrl = chrome.identity.getRedirectURL();
    console.log("[bg] Redirect URL:", redirectUrl);

    const authUrl = "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({
      client_id: KAKAO_REST_API_KEY,
      redirect_uri: redirectUrl,
      response_type: "code",
      scope: "openid",   // accessToken 병행 전달로 Supabase가 이메일을 카카오 API로 조회
    }).toString();

    console.log("[bg] Kakao Auth URL:", authUrl);

    // 2) Chrome 팝업으로 카카오 로그인
    const callbackUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (redirectedTo) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!redirectedTo) {
            reject(new Error("callbackUrl이 없습니다."));
          } else {
            resolve(redirectedTo);
          }
        }
      );
    });

    console.log("[bg] Callback URL:", callbackUrl);

    // 3) authorization code 추출
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("code 파라미터 없음: " + callbackUrl);

    // 4) 카카오 토큰 엔드포인트로 code → access_token + id_token 교환
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KAKAO_REST_API_KEY,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: redirectUrl,
        code,
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    console.log("[bg] Kakao token response:", tokenData);

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const idToken = tokenData.id_token;
    if (!idToken) throw new Error("id_token이 없습니다. openid scope 확인 필요");

    // 5) id_token을 side panel로 전달 (supabaseClient.signInWithIdToken 호출용)
    return { success: true, idToken, accessToken: tokenData.access_token };

  } catch (err) {
    console.error("[bg] 카카오 로그인 에러:", err);
    return { success: false, error: err.message };
  }
}

// ── 로그아웃 ───────────────────────────────────
async function handleKakaoLogout() {
  try {
    const result = await chrome.storage.local.get(["supabase_session"]);
    if (result.supabase_session) {
      const session = JSON.parse(result.supabase_session);
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      }).catch(() => {});
    }
    await chrome.storage.local.remove(["supabase_session", "supabase_user"]);
    return { success: true };
  } catch {
    await chrome.storage.local.remove(["supabase_session", "supabase_user"]);
    return { success: true };
  }
}
