const API_BASE = '/api';
const AUTH_BASE = `${API_BASE}/auth`;
const GAME_BASE = `${API_BASE}/game`;
const QUEUE_BASE = `${API_BASE}/queue`;
const BOARD_ROWS = 6;
const BOARD_COLS = 7;
const BOARD_THEMES = [
  { id: 'classic', board: '#0d47a1', accent: '#ffca28', playerOne: '#ff5252', playerTwo: '#ffee58' },
  { id: 'neon', board: '#272640', accent: '#33ffbb', playerOne: '#ffd60a', playerTwo: '#64dfdf' },
  { id: 'forest', board: '#1b4332', accent: '#95d5b2', playerOne: '#f77f00', playerTwo: '#e9c46a' }
];

const STORAGE_KEYS = {
  darkMode: 'darkMode',
  boardTheme: 'boardTheme'
};

const getCsrfToken = () => {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const state = {
  user: null,
  socket: null,
  board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(0)),
  currentPlayers: null,
  queue: [],
  leaderboard: [],
  match: null,
  inQueue: false
};

let currentGameMode = 'two-player'; // 'single' ou 'two-player'

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  try {
    await ensureSession();
    setupDarkMode();
    setupStaticButtons();
    setupResignPanel();
    setupThemeCycler();
    drawBoard();
    setupBoardInteraction();
    await Promise.all([loadLeaderboard(), loadQueueSnapshot()]);
    setupSocket();
    updateStatus('Escolha um modo de jogo: Bot (prática) ou Multiplayer (competitivo).');
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
  state.user = data.user;
}

function setupDarkMode() {
  const toggleBtn = document.getElementById('dark-mode-btn');
  if (!toggleBtn) {
    return;
  }
  let darkMode = localStorage.getItem(STORAGE_KEYS.darkMode) === 'true';
  document.body.classList.toggle('dark', darkMode);
  toggleBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';
  toggleBtn.addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem(STORAGE_KEYS.darkMode, String(darkMode));
    toggleBtn.textContent = darkMode ? 'Modo Claro' : 'Modo Escuro';
  });
}

function setupStaticButtons() {
  const profileBtn = document.getElementById('profile-btn');
  profileBtn?.addEventListener('click', () => {
    window.location.href = 'profile.html';
  });

  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      const response = await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken()
        }
      });
      const data = await response.json();
      if (data.success) {
        window.location.href = 'login.html';
      } else {
        alert(data.message || 'Não foi possível sair da conta.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao sair. Tente novamente.');
    }
  });

  const startBtn = document.getElementById('start-game');
  startBtn?.addEventListener('click', () => {
    // Pega o modo selecionado
    const modeRadio = document.querySelector('input[name="game-mode"]:checked');
    if (modeRadio) {
      currentGameMode = modeRadio.value;
    }

    if (currentGameMode === 'single') {
      // Inicia jogo contra bot
      startBotGame();
    } else {
      // Entra na fila multiplayer
      joinQueue();
    }
  });

  const joinBtn = document.getElementById('join-queue-btn');
  joinBtn?.addEventListener('click', joinQueue);

  const leaveBtn = document.getElementById('leave-queue-btn');
  leaveBtn?.addEventListener('click', leaveQueue);

  const refreshBtn = document.getElementById('refresh-leaderboard');
  refreshBtn?.addEventListener('click', loadLeaderboard);
}

function setupResignPanel() {
  const resignBtn = document.getElementById('resign');
  const panel = document.getElementById('resign-panel');
  const yesBtn = document.getElementById('yes');
  const noBtn = document.getElementById('no');
  if (!resignBtn || !panel) return;

  const hidePanel = () => panel.setAttribute('hidden', 'hidden');
  const showPanel = () => panel.removeAttribute('hidden');

  resignBtn.addEventListener('click', () => {
    if (!state.match) {
      updateStatus('Você precisa estar em partida para desistir.');
      return;
    }
    showPanel();
  });

  noBtn?.addEventListener('click', hidePanel);
  yesBtn?.addEventListener('click', () => {
    hidePanel();
    if (state.socket && state.match) {
      state.socket.emit('resign', { gameId: state.match.gameId });
    }
  });
}

