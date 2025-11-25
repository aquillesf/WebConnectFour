require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');

const connectDB = require('./config/database');
const QueueManager = require('./utils/queueManager');
const User = require('./models/User');
const Game = require('./models/Game');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');
const Connect4Bot = require('./utils/botAI');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

connectDB();

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

const publicDir = path.join(__dirname, 'public');
const userSockets = new Map();
const activeGames = new Map();
const botGames = new Map();
const onlineUsers = new Map();
const adminSockets = new Set();
const ADMIN_INACTIVITY_MS = parseInt(process.env.ADMIN_INACTIVITY_MS, 10) || 5 * 60 * 1000;

const ROWS = 6;
const COLS = 7;

const createBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const dropPiece = (board, column, token) => {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === 0) {
      board[row][column] = token;
      return row;
    }
  }
  return -1;
};

const isBoardFull = (board) => board.every(row => row.every(cell => cell !== 0));

const countDirection = (board, row, col, dr, dc, token) => {
  let r = row + dr;
  let c = col + dc;
  let count = 0;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === token) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
};

const hasConnectFour = (board, row, col, token) => {
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 }
  ];

  return directions.some(({ dr, dc }) => {
    const total = 1 + countDirection(board, row, col, dr, dc, token) + countDirection(board, row, col, -dr, -dc, token);
    return total >= 4;
  });
};

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true
}));
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:'],
      'script-src': ["'self'"],
      'connect-src': ["'self'", 'ws:', 'wss:']
    }
  },
  crossOriginResourcePolicy: false
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());
app.use(sessionMiddleware);
app.use(csrf({ cookie: true }));

app.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken(), {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  next();
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

const queueManager = new QueueManager(io);

const attachQueueToRequest = (req, res, next) => {
  req.queueManager = queueManager;
  next();
};

app.use(attachQueueToRequest);

const touchOnlineUser = (userId, data = {}) => {
  if (!userId) return;
  const existing = onlineUsers.get(userId) || {
    userId,
    username: '',
    avatar: '1',
    isAdmin: false,
    connectedAt: Date.now()
  };
  onlineUsers.set(userId, {
    ...existing,
    ...data,
    lastActivity: Date.now()
  });
};

const serializeOnlineUsers = () => {
  const now = Date.now();
  return Array.from(onlineUsers.values()).map(user => ({
    userId: user.userId,
    username: user.username,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    lastActivity: user.lastActivity,
    status: now - user.lastActivity > ADMIN_INACTIVITY_MS ? 'inactive' : 'active'
  }));
};

const emitAdminStats = async () => {
  if (adminSockets.size === 0) return;
  const onlineSnapshot = serializeOnlineUsers();
  const inactiveUsersCount = onlineSnapshot.filter(u => u.status === 'inactive').length;
  const state = queueManager.getState();
  const totalAccounts = await User.countDocuments();

  const payload = {
    timestamp: Date.now(),
    totalAccounts,
    onlineUsersCount: onlineSnapshot.length,
    inactiveUsersCount,
    queueSize: state.queueSize,
    onlineUsers: onlineSnapshot,
    queue: state.queue.map(player => ({
      userId: player.userId,
      username: player.username,
      avatar: player.avatar,
      status: player.status,
      joinedAt: player.joinedAt
    }))
  };

  adminSockets.forEach(socketId => {
    io.to(socketId).emit('admin_stats', payload);
  });
};

const emitAdminStatsSafe = () => {
  emitAdminStats().catch(err => console.error('Erro ao emitir estatísticas admin:', err));
};

queueManager.setChangeCallback(emitAdminStatsSafe);


const publicPages = ['/login.html', '/signup.html'];

app.use((req, res, next) => {
  if (req.path.match(/\.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return next();
  }

  if (req.path.startsWith('/socket.io/')) {
    return next();
  }

  if (publicPages.includes(req.path)) {
    if (req.session.userId) {
      return res.redirect('/index.html');
    }
    return next();
  }

  if (!req.session.userId) {
    return res.redirect('/login.html');
  }

  if (req.path === '/admin.html' && !req.session.isAdmin) {
    return res.redirect('/index.html');
  }

  next();
});


app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  if (req.session.isAdmin) {
    return res.redirect('/admin.html');
  }
  return res.redirect('/index.html');
});

app.get('/login.html', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/signup.html', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(publicDir, 'signup.html'));
});

app.get('/index.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/profile.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(publicDir, 'profile.html'));
});

