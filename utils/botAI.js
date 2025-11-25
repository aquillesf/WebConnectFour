
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1;
const BOT = 2;

class Connect4Bot {
  constructor(difficulty = 'hard') {
    this.difficulty = difficulty;
    this.maxDepth =
      difficulty === 'hard' ? 6 :
      difficulty === 'medium' ? 3 : 0; 
    this.randomMoveChance =
      difficulty === 'easy' ? 0.95 :
      difficulty === 'medium' ? 0.25 :
      0;

    this.mistakeChance =
      difficulty === 'easy' ? 0.90 :   
      difficulty === 'medium' ? 0.20 :
      0;
  }

  makeMove(board) {
    const validMoves = this.getValidMoves(board);

    if (this.difficulty === 'easy') {
      return this.makeVeryStupidMove(validMoves, board);
    }

    if (Math.random() < this.randomMoveChance) {
      return this.getRandomMove(validMoves);
    }

    return this.getBestMove(board);
  }

  makeVeryStupidMove(validMoves, board) {
    if (Math.random() < 0.95) {
      return this.getRandomMove(validMoves);
    }

    const winMove = this.findWinMove(board, BOT);
    if (winMove !== null && Math.random() > this.mistakeChance) {
      return winMove;
    }

    const blockMove = this.findWinMove(board, PLAYER);
    if (blockMove !== null && Math.random() > this.mistakeChance) {
      return blockMove;
    }

    return this.getRandomMove(validMoves);
  }

  getRandomMove(validMoves) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  findWinMove(board, token) {
    const validMoves = this.getValidMoves(board);
    for (const col of validMoves) {
      const temp = this.copyBoard(board);
      const row = this.dropPiece(temp, col, token);
      if (this.checkWin(temp, token)) {
        return col;
      }
    }
    return null;
  }

  getBestMove(board) {
    let bestScore = -Infinity;
    let bestMove = null;

    const validMoves = this.getValidMoves(board);

    for (const col of validMoves) {
      const tempBoard = this.copyBoard(board);
      this.dropPiece(tempBoard, col, BOT);

      const score = this.minimax(
        tempBoard,
        this.maxDepth,
        -Infinity,
        Infinity,
        false
      );

      if (this.difficulty === 'medium' && Math.random() < this.mistakeChance) {
        return this.getRandomMove(validMoves);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = col;
      }
    }

    return bestMove ?? validMoves[0];
  }

  minimax(board, depth, alpha, beta, isMaximizing) {
    const botWin = this.checkWin(board, BOT);
    const playerWin = this.checkWin(board, PLAYER);

    if (botWin) return 10000;
    if (playerWin) return -10000;
    if (depth === 0 || this.isBoardFull(board)) return this.evaluateBoard(board);

    const validMoves = this.getValidMoves(board);

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (const col of validMoves) {
        const temp = this.copyBoard(board);
        this.dropPiece(temp, col, BOT);
        const score = this.minimax(temp, depth - 1, alpha, beta, false);
        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (const col of validMoves) {
        const temp = this.copyBoard(board);
        this.dropPiece(temp, col, PLAYER);
        const score = this.minimax(temp, depth - 1, alpha, beta, true);
        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minScore;
    }
  }

  evaluateBoard(board) {
    let score = 0;

    const centerCol = Math.floor(COLS / 2);
    for (let row = 0; row < ROWS; row++) {
      if (board[row][centerCol] === BOT) score += 3;
    }

    score += this.evaluateSequences(board, BOT) * 100;
    score -= this.evaluateSequences(board, PLAYER) * 100;

    return score;
  }

  evaluateSequences(board, token) {
    let score = 0;

    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 }
    ];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        for (const dir of directions) {
          const window = [];
          for (let i = 0; i < 4; i++) {
            const r = row + dir.y * i;
            const c = col + dir.x * i;
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
              window.push(board[r][c]);
            }
          }
          if (window.length === 4) {
            score += this.scoreWindow(window, token);
          }
        }
      }
    }

    return score;
  }

  scoreWindow(window, token) {
    const opponent = token === BOT ? PLAYER : BOT;
    const countToken = window.filter(v => v === token).length;
    const empty = window.filter(v => v === EMPTY).length;
    const countOpp = window.filter(v => v === opponent).length;

    let score = 0;

    if (countToken === 4) score += 100;
    else if (countToken === 3 && empty === 1) score += 5;
    else if (countToken === 2 && empty === 2) score += 2;

    if (countOpp === 3 && empty === 1) score -= 4;

    return score;
  }

  checkWin(board, token) {
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS - 3; col++)
        if (board[row][col] === token &&
            board[row][col+1] === token &&
            board[row][col+2] === token &&
            board[row][col+3] === token) return true;

    for (let col = 0; col < COLS; col++)
      for (let row = 0; row < ROWS - 3; row++)
        if (board[row][col] === token &&
            board[row+1][col] === token &&
            board[row+2][col] === token &&
            board[row+3][col] === token) return true;

    for (let row = 0; row < ROWS - 3; row++)
      for (let col = 0; col < COLS - 3; col++)
        if (board[row][col] === token &&
            board[row+1][col+1] === token &&
            board[row+2][col+2] === token &&
            board[row+3][col+3] === token) return true;

    for (let row = 0; row < ROWS - 3; row++)
      for (let col = 3; col < COLS; col++)
        if (board[row][col] === token &&
            board[row+1][col-1] === token &&
            board[row+2][col-2] === token &&
            board[row+3][col-3] === token) return true;

    return false;
  }

  getValidMoves(board) {
    const moves = [];
    for (let col = 0; col < COLS; col++) {
      if (board[0][col] === EMPTY) moves.push(col);
    }
    return moves;
  }

  isBoardFull(board) {
    return board[0].every(cell => cell !== EMPTY);
  }

  dropPiece(board, col, token) {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === EMPTY) {
        board[row][col] = token;
        return row;
      }
    }
    return -1;
  }

  copyBoard(board) {
    return board.map(row => [...row]);
  }
}

module.exports = Connect4Bot;
