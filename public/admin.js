const AUTH_BASE = '/api/auth';
const ADMIN_BASE = '/api/admin';

const getCsrfToken = () => {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const formatTime = (date) => new Date(date).toLocaleTimeString('pt-BR');

const formatDuration = (timestamp) => {
  const diff = Date.now() - timestamp;
  if (diff <= 0) return '0s';
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const select = (selector) => document.querySelector(selector);

const renderStats = (payload) => {
  select('#total-users').textContent = payload.onlineUsersCount ?? 0;
  select('#inactive-users').textContent = payload.inactiveUsersCount ?? 0;
  select('#queue-size').textContent = payload.queueSize ?? 0;
  select('#total-accounts').textContent = payload.totalAccounts ?? 0;
};

const createOnlineRow = (user) => {
  const tr = document.createElement('tr');

  const avatarTd = document.createElement('td');
  avatarTd.innerHTML = `
    <div class="user-avatar-small">
      <img src="Profile Pictures/${user.avatar}.jpg" alt="Avatar">
    </div>
  `;

  const nameTd = document.createElement('td');
  nameTd.textContent = user.username;

  const statusTd = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `status-badge ${user.status === 'active' ? 'status-active' : 'status-inactive'}`;
  badge.textContent = user.status === 'active' ? 'Ativo' : 'Inativo';
  statusTd.appendChild(badge);

  const idleTd = document.createElement('td');
  idleTd.textContent = user.status === 'inactive' ? formatDuration(user.lastActivity) : '-';

  const lastActivityTd = document.createElement('td');
  lastActivityTd.textContent = formatTime(user.lastActivity);

  tr.appendChild(avatarTd);
  tr.appendChild(nameTd);
  tr.appendChild(statusTd);
  tr.appendChild(idleTd);
  tr.appendChild(lastActivityTd);
  return tr;
};

const renderOnlineUsers = (payload) => {
  const tbody = select('#online-users-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!payload.onlineUsers || payload.onlineUsers.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'no-data';
    td.textContent = 'Nenhum usuário conectado.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  payload.onlineUsers.forEach((user) => {
    tbody.appendChild(createOnlineRow(user));
  });
};

const createQueueRow = (player, index) => {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${index + 1}</td>
    <td>
      <div class="user-avatar-small">
        <img src="Profile Pictures/${player.avatar}.jpg" alt="Avatar">
      </div>
    </td>
    <td>${player.username}</td>
    <td><span class="status-badge ${player.status === 'playing' ? 'status-playing' : 'status-waiting'}">
      ${player.status === 'playing' ? '🎮 Jogando' : '⏳ Aguardando'}
    </span></td>
    <td>
      <button class="admin-btn-small admin-btn-danger" data-remove="${player.userId}">
        Remover
      </button>
    </td>
  `;
  return tr;
};

const renderQueue = (payload) => {
  const tbody = select('#queue-table');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!payload.queue || payload.queue.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'no-data';
    td.textContent = 'Nenhum jogador na fila';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  payload.queue.forEach((player, index) => {
    tbody.appendChild(createQueueRow(player, index));
  });
};

const addLogEntry = (message, type = 'info') => {
  const logContainer = select('#activity-log');
  if (!logContainer) return;
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `
    <span class="log-time">${new Date().toLocaleString('pt-BR')}</span>
    <span class="log-message">${message}</span>
  `;
  logContainer.prepend(entry);
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
};

const ensureAdminSession = async () => {
  const response = await fetch(`${AUTH_BASE}/check-session`, { credentials: 'include' });
  const data = await response.json();
  if (!data.authenticated) {
    window.location.href = 'login.html';
    return null;
  }
  if (!data.user.isAdmin) {
    window.location.href = 'index.html';
    return null;
  }
  return data.user;
};

const initDarkMode = () => {
  const darkBtn = select('#dark-mode-btn');
  if (!darkBtn) return;
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

const initNavigation = () => {
  const backBtn = select('#back-to-game');
  backBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  const logoutBtn = select('#logout-btn');
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
};

const initAdminActions = () => {
  const clearBtn = select('#clear-queue-btn');
  clearBtn?.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja limpar toda a fila?')) return;
    try {
      const response = await fetch('/api/queue/clear', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        }
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Falha ao limpar fila.');
      } else {
        addLogEntry('Fila limpa pelo administrador', 'warning');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao limpar fila.');
    }
  });

  const deleteBtn = select('#delete-user-btn');
  deleteBtn?.addEventListener('click', async () => {
    const usernameInput = select('#delete-username');
    const reasonInput = select('#delete-reason');
    const confirmation = select('#confirm-delete');
    const username = usernameInput.value.trim();
    const reason = reasonInput.value.trim();

    if (!username) {
      alert('Informe o nome do usuário.');
      return;
    }
    if (!confirmation.checked) {
      alert('Confirme a exclusão marcando a caixa correspondente.');
      return;
    }
    if (!confirm(`Excluir ${username}? Essa ação não pode ser desfeita.`)) return;

    try {
      const response = await fetch(`${ADMIN_BASE}/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (data.success) {
        usernameInput.value = '';
        reasonInput.value = '';
        confirmation.checked = false;
        addLogEntry(`Usuário ${username} deletado`, 'danger');
      } else {
        alert(data.message || 'Não foi possível deletar o usuário.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao deletar usuário.');
    }
  });

  const queueTable = select('#queue-table');
  queueTable?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-remove]');
    if (!button) return;
    const userId = button.getAttribute('data-remove');
    if (!userId) return;
    try {
      const response = await fetch(`${ADMIN_BASE}/queue/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || 'Não foi possível remover da fila.');
      } else {
        addLogEntry(`Usuário ${userId} removido da fila`, 'warning');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao remover da fila.');
    }
  });
};

const initSocket = () => {
  const socket = io({ withCredentials: true });

  socket.on('auth_required', () => {
    window.location.href = 'login.html';
  });

  socket.on('admin_stats', (payload) => {
    renderStats(payload);
    renderOnlineUsers(payload);
    renderQueue(payload);
  });
};

const initAdminPanel = async () => {
  const user = await ensureAdminSession();
  if (!user) return;
  initDarkMode();
  initNavigation();
  initAdminActions();
  initSocket();
  addLogEntry(`Bem-vindo, ${user.username}`);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
  initAdminPanel();
}