app.get('/admin.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  if (!req.session.isAdmin) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.use(express.static('public'));


app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

app.post('/api/queue/join', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Faça login primeiro!'
    });
  }
  touchOnlineUser(req.session.userId.toString(), {
    username: req.session.username,
    avatar: req.session.avatar || '1',
    isAdmin: req.session.isAdmin
  });

  const result = queueManager.addToQueue(
    req.session.userId.toString(),
    req.session.username,
    req.session.avatar || '1'
  );

  emitAdminStatsSafe();
  return res.json(result);
});

app.post('/api/queue/leave', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Faça login primeiro!'
    });
  }
  touchOnlineUser(req.session.userId.toString(), {
    username: req.session.username,
    avatar: req.session.avatar || '1',
    isAdmin: req.session.isAdmin
  });

  const result = queueManager.removeFromQueue(req.session.userId.toString());
  emitAdminStatsSafe();
  return res.json(result);
});

app.get('/api/queue/state', (req, res) => {
  const state = queueManager.getState();
  return res.json({ success: true, ...state });
});

app.post('/api/queue/clear', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Apenas administradores podem limpar a fila!'
    });
  }

  const result = queueManager.clearQueue();
  emitAdminStatsSafe();
  return res.json(result);
});

app.post('/api/admin/queue/remove', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Apenas administradores podem remover jogadores da fila!'
    });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'Informe o ID do usuário a ser removido.'
    });
  }

  const result = queueManager.removeFromQueue(userId);
  emitAdminStatsSafe();
  return res.json(result);
});

const leaderboardProjection = async () => {
  const users = await User.find()
    .select('username avatar stats')
    .sort({ 'stats.points': -1 })
    .limit(10);

  return users.map(user => ({
    name: user.username,
    avatar: user.avatar,
    wins: user.stats.wins,
    losses: user.stats.losses,
    points: user.stats.points
  }));
};

const broadcastLeaderboard = async () => {
  try {
    const leaderboard = await leaderboardProjection();
    io.emit('leaderboard_update', leaderboard);
  } catch (error) {
    console.error('Erro ao enviar leaderboard:', error);
  }
};

const getMatchByUser = (userId) => {
  for (const match of activeGames.values()) {
    if (match.player1.userId === userId || match.player2.userId === userId) {
      return match;
    }
  }
  return null;
};

const finalizeMatch = async (match, result) => {
  if (!match || match.status === 'finished') return;

  match.status = 'finished';
  const isBot = match.gameMode === 'single';
  
  if (isBot) {
    botGames.delete(match.id);
  } else {
    activeGames.delete(match.id);
  }

  io.to(match.id).emit('game_over', {
    gameId: match.id,
    winnerId: result.winnerId || null,
    draw: Boolean(result.draw),
    reason: result.reason || 'finished',
    vsBot: isBot
  });
  io.in(match.id).socketsLeave(match.id);

  try {
    await Game.findByIdAndUpdate(match.id, {
      status: 'finished',
      winner: result.winnerId || undefined,
      boardPosition: JSON.stringify(match.board),
      startedAt: match.startedAt,
      finishedAt: new Date()
    });

    if (result.winnerId && !isBot) {
      const loserId = result.winnerId === match.player1.userId
        ? match.player2.userId
        : match.player1.userId;

      await Promise.all([
        User.findByIdAndUpdate(result.winnerId, {
          $inc: { 'stats.wins': 1, 'stats.points': 10 },
          lastActivity: new Date()
        }),
        loserId
          ? User.findByIdAndUpdate(loserId, {
              $inc: { 'stats.losses': 1 },
              lastActivity: new Date()
            })
          : Promise.resolve()
      ]);

      await broadcastLeaderboard();
    }
  } catch (error) {
    console.error('Erro ao finalizar partida:', error);
  } finally {
    if (!isBot) {
      queueManager.finishGame(result.winnerId || null);
      emitAdminStatsSafe();
    }
  }
};

const startBotMatch = async (socket, userId, username, avatar, difficulty = 'medium') => {
  try {
    const game = await Game.create({
      player1: userId,
      gameMode: 'single',
      status: 'playing',
      startedAt: new Date()
    });

    const match = {
      id: game._id.toString(),
      player1: { userId, username, avatar },
      player2: { userId: 'bot', username: 'Bot', avatar: '1' },
      board: createBoard(),
      status: 'playing',
      startedAt: game.startedAt,
      gameMode: 'single',
    };

    botGames.set(match.id, match);
    socket.join(match.id);

    socket.emit('match_start', {
      gameId: match.id,
      youAre: 'player1',
      currentTurn: match.currentTurn,
      opponent: {
        username: 'Bot',
        avatar: '1'
      },
      board: match.board,
      vsBot: true
    });

    socket.emit('game_status', {
      message: 'Sua vez de jogar! Jogo contra o Bot iniciado.'
    });

  } catch (error) {
    console.error('Erro ao iniciar partida com bot:', error);
    socket.emit('error', { message: 'Erro ao iniciar jogo com bot.' });
  }
};


