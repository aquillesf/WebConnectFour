// utils/botAI.js - IA estratégica para o Connect 4

const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1;
const BOT = 2;

class Connect4Bot {
  constructor(difficulty = 'hard') {
    this.difficulty = difficulty;
    this.maxDepth = difficulty === 'hard' ? 6 : difficulty === 'medium' ? 4 : 2;
  }

  // Faz a jogada do bot
  makeMove(board) {
    const validMoves = this.getValidMoves(board);
    
    if (validMoves.length === 0) {
      return null;
    }

    // Estratégia baseada na dificuldade
    if (this.difficulty === 'easy') {
      return this.getRandomMove(validMoves);
    }

    // Para medium e hard, usa minimax
    return this.getBestMove(board);
  }

  // Movimento aleatório (fácil)
  getRandomMove(validMoves) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  // Melhor movimento usando Minimax (médio/difícil)
  getBestMove(board) {
    let bestScore = -Infinity;
    let bestMove = null;

    const validMoves = this.getValidMoves(board);

    for (const col of validMoves) {
      const tempBoard = this.copyBoard(board);
      const row = this.dropPiece(tempBoard, col, BOT);
      
      if (row === -1) continue;

      const score = this.minimax(tempBoard, this.maxDepth - 1, -Infinity, Infinity, false);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = col;
      }
    }

    return bestMove !== null ? bestMove : validMoves[0];
  }

  // Algoritmo Minimax com poda Alpha-Beta
  minimax(board, depth, alpha, beta, isMaximizing) {
    // Verifica condições de término
    const botWin = this.checkWin(board, BOT);
    const playerWin = this.checkWin(board, PLAYER);
    
    if (botWin) return 10000 + depth; // Favorece vitórias mais rápidas
    if (playerWin) return -10000 - depth;
    if (depth === 0 || this.isBoardFull(board)) {
      return this.evaluateBoard(board);
    }

    const validMoves = this.getValidMoves(board);

    if (isMaximizing) {
      let maxScore = -Infinity;
      
      for (const col of validMoves) {
        const tempBoard = this.copyBoard(board);
        const row = this.dropPiece(tempBoard, col, BOT);
        
        if (row === -1) continue;
        
        const score = this.minimax(tempBoard, depth - 1, alpha, beta, false);
        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        
        if (beta <= alpha) break; // Poda
      }
      
      return maxScore;
    } else {
      let minScore = Infinity;
      
      for (const col of validMoves) {
        const tempBoard = this.copyBoard(board);
        const row = this.dropPiece(tempBoard, col, PLAYER);
        
        if (row === -1) continue;
        
        const score = this.minimax(tempBoard, depth - 1, alpha, beta, true);
        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        
        if (beta <= alpha) break; // Poda
      }
      
      return minScore;
    }
  }

  // Avalia o tabuleiro (heurística)
  evaluateBoard(board) {
    let score = 0;

    // Avalia centro (posição estratégica)
    const centerCol = Math.floor(COLS / 2);
    let centerCount = 0;
    for (let row = 0; row < ROWS; row++) {
      if (board[row][centerCol] === BOT) centerCount++;
    }
    score += centerCount * 3;

    // Avalia todas as sequências possíveis
    score += this.evaluateSequences(board, BOT) * 100;
    score -= this.evaluateSequences(board, PLAYER) * 100;

    return score;
  }

  // Avalia sequências (2, 3 em linha)
  evaluateSequences(board, token) {
    let score = 0;

    // Horizontal
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        const window = [
          board[row][col],
          board[row][col + 1],
          board[row][col + 2],
          board[row][col + 3]
        ];
        score += this.scoreWindow(window, token);
      }
    }

    // Vertical
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS - 3; row++) {
        const window = [
          board[row][col],
          board[row + 1][col],
          board[row + 2][col],
          board[row + 3][col]
        ];
        score += this.scoreWindow(window, token);
      }
    }

    // Diagonal (esquerda-direita)
    for (let row = 0; row < ROWS - 3; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        const window = [
          board[row][col],
          board[row + 1][col + 1],
          board[row + 2][col + 2],
          board[row + 3][col + 3]
        ];
        score += this.scoreWindow(window, token);
      }
    }

    // Diagonal (direita-esquerda)
    for (let row = 0; row < ROWS - 3; row++) {
      for (let col = 3; col < COLS; col++) {
        const window = [
          board[row][col],
          board[row + 1][col - 1],
          board[row + 2][col - 2],
          board[row + 3][col - 3]
        ];
        score += this.scoreWindow(window, token);
      }
    }

    return score;
  }

  // Pontua uma janela de 4 células
  scoreWindow(window, token) {
    const opponent = token === BOT ? PLAYER : BOT;
    let score = 0;

    const tokenCount = window.filter(cell => cell === token).length;
    const emptyCount = window.filter(cell => cell === EMPTY).length;
    const opponentCount = window.filter(cell => cell === opponent).length;

    if (tokenCount === 4) {
      score += 100;
    } else if (tokenCount === 3 && emptyCount === 1) {
      score += 5;
    } else if (tokenCount === 2 && emptyCount === 2) {
      score += 2;
    }

    // Penaliza se o oponente está próximo de ganhar
    if (opponentCount === 3 && emptyCount === 1) {
      score -= 4;
    }

    return score;
  }

  // Verifica vitória
  checkWin(board, token) {
    // Horizontal
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        if (
          board[row][col] === token &&
          board[row][col + 1] === token &&
          board[row][col + 2] === token &&
          board[row][col + 3] === token
        ) {
          return true;
        }
      }
    }

    // Vertical
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS - 3; row++) {
        if (
          board[row][col] === token &&
          board[row + 1][col] === token &&
          board[row + 2][col] === token &&
          board[row + 3][col] === token
        ) {
          return true;
        }
      }
    }

    // Diagonal (esquerda-direita)
    for (let row = 0; row < ROWS - 3; row++) {
      for (let col = 0; col < COLS - 3; col++) {
        if (
          board[row][col] === token &&
          board[row + 1][col + 1] === token &&
          board[row + 2][col + 2] === token &&
          board[row + 3][col + 3] === token
        ) {
          return true;
        }
      }
    }

    // Diagonal (direita-esquerda)
    for (let row = 0; row < ROWS - 3; row++) {
      for (let col = 3; col < COLS; col++) {
        if (
          board[row][col] === token &&
          board[row + 1][col - 1] === token &&
          board[row + 2][col - 2] === token &&
          board[row + 3][col - 3] === token
        ) {
          return true;
        }
      }
    }

    return false;
  }

  // Obtém movimentos válidos
  getValidMoves(board) {
    const validMoves = [];
    for (let col = 0; col < COLS; col++) {
      if (board[0][col] === EMPTY) {
        validMoves.push(col);
      }
    }
    return validMoves;
  }

  // Verifica se o tabuleiro está cheio
  isBoardFull(board) {
    return board[0].every(cell => cell !== EMPTY);
  }

  // Coloca uma peça no tabuleiro
  dropPiece(board, column, token) {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][column] === EMPTY) {
        board[row][column] = token;
        return row;
      }
    }
    return -1;
  }

  // Copia o tabuleiro
  copyBoard(board) {
    return board.map(row => [...row]);
  }
}

module.exports = Connect4Bot;