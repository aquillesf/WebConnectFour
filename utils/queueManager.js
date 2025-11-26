const User = require('../models/User');

class QueueManager {
  constructor(io) {
    this.io = io;
    this.queue = [];
    this.maxQueueSize = parseInt(process.env.QUEUE_MAX_SIZE) || 25;
    this.inactivityTimers = new Map();
    this.currentPlayers = { player1: null, player2: null };
    this.matchReadyCallback = null;
    this.inactiveCallback = null;
    this.changeCallback = null;
    this.matchInProgress = false;
    this.inactivityTimeout = parseInt(process.env.INACTIVITY_TIMEOUT) || 60000;
  }

  setMatchReadyCallback(callback) {
    this.matchReadyCallback = callback;
  }

  setInactiveCallback(callback) {
    this.inactiveCallback = callback;
  }

  setChangeCallback(callback) {
    this.changeCallback = callback;
  }

  async addToQueue(userId, username, avatar) {
    if (this.queue.find(p => p.userId === userId)) {
      return { success: false, message: 'Você já está na fila!' };
    }

    if (this.currentPlayers.player1?.userId === userId || 
        this.currentPlayers.player2?.userId === userId) {
      return { success: false, message: 'Você já está em uma partida!' };
    }

    if (this.queue.length >= this.maxQueueSize) {
      return { success: false, message: 'Fila cheia! Tente novamente mais tarde.' };
    }

    const player = {
      userId,
      username,
      avatar,
      status: 'waiting',
      joinedAt: Date.now()
    };

    this.queue.push(player);
    console.log(`✅ Jogador ${username} entrou na fila. Total na fila: ${this.queue.length}`);
    
    this.tryStartMatch();

    this.broadcastQueue();
    return { success: true, message: 'Você entrou na fila!', position: this.queue.length };
  }

  removeFromQueue(userId) {
    const index = this.queue.findIndex(p => p.userId === userId);
    if (index !== -1) {
      const player = this.queue[index];
      this.queue.splice(index, 1);
      this.clearInactivityTimer(userId);
      console.log(`🚪 Jogador ${player.username} saiu da fila. Total na fila: ${this.queue.length}`);
      this.broadcastQueue();
      return { success: true, message: 'Você saiu da fila!' };
    }
    return { success: false, message: 'Você não está na fila!' };
  }

  tryStartMatch() {
    if (this.matchInProgress) {
      console.log('⏳ Partida já em progresso. Aguardando conclusão...');
      return;
    }

    if (this.queue.length < 2) {
      console.log(`⏳ Apenas ${this.queue.length} jogador(es) na fila. Aguardando mais jogadores...`);
      return;
    }

    const player1 = this.queue[0];
    const player2 = this.queue[1];

    this.queue.shift();
    this.queue.shift();

    player1.status = 'playing';
    player2.status = 'playing';

    this.currentPlayers.player1 = player1;
    this.currentPlayers.player2 = player2;
    this.matchInProgress = true;

    console.log(`🎮 Iniciando partida: ${player1.username} vs ${player2.username}`);
    console.log(`📊 Jogadores restantes na fila: ${this.queue.length}`);

    this.startInactivityTimer(player1.userId);
    this.startInactivityTimer(player2.userId);

    this.broadcastQueue();
    this.broadcastCurrentPlayers();

    if (this.matchReadyCallback) {
      this.matchReadyCallback({
        player1: this.currentPlayers.player1,
        player2: this.currentPlayers.player2
      });
    }
  }

  startInactivityTimer(userId) {
    this.clearInactivityTimer(userId);
    
    const timer = setTimeout(() => {
      console.log(`⏱️ Jogador ${userId} inativo. Removendo...`);
      this.handleInactivePlayer(userId);
    }, this.inactivityTimeout);

    this.inactivityTimers.set(userId, timer);
  }