function setupThemeCycler() {
  const themeBtn = document.getElementById('theme-change');
  if (!themeBtn) return;
  themeBtn.addEventListener('click', () => {
    const current = parseInt(localStorage.getItem(STORAGE_KEYS.boardTheme) || '0', 10);
    const next = (current + 1) % BOARD_THEMES.length;
    localStorage.setItem(STORAGE_KEYS.boardTheme, String(next));
    drawBoard();
  });
}

async function loadLeaderboard() {
  try {
    const response = await fetch(`${GAME_BASE}/leaderboard`, { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
      state.leaderboard = data.leaderboard;
      renderLeaderboard();
    }
  } catch (error) {
    console.error('Erro ao carregar leaderboard:', error);
  }
}

async function loadQueueSnapshot() {
  try {
    const response = await fetch(`${QUEUE_BASE}/state`, { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
      state.queue = data.queue || [];
      renderQueue();
      updateQueueButtons();
    }
  } catch (error) {
    console.error('Erro ao carregar fila:', error);
  }
}

function setupSocket() {
  state.socket = io({ withCredentials: true });

  state.socket.on('auth_required', () => {
    window.location.href = 'login.html';
  });

  state.socket.on('queue_update', (payload) => {
    state.queue = payload.queue || [];
    renderQueue();
    updateQueueButtons();
  });

  state.socket.on('leaderboard_update', (payload) => {
    state.leaderboard = payload || [];
    renderLeaderboard();
  });

  state.socket.on('current_players', (payload) => {
    state.currentPlayers = payload;
    updatePlayerBadges();
  });

  state.socket.on('match_start', (payload) => {
    state.match = {
      gameId: payload.gameId,
      role: payload.youAre,
      board: payload.board,
      currentTurn: payload.currentTurn,
      opponent: payload.opponent,
      vsBot: payload.vsBot || false
    };
    state.board = payload.board;
    state.inQueue = false;
    drawBoard();
    
    const isMyTurn = state.match.currentTurn === state.user.id;
    const gameType = state.match.vsBot ? 'contra o Bot' : 'multiplayer';
    const turnMsg = isMyTurn ? 'Você começa! Faça sua jogada.' : 'Aguarde a sua vez.';
    
    updateStatus(`Partida ${gameType} iniciada. ${turnMsg}`);
    updatePlayerBadges();
    updateQueueButtons();
  });

  state.socket.on('game_update', (payload) => {
    if (!state.match || state.match.gameId !== payload.gameId) return;
    
    state.board = payload.board;
    state.match.currentTurn = payload.currentTurn;
    drawBoard();
    
    if (state.match.vsBot) {
      // Jogo contra bot
      if (payload.currentTurn === state.user.id) {
        updateStatus('Sua vez de jogar!');
      } else if (payload.currentTurn === 'bot') {
        updateStatus('Bot está pensando...');
      }
    } else {
      // Jogo multiplayer
      const isMyTurn = state.match.currentTurn === state.user.id;
      updateStatus(isMyTurn ? 'Sua vez de jogar!' : 'Aguardando o adversário...');
    }
  });

  state.socket.on('game_over', (payload) => {
    if (state.match && state.match.gameId === payload.gameId) {
      const youWon = payload.winnerId === state.user.id;
      const vsBot = payload.vsBot || state.match.vsBot;
      
      if (payload.draw) {
        updateStatus('Partida empatada! ' + (vsBot ? 'Jogue novamente.' : 'Entre na fila novamente.'));
      } else if (payload.winnerId === 'bot') {
        updateStatus('O Bot venceu! Tente novamente.');
      } else if (payload.winnerId) {
        if (vsBot) {
          updateStatus(youWon ? 'Você venceu o Bot! 🎉 (Sem pontos no modo prática)' : 'Você perdeu. Continue tentando!');
        } else {
          updateStatus(youWon ? 'Você venceu! 🎉 (+10 pontos)' : 'Você perdeu. Continue tentando!');
        }
      } else {
        updateStatus('Partida encerrada.');
      }
    }
    state.match = null;
    updatePlayerBadges();
    updateQueueButtons();
  });

  state.socket.on('game_status', (payload) => {
    if (payload.message) {
      updateStatus(payload.message);
    }
  });

  state.socket.on('move_rejected', (payload) => {
    if (payload?.reason) {
      updateStatus(payload.reason);
    }
  });

  state.socket.on('error', (payload) => {
    if (payload?.message) {
      updateStatus(`Erro: ${payload.message}`);
    }
  });
}

function startBotGame() {
  if (state.match || state.inQueue) {
    updateStatus('Você já está em uma partida ou na fila!');
    return;
  }

  state.socket.emit('start_bot_game');
  updateStatus('Iniciando jogo contra o Bot...');
}

async function joinQueue() {
  if (state.inQueue) return;
  if (state.match) {
    updateStatus('Você já está em uma partida!');
    return;
  }
  
  try {
    const response = await fetch(`${QUEUE_BASE}/join`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    const data = await response.json();
    if (!data.success) {
      updateStatus(data.message || 'Não foi possível entrar na fila.');
      return;
    }
    state.inQueue = true;
    updateStatus('Você entrou na fila. Aguarde a sua vez para jogar multiplayer.');
    updateQueueButtons();
  } catch (error) {
    console.error(error);
    updateStatus('Erro ao entrar na fila.');
  }
}

async function leaveQueue() {
  try {
    const response = await fetch(`${QUEUE_BASE}/leave`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken()
      }
    });
    const data = await response.json();
    if (!data.success) {
      updateStatus(data.message || 'Não foi possível sair da fila.');
      return;
    }
    state.inQueue = false;
    updateStatus('Você saiu da fila.');
    updateQueueButtons();
  } catch (error) {
    console.error(error);
    updateStatus('Erro ao sair da fila.');
  }
}

function renderQueue() {
  const list = document.getElementById('queue-list');
  const sizeLabel = document.getElementById('queue-size');
  if (!list) return;
  sizeLabel.textContent = String(state.queue.length);

  if (!state.queue.length) {
    list.innerHTML = '<li class="queue-item"><span class="queue-status">Nenhum jogador na fila</span></li>';
    return;
  }

  const fragment = state.queue.map((player) => {
    const statusText = player.status === 'playing' ? '🎮 Jogando' : '⏳ Aguardando';
    const statusClass = player.status === 'playing' ? 'status-playing' : 'status-waiting';
    return `
      <li class="queue-item ${player.status === 'playing' ? 'playing' : ''}">
        <span class="queue-position">${player.position}</span>
        <div class="queue-avatar">
          <img src="Profile Pictures/${player.avatar}.jpg" alt="Avatar">
        </div>
        <div class="queue-info">
          <p class="queue-name">${player.username}</p>
          <span class="queue-status ${statusClass}">${statusText}</span>
        </div>
      </li>
    `;
  }).join('');

  list.innerHTML = fragment;

  state.inQueue = state.queue.some(player => player.userId === state.user.id);
}

function renderLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;

  if (!state.leaderboard.length) {
    listEl.innerHTML = '<li class="leaderboard-item"><span class="leaderboard-name">Sem dados ainda.</span></li>';
    return;
  }

  const content = state.leaderboard.map((player, index) => `
    <li class="leaderboard-item">
      <span class="leaderboard-rank ${rankClass(index)}">${index + 1}</span>
      <div class="leaderboard-avatar">
        <img src="Profile Pictures/${player.avatar}.jpg" alt="Avatar">
      </div>
      <div class="leaderboard-info">
        <p class="leaderboard-name">${player.name}</p>
        <span class="leaderboard-score">${player.wins} vitórias</span>
      </div>
      <span class="leaderboard-points">${player.points} pts</span>
    </li>
  `).join('');

  listEl.innerHTML = content;
}

