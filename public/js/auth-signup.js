const AUTH_BASE = '/api/auth';

const getCsrfToken = () => {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const initSignup = () => {
  const signupBtn = document.getElementById('signup-btn');
  const gotoLogin = document.getElementById('goto-login');
  const darkBtn = document.getElementById('dark-mode-btn');
  const inputs = {
    username: document.getElementById('signup-user'),
    password: document.getElementById('signup-pass'),
    password2: document.getElementById('signup-pass2'),
    age: document.getElementById('signup-age'),
    city: document.getElementById('signup-city'),
    state: document.getElementById('signup-state'),
    country: document.getElementById('signup-country')
  };

  const missingElement = Object.values(inputs).some(input => !input);
  if (!signupBtn || !gotoLogin || !darkBtn || missingElement) {
    console.error('Elementos da tela de cadastro não encontrados.');
    return;
  }

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

  const attemptSignup = async () => {
    const username = inputs.username.value.trim();
    const password = inputs.password.value;
    const password2 = inputs.password2.value;
    const age = inputs.age.value;
    const city = inputs.city.value.trim();
    const state = inputs.state.value.trim();
    const country = inputs.country.value.trim();

    if (!username || !password || !password2) {
      alert('Por favor, preencha usuário, senha e confirmação de senha!');
      return;
    }
    if (username.length < 3 || username.length > 20) {
      alert('O usuário deve ter entre 3 e 20 caracteres!');
      return;
    }
    if (password.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres!');
      return;
    }
    if (password !== password2) {
      alert('As senhas não coincidem!');
      return;
    }
    if (age && (age < 1 || age > 120)) {
      alert('Idade inválida!');
      return;
    }

    try {
      const response = await fetch(`${AUTH_BASE}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        credentials: 'include',
        body: JSON.stringify({
          username,
          password,
          age: age ? parseInt(age, 10) : undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || 'Não foi possível criar a conta.');
        return;
      }

      alert(data.message || 'Conta criada com sucesso!');
      window.location.href = data.user.isAdmin ? 'admin.html' : 'index.html';
    } catch (error) {
      console.error(error);
      alert('Erro ao conectar com o servidor! Verifique se o backend está rodando.');
    }
  };

  gotoLogin.addEventListener('click', () => {
    window.location.href = 'login.html';
  });

  signupBtn.addEventListener('click', attemptSignup);
  inputs.country.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptSignup();
    }
  });

  applyDarkMode();
  ensureLoggedOut();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSignup);
} else {
  initSignup();
}