  clearInactivityTimer(userId) {
    const timer = this.inactivityTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(userId);
    }
  }

  renewActivity(userId) {
    const player = this.getCurrentPlayer(userId);
    if (player) {
      player.lastActivity = Date.now();
      this.clearInactivityTimer(userId);
      this.startInactivityTimer(userId);
      return { success: true, message: 'Atividade renovada!' };
    }
    return { success: false, message: 'Jogador não encontrado nos jogadores ativos.' };
  }

  handleInactivePlayer(userId) {
    console.log(`❌ Removendo jogador inativo: ${userId}`);
    
    this.removeFromQueue(userId);

    const wasPlaying = this.currentPlayers.player1?.userId === userId || 
                       this.currentPlayers.player2?.userId === userId;

    if (wasPlaying) {
      this.currentPlayers.player1 = null;
      this.currentPlayers.player2 = null;
      this.matchInProgress = false;
      console.log('🔄 Partida encerrada por inatividade. Tentando iniciar nova partida...');
    }

    this.clearInactivityTimer(userId);
    
    this.tryStartMatch();
    
    this.io.emit('player_inactive', { userId });
    if (this.inactiveCallback) {
      this.inactiveCallback(userId);
    }
  }

  checkInactivity() {
    const now = Date.now();
    
    if (this.currentPlayers.player1) {
      const player1Time = now - (this.currentPlayers.player1.lastActivity || this.currentPlayers.player1.joinedAt);
      if (player1Time > this.inactivityTimeout) {
        this.handleInactivePlayer(this.currentPlayers.player1.userId);
      }
    }

    if (this.currentPlayers.player2) {
      const player2Time = now - (this.currentPlayers.player2.lastActivity || this.currentPlayers.player2.joinedAt);
      if (player2Time > this.inactivityTimeout) {
        this.handleInactivePlayer(this.currentPlayers.player2.userId);
      }
    }
  }

  getCurrentPlayer(userId) {
    if (this.currentPlayers.player1?.userId === userId) return this.currentPlayers.player1;
    if (this.currentPlayers.player2?.userId === userId) return this.currentPlayers.player2;
    return null;
  }

  finishGame(winnerId) {
    console.log(`🏁 Partida finalizada. Vencedor: ${winnerId || 'Empate'}`);
    
    if (this.currentPlayers.player1) {
      this.clearInactivityTimer(this.currentPlayers.player1.userId);
    }
    if (this.currentPlayers.player2) {
      this.clearInactivityTimer(this.currentPlayers.player2.userId);
    }

    this.currentPlayers.player1 = null;
    this.currentPlayers.player2 = null;
    this.matchInProgress = false;

    console.log(`📊 Jogadores na fila aguardando: ${this.queue.length}`);
    
    this.broadcastCurrentPlayers();
    
    this.tryStartMatch();
  }

  broadcastQueue() {
    const queueData = this.queue.map((player, index) => ({
      position: index + 1,
      username: player.username,
      avatar: player.avatar,
      status: player.status,
      userId: player.userId
    }));

    this.io.emit('queue_update', {
      queue: queueData,
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize
    });
    
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  broadcastCurrentPlayers() {
    this.io.emit('current_players', {
      player1: this.currentPlayers.player1 ? {
        username: this.currentPlayers.player1.username,
        avatar: this.currentPlayers.player1.avatar
      } : null,
      player2: this.currentPlayers.player2 ? {
        username: this.currentPlayers.player2.username,
        avatar: this.currentPlayers.player2.avatar
      } : null
    });
    
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  getState() {
    return {
      queue: this.queue.map((player, index) => ({
        position: index + 1,
        username: player.username,
        avatar: player.avatar,
        status: player.status,
        userId: player.userId
      })),
      currentPlayers: this.currentPlayers,
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize
    };
  }

  clearQueue() {
    console.log('🧹 Limpando fila...');
    this.queue.forEach(player => {
      this.clearInactivityTimer(player.userId);
    });
    this.queue = [];
    this.broadcastQueue();
    return { success: true, message: 'Fila limpa com sucesso!' };
  }
}

module.exports = QueueManager;