function rankClass(position) {
  if (position === 0) return 'gold';
  if (position === 1) return 'silver';
  if (position === 2) return 'bronze';
  return '';
}

function updateQueueButtons() {
  const joinBtn = document.getElementById('join-queue-btn');
  const leaveBtn = document.getElementById('leave-queue-btn');
  if (!joinBtn || !leaveBtn) return;

  const isPlaying = Boolean(state.match);

  joinBtn.disabled = state.inQueue || isPlaying;
  joinBtn.textContent = state.inQueue ? 'Na fila...' : 'Entrar na Fila';
  leaveBtn.style.display = state.inQueue ? 'inline-flex' : 'none';
}

function updateStatus(message) {
  const statusEl = document.getElementById('mode-feedback');
  const matchStatus = document.getElementById('match-status');
  if (statusEl) statusEl.textContent = message;
  if (matchStatus) matchStatus.textContent = message;
}

function updatePlayerBadges() {
  const container = document.getElementById('match-players');
  if (!container) return;

  if (state.match) {
    const opponentLabel = state.match.vsBot ? 'Bot' : 'Adversário';
    container.innerHTML = `
      ${playerPill(state.user.username, state.user.avatar || '1', true, 'Você')}
      ${playerPill(state.match.opponent.username, state.match.opponent.avatar || '1', false, opponentLabel)}
    `;
    return;
  }

  const player1 = state.currentPlayers?.player1;
  const player2 = state.currentPlayers?.player2;

  if (!player1 && !player2) {
    container.innerHTML = '<p>Nenhuma partida em andamento. Jogue contra o bot ou entre na fila!</p>';
    return;
  }

  const fallback = [player1, player2]
    .filter(Boolean)
    .map(player => playerPill(player.username, player.avatar || '1', player.username === state.user?.username, 'Jogando'))
    .join('');

  container.innerHTML = fallback;
}

