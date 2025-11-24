const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Registro de usuário
router.post('/signup', async (req, res) => {
  try {
    const { username, password, age, city, state, country } = req.body;

    // Validações básicas
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário e senha são obrigatórios!' 
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário deve ter entre 3 e 20 caracteres!' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Senha deve ter pelo menos 6 caracteres!' 
      });
    }

    // Verifica se usuário já existe
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nome de usuário já está em uso!' 
      });
    }

    // Cria novo usuário
    const user = new User({
      username,
      password,
      age: age || undefined,
      city: city || undefined,
      state: state || undefined,
      country: country || undefined
    });

    await user.save();

    // Cria sessão
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      user: {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin
      }
    });

  } catch (error) {
    console.error('Erro no signup:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao criar conta. Tente novamente.' 
    });
  }
});

// Login de usuário
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validações básicas
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuário e senha são obrigatórios!' 
      });
    }

    // Busca usuário
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário ou senha incorretos!' 
      });
    }

    // Verifica senha
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário ou senha incorretos!' 
      });
    }

    // Atualiza última atividade
    await user.updateActivity();

    // Cria sessão
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;
    req.session.avatar = user.avatar;

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      user: {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin,
        avatar: user.avatar,
        stats: user.stats
      },
      redirectTo: user.isAdmin ? '/admin.html' : '/index.html'
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao fazer login. Tente novamente.' 
    });
  }
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Erro ao fazer logout.' 
      });
    }
    res.json({ 
      success: true, 
      message: 'Logout realizado com sucesso!' 
    });
  });
});

// Verificar sessão
router.get('/check-session', (req, res) => {
  if (req.session.userId) {
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        isAdmin: req.session.isAdmin,
        avatar: req.session.avatar
      }
    });
  } else {
    res.json({
      success: true,
      authenticated: false
    });
  }
});

// Obter perfil do usuário
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    res.json({
      success: true,
      user: {
        username: user.username,
        age: user.age,
        city: user.city,
        state: user.state,
        country: user.country,
        avatar: user.avatar,
        stats: user.stats,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao buscar perfil.' 
    });
  }
});

// Atualizar perfil
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { age, city, state, country, avatar } = req.body;
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuário não encontrado!' 
      });
    }

    // Atualiza campos
    if (age !== undefined) user.age = age;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (country !== undefined) user.country = country;
    if (avatar !== undefined) {
      user.avatar = avatar;
      req.session.avatar = avatar;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: {
        username: user.username,
        age: user.age,
        city: user.city,
        state: user.state,
        country: user.country,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao atualizar perfil.' 
    });
  }
});

module.exports = router;