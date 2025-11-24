const AUTH_BASE = '/api/auth';

const getCsrfToken = () => {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const initLogin = () => {
  const loginBtn = document.getElementById('login-btn');
  const gotoSignup = document.getElementById('goto-signup');
  const passwordInput = document.getElementById('login-pass');
  const usernameInput = document.getElementById('login-user');
  const darkBtn = document.getElementById('dark-mode-btn');

  if (!loginBtn || !gotoSignup || !passwordInput || !usernameInput || !darkBtn) {
    console.error('Elementos da tela de login não encontrados.');
    return;
  }

  const applyDarkMode = () => {
    let darkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark', darkMode);
    darkBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';

    darkBtn.addEventListener('click', () => {
      darkMode = !darkMode;
      document.body.classList.toggle('dark', darkMode);
      localStorage.setItem('darkMode', String(darkMode));
      darkBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';
    });
  };

  const ensureLoggedOut = async () => {
    try {
      const response = await fetch(`${AUTH_BASE}/check-session`, { credentials: 'include' });
      const data = await response.json();
      if (data.authenticated) {
        window.location.href = data.user.isAdmin ? 'admin.html' : 'index.html';
      }
    } catch (error) {
      console.error('Erro ao verificar sessão', error);
    }
  };

  const attemptLogin = async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      alert('Informe usuário e senha para continuar.');
      return;
    }

    try {
      const response = await fetch(`${AUTH_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || 'Não foi possível entrar. Verifique as credenciais.');
        return;
      }

      window.location.href = data.user.isAdmin ? 'admin.html' : 'index.html';
    } catch (error) {
      console.error(error);
      alert('Erro ao conectar com o servidor. Verifique se o backend está rodando.');
    }
  };

  gotoSignup.addEventListener('click', () => {
    window.location.href = 'signup.html';
  });

  loginBtn.addEventListener('click', attemptLogin);
  passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptLogin();
    }
  });

  applyDarkMode();
  ensureLoggedOut();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogin);
} else {
  initLogin();
}

