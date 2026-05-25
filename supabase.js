// supabase.js
// Supabase 클라이언트 초기화 및 설정

(function () {
  const SUPABASE_URL = window.ENV.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.ENV.SUPABASE_ANON_KEY;

  /**
   * Chrome 확장 프로그램에서는 localStorage를 사용할 수 없음.
   * chrome.storage.local을 사용하는 커스텀 Storage Adapter 정의.
   */
  const chromeStorageAdapter = {
    getItem: (key) =>
      new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] !== undefined ? result[key] : null);
        });
      }),
    setItem: (key, value) =>
      new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      }),
    removeItem: (key) =>
      new Promise((resolve) => {
        chrome.storage.local.remove([key], () => resolve());
      }),
  };

  // supabase-js UMD 번들은 window.supabase 또는 exports.supabase 로 등록됨
  const supabaseLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!supabaseLib || !supabaseLib.createClient) {
    console.error("[supabase.js] Supabase 라이브러리가 로드되지 않았습니다.");
    return;
  }

  window.supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  console.log("[supabase.js] Supabase 클라이언트 초기화 완료.");
})();
