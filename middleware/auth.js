// Middleware para verificar se o usuário está autenticado
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Não autorizado. Faça login primeiro.' 
    });
  }
  next();
};

// Middleware para verificar se o usuário é admin
const requireAdmin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Não autorizado. Faça login primeiro.' 
    });
  }
  
  if (!req.session.isAdmin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Acesso negado. Apenas administradores.' 
    });
  }
  
  next();
};

module.exports = { requireAuth, requireAdmin };