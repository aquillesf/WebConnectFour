const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Configuração do storage do Multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, '../temp');
    try {
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.session?.userId || 'anonymous';
    const uniqueName = `${Date.now()}-${userId}.webm`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/webm' || file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Apenas vídeos WebM ou MP4 são aceitos'));
    }
  }
});


async function cleanupFiles(...paths) {
  for (const filePath of paths) {
    try {
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
        console.log(`🗑️ Arquivo removido: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(`⚠️ Erro ao remover ${path.basename(filePath)}:`, error.message);
    }
  }
}

// Função para verificar se FFmpeg está disponível
function checkFFmpeg() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => {
      resolve(!err);
    });
  });
}


router.post('/', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    // Verifica se o arquivo foi enviado
    if (!req.file) {
      console.error('❌ Nenhum arquivo enviado');
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado'
      });
    }

    inputPath = req.file.path;
    outputPath = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}.mp4`
    );

    console.log('📥 Arquivo recebido:', path.basename(inputPath));
    console.log('📤 Arquivo de saída:', path.basename(outputPath));

    // Verifica se FFmpeg está disponível
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      throw new Error('FFmpeg não está disponível no sistema');
    }

    // Verifica se o arquivo de entrada existe e tem tamanho válido
    const stats = await fs.stat(inputPath);
    if (stats.size === 0) {
      throw new Error('Arquivo de entrada está vazio');
    }

    console.log(`📊 Tamanho do arquivo: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Realiza a conversão
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
          '-max_muxing_queue_size 1024'
        ])
        .on('start', (cmd) => {
          console.log('🎬 Iniciando conversão FFmpeg...');
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
          if (stderr) {
            console.error('FFmpeg stderr:', stderr);
          }
          reject(new Error(`FFmpeg falhou: ${err.message}`));
        });

      command.save(outputPath);
    });

    // Verifica se o arquivo de saída foi criado
    if (!fsSync.existsSync(outputPath)) {
      throw new Error('Arquivo de saída não foi criado');
    }

    const outputStats = await fs.stat(outputPath);
    if (outputStats.size === 0) {
      throw new Error('Arquivo de saída está vazio');
    }

    console.log(`📦 Arquivo convertido: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Envia o arquivo
    res.download(outputPath, `connect4-game-${Date.now()}.mp4`, async (err) => {
      // Limpa os arquivos após o download (com sucesso ou erro)
      await cleanupFiles(inputPath, outputPath);
    });

    readStream.on('error', async (err) => {
      console.error('❌ Erro ao enviar arquivo:', err.message);
      await cleanupFiles(inputPath, outputPath);
    });

  } catch (error) {
    console.error('❌ Erro na conversão:', error.message);
    console.error(error.stack);

    // Limpa arquivos em caso de erro
    if (inputPath || outputPath) {
      await cleanupFiles(inputPath, outputPath);
    }

    // Envia resposta de erro apropriada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao converter vídeo: ' + error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Limpeza automática de arquivos antigos (roda a cada 10 minutos)
setInterval(async () => {
  const tempDir = path.join(__dirname, '../temp');
  try {
    if (!fsSync.existsSync(tempDir)) {
      return;
    }

    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const oneHour = 3600000;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = await fs.stat(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > oneHour) {
          await fs.unlink(filePath);
          console.log(`🗑️ Arquivo temporário antigo removido: ${file}`);
        }
      } catch (err) {
        console.error('⚠️ Erro ao processar arquivo:', file, err.message);
      }
    }
  } catch (error) {
    console.error('⚠️ Erro na limpeza automática:', error.message);
  }
}, 600000); 

module.exports = router;
