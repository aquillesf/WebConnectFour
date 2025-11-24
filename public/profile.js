const AUTH_BASE = '/api/auth';

const getCsrfToken = () => {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

document.addEventListener('DOMContentLoaded', () => {
  initProfile();
});

async function initProfile() {
  try {
    await ensureSession();
    setupDarkMode();
    setupNavigation();
    await loadProfile();
    setupFormControls();
    setupAvatarSelector();
  } catch (error) {
    console.error(error);
    window.location.href = 'login.html';
  }
}

async function ensureSession() {
  const response = await fetch(`${AUTH_BASE}/check-session`, { credentials: 'include' });
  const data = await response.json();
  if (!data.authenticated) {
    throw new Error('Sessão expirada');
  }
}

function setupDarkMode() {
  const toggleBtn = document.getElementById('dark-mode-btn');
  if (!toggleBtn) return;

  let darkMode = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark', darkMode);
  toggleBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';

  toggleBtn.addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
    toggleBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';
  });
}

function setupNavigation() {
  const backBtn = document.getElementById('goto-game');
  backBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  const headerBackBtn = document.getElementById('back-to-game');
  headerBackBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      const response = await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() }
      });
      const data = await response.json();
      if (data.success) {
        window.location.href = 'login.html';
      } else {
        alert(data.message || 'Não foi possível sair.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao sair. Tente novamente.');
    }
  });
}

const profileInputs = {
  username: document.getElementById('profile-user'),
  age: document.getElementById('profile-age'),
  city: document.getElementById('profile-city'),
  state: document.getElementById('profile-state'),
  country: document.getElementById('profile-country')
};

async function loadProfile() {
  const response = await fetch(`${AUTH_BASE}/profile`, { credentials: 'include' });
  const data = await response.json();
  if (!data.success) {
    throw new Error('Não foi possível carregar o perfil.');
  }

  const { username, age, city, state, country, avatar } = data.user;
  profileInputs.username.value = username || '';
  profileInputs.age.value = age || '';
  profileInputs.city.value = city || '';
  profileInputs.state.value = state || '';
  profileInputs.country.value = country || '';

  const displayUsername = document.getElementById('display-username');
  const avatarImg = document.getElementById('avatar-img');
  if (displayUsername) displayUsername.textContent = username;
  if (avatarImg) avatarImg.src = `Profile Pictures/${avatar || '1'}.jpg`;
  markSelectedOption(avatar || '1');
}

function setupFormControls() {
  const editBtn = document.getElementById('edit-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  const setDisabled = (disabled) => {
    Object.values(profileInputs).forEach(input => {
      input.disabled = disabled;
    });
  };

  editBtn?.addEventListener('click', () => {
    setDisabled(false);
    toggleFormButtons(true);
    profileInputs.username.focus();
  });

  cancelBtn?.addEventListener('click', async () => {
    await loadProfile();
    setDisabled(true);
    toggleFormButtons(false);
  });

  saveBtn?.addEventListener('click', async () => {
    const payload = {
      age: profileInputs.age.value ? Number(profileInputs.age.value) : undefined,
      city: profileInputs.city.value.trim(),
      state: profileInputs.state.value.trim(),
      country: profileInputs.country.value.trim()
    };

    if (payload.age && (payload.age < 1 || payload.age > 120)) {
      alert('Informe uma idade válida (1-120).');
      return;
    }

    try {
      await updateProfile(payload);
      setDisabled(true);
      toggleFormButtons(false);
    } catch (error) {
      console.error(error);
      alert('Não foi possível salvar o perfil.');
    }
  });

  setDisabled(true);
  toggleFormButtons(false);
}

function toggleFormButtons(editing) {
  const editBtn = document.getElementById('edit-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  if (!editBtn || !saveBtn || !cancelBtn) return;

  editBtn.style.display = editing ? 'none' : 'inline-flex';
  saveBtn.style.display = editing ? 'inline-flex' : 'none';
  cancelBtn.style.display = editing ? 'inline-flex' : 'none';
}

async function updateProfile(payload) {
  const response = await fetch(`${AUTH_BASE}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken()
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Erro ao atualizar perfil.');
  }

  const displayUsername = document.getElementById('display-username');
  if (payload.username && displayUsername) {
    displayUsername.textContent = payload.username;
  }
}

function setupAvatarSelector() {
  const avatarBtn = document.getElementById('change-avatar-btn');
  const closeBtn = document.getElementById('close-avatar-selector');
  const selector = document.getElementById('avatar-selector');
  const avatarOptions = document.querySelectorAll('.avatar-option');

  if (!selector) return;

  avatarBtn?.addEventListener('click', () => {
    selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
  });

  closeBtn?.addEventListener('click', () => {
    selector.style.display = 'none';
  });

  avatarOptions.forEach(option => {
    option.addEventListener('click', async () => {
      const avatarId = option.dataset.avatar;
      try {
        await updateProfile({ avatar: avatarId });
        const avatarImg = document.getElementById('avatar-img');
        if (avatarImg) avatarImg.src = `Profile Pictures/${avatarId}.jpg`;
        markSelectedOption(avatarId);
      } catch (error) {
        console.error(error);
        alert('Não foi possível atualizar o avatar.');
      }
    });
  });
}

function markSelectedOption(avatarId) {
  const avatarOptions = document.querySelectorAll('.avatar-option');
  avatarOptions.forEach(option => {
    option.classList.toggle('selected', option.dataset.avatar === avatarId);
  });
}