const startMatch = async ({ player1, player2 }) => {
  const p1Socket = userSockets.get(player1.userId);
  const p2Socket = userSockets.get(player2.userId);

  if (!p1Socket || !p2Socket) {
    console.warn('Jogadores ausentes no socket. Encerrando partida antes de iniciar.');
    queueManager.finishGame();
    return;
  }

  try {
    const game = await Game.create({
      player1: player1.userId,
      player2: player2.userId,
      gameMode: 'two-player',
      status: 'playing',
      startedAt: new Date()
    });

    const match = {
      id: game._id.toString(),
      player1,
      player2,
      board: createBoard(),
      currentTurn: player1.userId,
      status: 'playing',
      startedAt: game.startedAt
    };

    activeGames.set(match.id, match);

    [p1Socket, p2Socket].forEach(sock => sock.join(match.id));

    p1Socket.emit('match_start', {
      gameId: match.id,
      youAre: 'player1',
      currentTurn: match.currentTurn,
      opponent: {
        username: player2.username,
        avatar: player2.avatar
      },
      board: match.board
    });

    p2Socket.emit('match_start', {
      gameId: match.id,
      youAre: 'player2',
      currentTurn: match.currentTurn,
      opponent: {
        username: player1.username,
        avatar: player1.avatar
      },
      board: match.board
    });
  } catch (error) {
    console.error('Erro ao iniciar partida:', error);
    queueManager.finishGame();
  }
};

queueManager.setMatchReadyCallback(startMatch);
queueManager.setInactiveCallback((userId) => {
  const match = getMatchByUser(userId);
  if (match && match.status === 'playing') {
    const winnerId = userId === match.player1.userId ? match.player2.userId : match.player1.userId;
    finalizeMatch(match, { winnerId, reason: 'inactivity' });
    return;
  }
  queueManager.removeFromQueue(userId);
});

const handlePlayerMove = async (socket, userId, payload) => {
  const { gameId, column } = payload || {};
  
  let match = activeGames.get(gameId) || botGames.get(gameId);
  const isBot = match?.gameMode === 'single';

  if (!match || match.status !== 'playing') return;
  
  if (!isBot && ![match.player1.userId, match.player2.userId].includes(userId)) return;
  if (isBot && match.player1.userId !== userId) return;

  if (match.currentTurn !== userId) {
    socket.emit('move_rejected', { reason: 'Aguarde sua vez.' });
    return;
  }

  if (typeof column !== 'number' || column < 0 || column >= COLS) {
    socket.emit('move_rejected', { reason: 'Coluna inválida.' });
    return;
  }

  const token = isBot ? 1 : (userId === match.player1.userId ? 1 : 2);
  const row = dropPiece(match.board, column, token);

  if (row === -1) {
    socket.emit('move_rejected', { reason: 'Coluna cheia.' });
    return;
  }

  if (!isBot) {
    queueManager.renewActivity(userId);
  }

  if (!isBot) {
    match.currentTurn = userId === match.player1.userId 
      ? match.player2.userId 
      : match.player1.userId;
  }

  io.to(match.id).emit('game_update', {
    gameId: match.id,
    board: match.board,
    currentTurn: isBot ? 'bot' : match.currentTurn,
    lastMove: { row, column, playerId: userId }
  });

  if (hasConnectFour(match.board, row, column, token)) {
    finalizeMatch(match, { winnerId: userId, reason: 'victory' });
    return;
  }

  if (isBoardFull(match.board)) {
    finalizeMatch(match, { draw: true, reason: 'draw' });
    return;
  }

  if (isBot) {
    socket.emit('game_status', { message: 'Bot está pensando...' });
    setTimeout(() => makeBotMove(match, socket), 800);
  }
};

const makeBotMove = (match, socket) => {
  if (!match || match.status !== 'playing') return;

  const botMove = match.bot.makeMove(match.board);
  
  if (botMove === null) {
    finalizeMatch(match, { draw: true, reason: 'draw' });
    return;
  }

  
  if (row === -1) return;

  io.to(match.id).emit('game_update', {
    gameId: match.id,
    board: match.board,
    currentTurn: match.player1.userId,
    lastMove: { row, column: botMove, playerId: 'bot' }
  });

  socket.emit('game_status', { message: 'Sua vez de jogar!' });

  if (hasConnectFour(match.board, row, botMove, 2)) {
    finalizeMatch(match, { winnerId: 'bot', reason: 'victory' });
    return;
  }

  if (isBoardFull(match.board)) {
    finalizeMatch(match, { draw: true, reason: 'draw' });
    return;
  }

  match.currentTurn = match.player1.userId;
};

