// background.js

// 확장 프로그램 아이콘을 클릭했을 때 사이드 패널이 열리도록 설정
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 설치 시 실행될 로직 (필요한 경우)
chrome.runtime.onInstalled.addListener(() => {
  console.log('약국 수익 계산기 확장 프로그램이 설치되었습니다.');
});
