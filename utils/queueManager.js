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
    
    if (!this.currentPlayers.player1 || !this.currentPlayers.player2) {
      this.assignNextPlayers();
    }
    if (!this.currentPlayers.player1 || !this.currentPlayers.player2) {
      this.assignNextPlayers();
    }

    this.broadcastQueue();
    return { success: true, message: 'Você entrou na fila!', position: this.queue.length };
  }

  removeFromQueue(userId) {
    const index = this.queue.findIndex(p => p.userId === userId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.clearInactivityTimer(userId);
      this.broadcastQueue();
      return { success: true, message: 'Você saiu da fila!' };
    }
    return { success: false, message: 'Você não está na fila!' };
  }

  assignNextPlayers() {
    this.checkInactivity();

    if (this.queue.length === 0) return;

    if (!this.currentPlayers.player1 && this.queue.length > 0) {
      this.currentPlayers.player1 = this.queue.shift();
      this.currentPlayers.player1.status = 'playing';
      this.startInactivityTimer(this.currentPlayers.player1.userId);
    }

    if (!this.currentPlayers.player2 && this.queue.length > 0) {
      this.currentPlayers.player2 = this.queue.shift();
      this.currentPlayers.player2.status = 'playing';
      this.startInactivityTimer(this.currentPlayers.player2.userId);
    }

    this.broadcastQueue();
    this.broadcastCurrentPlayers();
    if (this.currentPlayers.player1 && this.currentPlayers.player2 && !this.matchInProgress) {
      this.matchInProgress = true;
      if (this.matchReadyCallback) {
        this.matchReadyCallback({
          player1: this.currentPlayers.player1,
          player2: this.currentPlayers.player2
        });
      }
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
      this.clearInactivityTimer(userId);
      this.startInactivityTimer(userId);
      return { success: true, message: 'Atividade renovada!' };
    }
    return { success: false, message: 'Jogador não encontrado nos jogadores ativos.' };
  }

  handleInactivePlayer(userId) {
    this.removeFromQueue(userId);

    if (this.currentPlayers.player1?.userId === userId) {
      this.currentPlayers.player1 = null;
    }
    if (this.currentPlayers.player2?.userId === userId) {
      this.currentPlayers.player2 = null;
    }
    this.matchInProgress = false;

    this.clearInactivityTimer(userId);
    
    this.assignNextPlayers();
    
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
    if (this.currentPlayers.player1) {
      this.clearInactivityTimer(this.currentPlayers.player1.userId);
    }
    if (this.currentPlayers.player2) {
      this.clearInactivityTimer(this.currentPlayers.player2.userId);
    }

    this.currentPlayers.player1 = null;
    this.currentPlayers.player2 = null;
    this.matchInProgress = false;

    this.assignNextPlayers();
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
      queue: this.queue,
      currentPlayers: this.currentPlayers,
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize
    };
  }

  clearQueue() {
    this.queue.forEach(player => {
      this.clearInactivityTimer(player.userId);
    });
    this.queue = [];
    this.broadcastQueue();
    return { success: true, message: 'Fila limpa com sucesso!' };
  }
}

module.exports = QueueManager;