function playerPill(name, avatar, isSelf, label) {
  return `
    <div class="player-pill ${isSelf ? 'self' : ''}">
      <div class="avatar">
        <img src="Profile Pictures/${avatar}.jpg" alt="${name}">
      </div>
      <div>
        <p class="label">${name}</p>
        <p class="sub-label">${label}</p>
      </div>
    </div>
  `;
}

function drawBoard() {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const themeIndex = parseInt(localStorage.getItem(STORAGE_KEYS.boardTheme) || '0', 10) % BOARD_THEMES.length;
  const theme = BOARD_THEMES[themeIndex];

  const cellWidth = canvas.width / BOARD_COLS;
  const cellHeight = canvas.height / BOARD_ROWS;
  const radius = Math.min(cellWidth, cellHeight) / 2.5;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = theme.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const x = col * cellWidth + cellWidth / 2;
      const y = row * cellHeight + cellHeight / 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      const cellValue = state.board[row]?.[col];
      if (cellValue === 1) {
        ctx.fillStyle = theme.playerOne;
      } else if (cellValue === 2) {
        ctx.fillStyle = theme.playerTwo;
      } else {
        ctx.fillStyle = '#f8f9fb';
      }
      ctx.fill();
    }
  }

  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
}

function setupBoardInteraction() {
  const canvas = document.getElementById('game');
  if (!canvas) return;

  canvas.addEventListener('click', (event) => {
    if (!state.match || !state.socket) {
      updateStatus('Selecione um modo de jogo: Bot (prática) ou Multiplayer (fila).');
      return;
    }

    // Verifica se é a vez do jogador
    if (state.match.vsBot) {
      // Jogo contra bot - verifica se é a vez do jogador
      if (state.match.currentTurn !== state.user.id) {
        updateStatus('Aguarde o bot jogar.');
        return;
      }
    } else {
      // Jogo multiplayer
      if (state.match.currentTurn !== state.user.id) {
        updateStatus('Aguarde o adversário.');
        return;
      }
    }

    const rect = canvas.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const column = Math.floor((relativeX / canvas.width) * BOARD_COLS);

    state.socket.emit('player_move', {
      gameId: state.match.gameId,
      column
    });
  });
}