// admin.js
// 관리자 모드 로직 (비밀번호 911225 기반 토큰 지급)

document.addEventListener('DOMContentLoaded', () => {
  const adminModeBtn = document.getElementById('admin-mode-btn');
  const loginScreen = document.getElementById('login-screen');
  const paneAdmin = document.getElementById('pane-admin');
  const adminLoginCancel = document.getElementById('admin-login-cancel');
  const adminBackBtn = document.getElementById('admin-back-btn');

  const adminLoginBtn = document.getElementById('admin-login-btn');
  const adminPasswordInput = document.getElementById('admin-password-input');
  const adminLoginSection = document.getElementById('admin-login-section');
  const adminDashboardSection = document.getElementById('admin-dashboard-section');
  const refreshAdminBtn = document.getElementById('refresh-admin-btn');
  const adminUserList = document.getElementById('admin-user-list');

  let currentAdminPass = '';

  // 관리자 모드 진입
  adminModeBtn?.addEventListener('click', () => {
    if (loginScreen) loginScreen.style.display = 'none';
    if (paneAdmin) paneAdmin.style.display = 'flex';
    adminPasswordInput.value = '';
    adminPasswordInput.focus();
  });

  // 관리자 인증 취소 (돌아가기)
  adminLoginCancel?.addEventListener('click', () => {
    if (paneAdmin) paneAdmin.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
  });

  // 관리자 대시보드에서 돌아가기
  adminBackBtn?.addEventListener('click', () => {
    currentAdminPass = ''; // 세션 초기화
    adminLoginSection.style.display = 'block';
    adminDashboardSection.style.display = 'none';
    if (paneAdmin) paneAdmin.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
  });

  adminLoginBtn?.addEventListener('click', async () => {
    const pass = adminPasswordInput.value.trim();
    if (!pass) {
      alert('비밀번호를 입력하세요.');
      return;
    }
    
    adminLoginBtn.textContent = '인증 중...';
    adminLoginBtn.disabled = true;

    try {
      // 인증 테스트용 호출
      const { data, error } = await window.supabaseClient.rpc('admin_get_users', { admin_pass: pass });
      if (error) throw error;

      // 성공
      currentAdminPass = pass;
      adminLoginSection.style.display = 'none';
      adminDashboardSection.style.display = 'flex';
      renderUserList(data);
    } catch (err) {
      alert('인증 실패: 잘못된 비밀번호입니다.');
      adminPasswordInput.value = '';
    } finally {
      adminLoginBtn.textContent = '확인';
      adminLoginBtn.disabled = false;
    }
  });

  refreshAdminBtn?.addEventListener('click', async () => {
    if (!currentAdminPass) return;
    refreshAdminBtn.textContent = '🔄...';
    try {
      const { data, error } = await window.supabaseClient.rpc('admin_get_users', { admin_pass: currentAdminPass });
      if (error) throw error;
      renderUserList(data);
    } catch (err) {
      console.error(err);
      alert('목록 새로고침 실패');
    } finally {
      refreshAdminBtn.textContent = '🔄 새로고침';
    }
  });

  function renderUserList(users) {
    if (!adminUserList) return;
    adminUserList.innerHTML = '';
    
    if (!users || users.length === 0) {
      adminUserList.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:12px;">가입된 사용자가 없습니다.</td></tr>';
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.className = 'summary-row';
      tr.innerHTML = `
        <td>${u.display_name || '이름 없음'}</td>
        <td>${u.email || '-'}</td>
        <td>${u.phone_number || '-'}</td>
        <td style="font-weight:bold; color:var(--primary);">${u.tokens}개</td>
        <td>
          <div style="display:flex; gap:4px;">
            <input type="number" id="grant-amt-${u.id}" placeholder="수량" style="width:50px; padding:4px; font-size:12px; border:1px solid var(--border); border-radius:4px;">
            <button class="btn success-btn grant-token-btn" data-userid="${u.id}" style="padding:4px 8px; font-size:11px;">지급</button>
          </div>
        </td>
      `;
      adminUserList.appendChild(tr);
    });

    // 이벤트 리스너 동적 연결 (CSP 우회)
    document.querySelectorAll('.grant-token-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.target.getAttribute('data-userid');
        const input = document.getElementById(`grant-amt-${userId}`);
        const amount = parseInt(input.value);
        if (isNaN(amount) || amount === 0) {
          alert('지급할 토큰 수량을 올바르게 입력하세요.');
          return;
        }

        if (!confirm(`해당 사용자에게 ${amount}개의 토큰을 지급하시겠습니까?`)) return;

        try {
          const { error } = await window.supabaseClient.rpc('admin_grant_tokens', {
            target_user_id: userId,
            amount: amount,
            admin_pass: currentAdminPass
          });
          if (error) throw error;

          alert('성공적으로 지급되었습니다.');
          refreshAdminBtn.click(); // 리스트 갱신
        } catch (err) {
          console.error(err);
          alert('지급 실패: ' + err.message);
        }
      });
    });
  }
});