const handleDisconnect = (userId) => {
  userSockets.delete(userId);
  queueManager.removeFromQueue(userId);

  const match = getMatchByUser(userId);
  if (match && match.status === 'playing') {
    const winnerId = userId === match.player1.userId ? match.player2.userId : match.player1.userId;
    finalizeMatch(match, { winnerId, reason: 'disconnect' });
  }

  for (const [gameId, botMatch] of botGames.entries()) {
    if (botMatch.player1.userId === userId && botMatch.status === 'playing') {
      finalizeMatch(botMatch, { winnerId: 'bot', reason: 'disconnect' });
      break;
    }
  }
};

io.on('connection', async (socket) => {
  const sessionData = socket.request.session;
  socket.on('start_bot_game', ({ difficulty }) => {
    touchOnlineUser(userId);
    startBotMatch(socket, userId, sessionData.username, sessionData.avatar || '1', difficulty);
  });
  
  if (!sessionData || !sessionData.userId) {
    socket.emit('auth_required');
    socket.disconnect(true);
    return;
  }

  const userId = sessionData.userId.toString();
  socket.userId = userId;
  userSockets.set(userId, socket);
  touchOnlineUser(userId, {
    userId,
    username: sessionData.username,
    avatar: sessionData.avatar || '1',
    isAdmin: sessionData.isAdmin
  });
  if (sessionData.isAdmin) {
    adminSockets.add(socket.id);
  }
  emitAdminStatsSafe();

  socket.emit('queue_update', {
    queue: queueManager.queue,
    queueSize: queueManager.queue.length,
    maxSize: queueManager.maxQueueSize
  });

  socket.emit('current_players', queueManager.currentPlayers);

  try {
    const leaderboard = await leaderboardProjection();
    socket.emit('leaderboard_update', leaderboard);
  } catch (error) {
    console.error('Erro ao enviar leaderboard inicial:', error);
  }

  socket.on('player_move', (payload) => {
    touchOnlineUser(userId);
    handlePlayerMove(socket, userId, payload);
  });
  socket.on('resign', (payload) => {
    touchOnlineUser(userId);
    handleResign(userId, payload || {});
  });
  socket.on('heartbeat', () => {
    touchOnlineUser(userId);
    queueManager.renewActivity(userId);
  });

  socket.on('webrtc_offer', ({ offer }) => {
    const match = getMatchByUser(userId);
    if (!match) return;

    const opponentId = userId === match.player1.userId 
      ? match.player2.userId 
      : match.player1.userId;

    const opponentSocket = userSockets.get(opponentId);
    if (opponentSocket) {
      opponentSocket.emit('webrtc_offer', { offer });
      console.log(`📤 WebRTC offer: ${userId} → ${opponentId}`);
    }
  });

  socket.on('webrtc_answer', ({ answer }) => {
    const match = getMatchByUser(userId);
    if (!match) return;

    const opponentId = userId === match.player1.userId 
      ? match.player2.userId 
      : match.player1.userId;

    const opponentSocket = userSockets.get(opponentId);
    if (opponentSocket) {
      opponentSocket.emit('webrtc_answer', { answer });
      console.log(`📤 WebRTC answer: ${userId} → ${opponentId}`);
    }
  });

  socket.on('webrtc_ice_candidate', ({ candidate }) => {
    const match = getMatchByUser(userId);
    if (!match) return;

    const opponentId = userId === match.player1.userId 
      ? match.player2.userId 
      : match.player1.userId;

    const opponentSocket = userSockets.get(opponentId);
    if (opponentSocket) {
      opponentSocket.emit('webrtc_ice_candidate', { candidate });
    }
  });

  socket.on('disconnect', () => {
    if (sessionData.isAdmin) {
      adminSockets.delete(socket.id);
    }
    onlineUsers.delete(userId);
    emitAdminStatsSafe();
    handleDisconnect(userId);
  });
});

setInterval(() => {
  queueManager.checkInactivity();
}, 10000);

app.use((req, res, next) => {
  if (req.accepts('html')) {
    return res.redirect('/login.html');
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Rota não encontrada' });
  }
  next();
});

app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor.'
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 Connect 4 Backend Server        ║
║   🚀 Servidor rodando na porta ${PORT}  ║
║   📡 Socket.IO habilitado            ║
║   💾 MongoDB conectado               ║
║   🔒 Autenticação ativa              ║
╚═══════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };