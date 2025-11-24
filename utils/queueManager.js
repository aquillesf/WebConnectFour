const User = require('../models/User');

class QueueManager {
  constructor(io) {
    this.io = io;
    this.queue = [];
    this.maxQueueSize = parseInt(process.env.QUEUE_MAX_SIZE) || 25;
    this.inactivityTimeout = parseInt(process.env.INACTIVITY_TIMEOUT) || 60000; // 60 segundos
    this.inactivityTimers = new Map();
    this.currentPlayers = { player1: null, player2: null };
  }

  // Adicionar jogador à fila
  async addToQueue(userId, username, avatar) {
    // Verifica se já está na fila
    if (this.queue.find(p => p.userId === userId)) {
      return { success: false, message: 'Você já está na fila!' };
    }

    // Verifica tamanho máximo
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
    
    // Se há menos de 2 jogadores atuais, inicia partida
    if (!this.currentPlayers.player1 || !this.currentPlayers.player2) {
      this.assignNextPlayers();
    }

    this.broadcastQueue();
    return { success: true, message: 'Você entrou na fila!', position: this.queue.length };
  }

  // Remover jogador da fila
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

  // Atribuir próximos jogadores
  assignNextPlayers() {
    // Limpa jogadores inativos primeiro
    this.checkInactivity();

    if (this.queue.length === 0) return;

    // Atribui player1 se vazio
    if (!this.currentPlayers.player1 && this.queue.length > 0) {
      this.currentPlayers.player1 = this.queue.shift();
      this.currentPlayers.player1.status = 'playing';
      this.startInactivityTimer(this.currentPlayers.player1.userId);
    }

    // Atribui player2 se vazio
    if (!this.currentPlayers.player2 && this.queue.length > 0) {
      this.currentPlayers.player2 = this.queue.shift();
      this.currentPlayers.player2.status = 'playing';
      this.startInactivityTimer(this.currentPlayers.player2.userId);
    }

    this.broadcastQueue();
    this.broadcastCurrentPlayers();
  }

  // Iniciar timer de inatividade
  startInactivityTimer(userId) {
    this.clearInactivityTimer(userId);
    
    const timer = setTimeout(() => {
      console.log(`⏱️ Jogador ${userId} inativo. Removendo...`);
      this.handleInactivePlayer(userId);
    }, this.inactivityTimeout);

    this.inactivityTimers.set(userId, timer);
  }

  // Limpar timer de inatividade
  clearInactivityTimer(userId) {
    const timer = this.inactivityTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(userId);
    }
  }

  // Renovar atividade do jogador
  renewActivity(userId) {
    const player = this.getCurrentPlayer(userId);
    if (player) {
      this.clearInactivityTimer(userId);
      this.startInactivityTimer(userId);
      return { success: true, message: 'Atividade renovada!' };
    }
    return { success: false, message: 'Jogador não encontrado nos jogadores ativos.' };
  }

  // Lidar com jogador inativo
  handleInactivePlayer(userId) {
    // Remove da fila se estiver lá
    this.removeFromQueue(userId);

    // Remove dos jogadores atuais
    if (this.currentPlayers.player1?.userId === userId) {
      this.currentPlayers.player1 = null;
    }
    if (this.currentPlayers.player2?.userId === userId) {
      this.currentPlayers.player2 = null;
    }

    this.clearInactivityTimer(userId);
    
    // Atribui próximos jogadores
    this.assignNextPlayers();
    
    this.io.emit('player_inactive', { userId });
  }

  // Verificar inatividade geral
  checkInactivity() {
    const now = Date.now();
    
    // Verifica player1
    if (this.currentPlayers.player1) {
      const player1Time = now - (this.currentPlayers.player1.lastActivity || this.currentPlayers.player1.joinedAt);
      if (player1Time > this.inactivityTimeout) {
        this.handleInactivePlayer(this.currentPlayers.player1.userId);
      }
    }

    // Verifica player2
    if (this.currentPlayers.player2) {
      const player2Time = now - (this.currentPlayers.player2.lastActivity || this.currentPlayers.player2.joinedAt);
      if (player2Time > this.inactivityTimeout) {
        this.handleInactivePlayer(this.currentPlayers.player2.userId);
      }
    }
  }

  // Obter jogador atual
  getCurrentPlayer(userId) {
    if (this.currentPlayers.player1?.userId === userId) return this.currentPlayers.player1;
    if (this.currentPlayers.player2?.userId === userId) return this.currentPlayers.player2;
    return null;
  }

  // Finalizar jogo e avançar fila
  finishGame(winnerId) {
    // Limpa timers dos jogadores atuais
    if (this.currentPlayers.player1) {
      this.clearInactivityTimer(this.currentPlayers.player1.userId);
    }
    if (this.currentPlayers.player2) {
      this.clearInactivityTimer(this.currentPlayers.player2.userId);
    }

    // Reseta jogadores atuais
    this.currentPlayers.player1 = null;
    this.currentPlayers.player2 = null;

    // Atribui próximos jogadores
    this.assignNextPlayers();
  }

  // Broadcast da fila para todos os clientes
  broadcastQueue() {
    const queueData = this.queue.map((player, index) => ({
      position: index + 1,
      username: player.username,
      avatar: player.avatar,
      status: player.status
    }));

    this.io.emit('queue_update', {
      queue: queueData,
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize
    });
  }

  // Broadcast dos jogadores atuais
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
  }

  // Obter estado atual
  getState() {
    return {
      queue: this.queue,
      currentPlayers: this.currentPlayers,
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize
    };
  }

  // Limpar fila (admin)
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