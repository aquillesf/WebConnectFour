const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const { requireAuth } = require('../middleware/auth');


router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find()
      .select('username avatar stats')
      .sort({ 'stats.points': -1 })
      .limit(10);

    const leaderboard = users.map(user => ({
      name: user.username,
      avatar: user.avatar,
      wins: user.stats.wins,
      points: user.stats.points
    }));

    res.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao buscar leaderboard.' 
    });
  }
});


router.post('/record-win', requireAuth, async (req, res) => {
  try {
    const { points } = req.body;
    const pointsToAdd = points || 10;

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    user.stats.wins += 1;
    user.stats.points += pointsToAdd;
    await user.save();

    res.json({
      success: true,
      message: 'Vitória registrada!',
      stats: user.stats
    });
  } catch (error) {
    console.error('Erro ao registrar vitória:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao registrar vitória.' 
    });
  }
});

// Registrar derrota
router.post('/record-loss', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    user.stats.losses += 1;
    await user.save();

    res.json({
      success: true,
      message: 'Derrota registrada.',
      stats: user.stats
    });
  } catch (error) {
    console.error('Erro ao registrar derrota:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao registrar derrota.' 
    });
  }
});

// Criar novo jogo
router.post('/create-game', requireAuth, async (req, res) => {
  try {
    const { gameMode } = req.body;

    const game = new Game({
      player1: req.session.userId,
      gameMode: gameMode || 'two-player',
      status: 'waiting'
    });

    await game.save();

    res.json({
      success: true,
      message: 'Jogo criado!',
      gameId: game._id
    });
  } catch (error) {
    console.error('Erro ao criar jogo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao criar jogo.' 
    });
  }
});


router.post('/finish-game', requireAuth, async (req, res) => {
  try {
    const { gameId, winnerId, boardPosition } = req.body;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ 
        success: false, 
        message: 'Jogo não encontrado!' 
      });
    }

    game.winner = winnerId;
    game.boardPosition = boardPosition;
    game.status = 'finished';
    game.finishedAt = Date.now();
    await game.save();

    
    if (winnerId) {
      const winner = await User.findById(winnerId);
      if (winner) {
        winner.stats.wins += 1;
        winner.stats.points += 10;
        await winner.save();
      }

      
      const loserId = game.player1.toString() === winnerId.toString() 
        ? game.player2 
        : game.player1;
      
      if (loserId) {
        const loser = await User.findById(loserId);
        if (loser) {
          loser.stats.losses += 1;
          await loser.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Jogo finalizado!',
      game
    });
  } catch (error) {
    console.error('Erro ao finalizar jogo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao finalizar jogo.' 
    });
  }
});


router.get('/game-history', requireAuth, async (req, res) => {
  try {
    const games = await Game.find({
      $or: [
        { player1: req.session.userId },
        { player2: req.session.userId }
      ],
      status: 'finished'
    })
    .populate('player1', 'username avatar')
    .populate('player2', 'username avatar')
    .populate('winner', 'username')
    .sort({ finishedAt: -1 })
    .limit(20);

    res.json({
      success: true,
      games
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao buscar histórico.' 
    });
  }
});

module.exports = router;
