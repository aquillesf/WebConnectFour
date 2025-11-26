const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

// Configuração do storage do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../temp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${req.session.userId || 'unknown'}.webm`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/webm' || file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Apenas vídeos WebM ou MP4 são aceitos'));
    }
  }
});

router.post('/convert-video', requireAuth, upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Nenhum arquivo enviado'
    });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.mp4`
  );

  console.log('📥 Arquivo recebido:', inputPath);
  console.log('📤 Arquivo de saída:', outputPath);

  try {
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .videoBitrate('2500k')
        .outputOptions([
          '-preset ultrafast',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
          '-profile:v baseline',
          '-level 3.0',
          '-strict experimental'
        ])
        .on('start', (cmd) => {
          console.log('🎬 Comando FFmpeg:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 Progresso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('✅ Conversão concluída com sucesso');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error('❌ Erro no FFmpeg:', err.message);
          console.error('📄 stdout:', stdout);
          console.error('📄 stderr:', stderr);
          reject(new Error(`FFmpeg falhou: ${err.message}`));
        });

      command.save(outputPath);
    });

    // Verifica se o arquivo foi criado
    if (!fs.existsSync(outputPath)) {
      throw new Error('Arquivo de saída não foi criado');
    }

    const stats = fs.statSync(outputPath);
    console.log(`📦 Arquivo convertido: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Envia o arquivo
    res.download(outputPath, `connect4-game-${Date.now()}.mp4`, (err) => {
      // Limpa os arquivos temporários
      try {
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
          console.log('🗑️ Arquivo WebM removido');
        }
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log('🗑️ Arquivo MP4 removido');
        }
      } catch (cleanupErr) {
        console.error('⚠️ Erro ao limpar arquivos:', cleanupErr);
      }

      if (err) {
        console.error('❌ Erro ao enviar arquivo:', err);
      }
    });

  } catch (error) {
    console.error('❌ Erro na conversão:', error);

    // Limpa arquivos em caso de erro
    try {
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupErr) {
      console.error('⚠️ Erro ao limpar arquivos:', cleanupErr);
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao converter vídeo: ' + error.message
    });
  }
});

// Limpeza automática de arquivos antigos (roda a cada 10 minutos)
setInterval(() => {
  const tempDir = path.join(__dirname, '../temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const oneHour = 3600000;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > oneHour) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Arquivo temporário antigo removido: ${file}`);
        }
      } catch (err) {
        console.error('⚠️ Erro ao processar arquivo:', file, err);
      }
    });
  }
}, 600000); // 10 minutos

module.exports = router;