require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    const existingAdmin = await User.findOne({ isAdmin: true });
    if (existingAdmin) {
      console.log(`Já existe um admin: ${existingAdmin.username}`);
      process.exit(0);
    }

    const admin = new User({
      username: 'admin',
      password: 'admin123', 
      isAdmin: true,
      age: 30,
      city: 'Videira',
      state: 'Santa Catarina',
      country: 'Brasil',
      avatar: '1'
    });

    await admin.save();
    console.log('✅ Usuário admin criado com sucesso!');
    console.log('👤 Usuário: admin');
    console.log('🔑 Senha: admin123');
    console.log('⚠️  IMPORTANTE: Altere a senha após o primeiro login!');

    process.exit(0);
  } catch (error) {
    console.error('Erro ao criar admin:', error);
    process.exit(1);
  }
};

createAdmin();