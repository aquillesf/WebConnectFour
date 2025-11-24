require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const QueueManager = require('./utils/queueManager');

// Rotas
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Conectar ao MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Para servir arquivos estáticos (HTML, CSS, JS)

// Configurar sessões
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600 // 24 horas
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Inicializar gerenciador de fila
const queueManager = new QueueManager(io);

// Middleware para disponibilizar queueManager nas rotas
app.use((req, res, next) => {
  req.queueManager = queueManager;
  next();
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

// Rota raiz
app.get('/', (req, res) => {
  res.send('<h1>Connect 4 Backend API</h1><p>Servidor funcionando! 🎮</p>');
});

// Rotas de fila
app.post('/api/queue/join', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Faça login primeiro!' 
    });
  }

  const result = queueManager.addToQueue(
    req.session.userId,
    req.session.username,
    req.session.avatar || '1'
  );

  res.json(result);
});

app.post('/api/queue/leave', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Faça login primeiro!' 
    });
  }

  const result = queueManager.removeFromQueue(req.session.userId);
  res.json(result);
});

app.get('/api/queue/state', (req, res) => {
  const state = queueManager.getState();
  res.json({ success: true, ...state });
});

app.post('/api/queue/clear', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Apenas administradores podem limpar a fila!' 
    });
  }

  const result = queueManager.clearQueue();
  res.json(result);
});

// Socket.IO para comunicação em tempo real
io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);

  // Enviar estado atual da fila ao conectar
  socket.emit('queue_update', {
    queue: queueManager.queue,
    queueSize: queueManager.queue.length,
    maxSize: queueManager.maxQueueSize
  });

  socket.emit('current_players', {
    player1: queueManager.currentPlayers.player1,
    player2: queueManager.currentPlayers.player2
  });

  // Jogador fez movimento (renovar atividade)
  socket.on('player_move', (data) => {
    if (data.userId) {
      queueManager.renewActivity(data.userId);
    }
  });

  // Jogador venceu
  socket.on('game_won', (data) => {
    console.log(`🏆 Jogador ${data.winnerId} venceu!`);
    queueManager.finishGame(data.winnerId);
  });

  // Heartbeat para manter atividade
  socket.on('heartbeat', (data) => {
    if (data.userId) {
      queueManager.renewActivity(data.userId);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// Verificar inatividade a cada 10 segundos
setInterval(() => {
  queueManager.checkInactivity();
}, 10000);

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Erro interno do servidor.' 
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 Connect 4 Backend Server        ║
║   🚀 Servidor rodando na porta ${PORT}  ║
║   📡 Socket.IO habilitado            ║
║   💾 MongoDB conectado               ║
╚═══════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };