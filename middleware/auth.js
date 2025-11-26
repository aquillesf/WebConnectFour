const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Não autorizado. Faça login primeiro.' 
    });
  }
  next();
};

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
