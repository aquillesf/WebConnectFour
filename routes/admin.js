const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const { requireAdmin } = require('../middleware/auth');

// Obter estatísticas do sistema
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    const activeGames = await Game.countDocuments({ status: 'playing' });

    // Usuários ativos nas últimas 24 horas
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await User.countDocuments({ 
      lastActivity: { $gte: oneDayAgo } 
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalGames,
        activeGames,
        activeUsers
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao buscar estatísticas.' 
    });
  }
});

// Listar todos os usuários
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ lastActivity: -1 });

    const usersData = users.map(user => ({
      id: user._id,
      username: user.username,
      avatar: user.avatar,
      isAdmin: user.isAdmin,
      stats: user.stats,
      lastActivity: user.lastActivity,
      createdAt: user.createdAt,
      age: user.age,
      city: user.city,
      state: user.state,
      country: user.country
    }));

    res.json({
      success: true,
      users: usersData
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao listar usuários.' 
    });
  }
});

// Deletar usuário
router.delete('/users/:username', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { reason } = req.body;

    // Não permite deletar a si mesmo
    if (username === req.session.username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Você não pode deletar sua própria conta!' 
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    // Deleta jogos do usuário
    await Game.deleteMany({
      $or: [
        { player1: user._id },
        { player2: user._id }
      ]
    });

    // Deleta usuário
    await User.deleteOne({ _id: user._id });

    console.log(`🗑️ Admin ${req.session.username} deletou usuário ${username}. Motivo: ${reason || 'Não especificado'}`);

    res.json({
      success: true,
      message: `Usuário ${username} deletado com sucesso!`
    });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao deletar usuário.' 
    });
  }
});

// Promover usuário a admin
router.post('/users/:username/promote', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    if (user.isAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário já é administrador!' 
      });
    }

    user.isAdmin = true;
    await user.save();

    res.json({
      success: true,
      message: `${username} agora é administrador!`
    });
  } catch (error) {
    console.error('Erro ao promover usuário:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao promover usuário.' 
    });
  }
});

// Remover admin de usuário
router.post('/users/:username/demote', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;

    // Não permite remover admin de si mesmo
    if (username === req.session.username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Você não pode remover seu próprio admin!' 
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    if (!user.isAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário não é administrador!' 
      });
    }

    user.isAdmin = false;
    await user.save();

    res.json({
      success: true,
      message: `${username} não é mais administrador!`
    });
  } catch (error) {
    console.error('Erro ao remover admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao remover admin.' 
    });
  }
});

// Obter todos os jogos
router.get('/games', requireAdmin, async (req, res) => {
  try {
    const games = await Game.find()
      .populate('player1', 'username avatar')
      .populate('player2', 'username avatar')
      .populate('winner', 'username')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      games
    });
  } catch (error) {
    console.error('Erro ao listar jogos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao listar jogos.' 
    });
  }
});

// Limpar jogos antigos
router.delete('/games/cleanup', requireAdmin, async (req, res) => {
  try {
    const { days } = req.body;
    const daysAgo = days || 30;
    
    const dateLimit = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    const result = await Game.deleteMany({
      createdAt: { $lt: dateLimit },
      status: 'finished'
    });

    res.json({
      success: true,
      message: `${result.deletedCount} jogos antigos foram deletados!`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Erro ao limpar jogos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao limpar jogos.' 
    });
  }
});

module.exports = router;