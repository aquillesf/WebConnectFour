class VideoCallManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordingStartTime = null;
    this.audioContext = null;
    this.audioDestination = null;
    
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.setupSocketListeners();
  }

  async startLocalVideo() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = this.localStream;

      console.log('📹 Webcam e microfone iniciados');
      return true;
    } catch (error) {
      console.error('❌ Erro ao acessar dispositivos:', error);
      alert('Não foi possível acessar webcam/microfone. Verifique as permissões.');
      return false;
    }
  }

  stopLocalVideo() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = null;
    }
  }

  async createPeerConnection(isInitiator) {
    this.peerConnection = new RTCPeerConnection(this.configuration);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo) remoteVideo.srcObject = this.remoteStream;
      console.log('📹 Stream remoto recebido');
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc_ice_candidate', { candidate: event.candidate });
      }
    };

    if (isInitiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit('webrtc_offer', { offer });
      console.log('📤 Offer enviado');
    }
  }

  closePeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) remoteVideo.srcObject = null;
    this.remoteStream = null;
  }

  setupSocketListeners() {
    this.socket.on('webrtc_offer', async ({ offer }) => {
      console.log('📥 Offer recebido');
      await this.createPeerConnection(false);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit('webrtc_answer', { answer });
      console.log('📤 Answer enviado');
    });

    this.socket.on('webrtc_answer', async ({ answer }) => {
      console.log('📥 Answer recebido');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    this.socket.on('webrtc_ice_candidate', async ({ candidate }) => {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    this.socket.on('match_start', async ({ vsBot }) => {
      await this.startLocalVideo();
      if (!vsBot) {
        await this.createPeerConnection(true);
        setTimeout(() => this.startRecording(), 2000);
      }
    });

    this.socket.on('game_over', () => {
      this.stopRecording();
      this.stopLocalVideo();
      this.closePeerConnection();
    });
  }

  getSupportedMimeType() {
    const possibleTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=h264',
      'video/webm',
      'video/mp4'
    ];

    for (const type of possibleTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('✅ Codec suportado:', type);
        return type;
      }
    }

    console.warn('⚠️ Nenhum codec preferido suportado, usando padrão');
    return '';
  }

  startRecording() {
    if (this.isRecording) {
      console.warn('⚠️ Já está gravando');
      return;
    }

    if (!this.localStream && !this.remoteStream) {
      alert('Nenhum vídeo disponível!');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      const localVideo = document.getElementById('local-video');
      const remoteVideo = document.getElementById('remote-video');

      const drawFrame = () => {
        if (!this.isRecording) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Vídeo remoto ocupa a maior parte da tela
        if (remoteVideo?.srcObject && remoteVideo.readyState >= 2) {
          ctx.drawImage(remoteVideo, 0, 0, 1280, 720);
        }

        // Vídeo local como PIP (Picture-in-Picture) no canto
        if (localVideo?.srcObject && localVideo.readyState >= 2) {
          const pipWidth = 240;
          const pipHeight = 180;
          const margin = 20;
          const pipX = 1280 - pipWidth - margin;
          const pipY = 720 - pipHeight - margin;
          
          ctx.drawImage(localVideo, pipX, pipY, pipWidth, pipHeight);
          
          // Borda ao redor do vídeo local
          ctx.strokeStyle = '#5d98ff';
          ctx.lineWidth = 3;
          ctx.strokeRect(pipX, pipY, pipWidth, pipHeight);
        }

        requestAnimationFrame(drawFrame);
      };

      const canvasStream = canvas.captureStream(30);
      
      this.audioContext = new AudioContext();
      this.audioDestination = this.audioContext.createMediaStreamDestination();

      if (this.localStream) {
        const localAudio = this.audioContext.createMediaStreamSource(this.localStream);
        const localGain = this.audioContext.createGain();
        localGain.gain.value = 1.0;
        localAudio.connect(localGain).connect(this.audioDestination);
      }

      if (this.remoteStream) {
        const remoteAudio = this.audioContext.createMediaStreamSource(this.remoteStream);
        const remoteGain = this.audioContext.createGain();
        remoteGain.gain.value = 1.0;
        remoteAudio.connect(remoteGain).connect(this.audioDestination);
      }

      this.audioDestination.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

      const mimeType = this.getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};
      
      if (mimeType.includes('vp8')) {
        options.videoBitsPerSecond = 2500000;
      }
      if (mimeType.includes('opus')) {
        options.audioBitsPerSecond = 128000;
      }

      this.mediaRecorder = new MediaRecorder(canvasStream, options);
      this.recordedChunks = [];
      this.recordingStartTime = Date.now();

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => this.convertAndDownload();
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      drawFrame();

      console.log('🔴 Gravação iniciada com codec:', mimeType || 'padrão');
      this.showRecordingIndicator();
    } catch (error) {
      console.error('❌ Erro ao gravar:', error);
      alert('Erro ao iniciar gravação: ' + error.message);
    }
  }

  showRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'recording-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 20px;
      font-weight: 600;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    indicator.innerHTML = `
      <span style="width: 12px; height: 12px; background: white; border-radius: 50%; animation: pulse 1s infinite;"></span>
      <span>Gravando</span>
    `;
    
    const style = document.createElement('style');
    style.textContent = `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.mediaRecorder.stop();
    this.isRecording = false;

    const indicator = document.getElementById('recording-indicator');
    if (indicator) indicator.remove();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('⏹️ Gravação parada');
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  async convertAndDownload() {
    let loading = null;
    try {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      
      console.log(`📊 Tamanho do vídeo: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      
      loading = document.createElement('div');
      loading.id = 'conversion-loading';
      loading.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9); color: white; padding: 30px 50px;
        border-radius: 15px; z-index: 10000; font-size: 18px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        text-align: center;
      `;
      loading.innerHTML = `
        <div>🎬 Processando vídeo...</div>
        <div style="font-size: 14px; margin-top: 10px; opacity: 0.8;">
          Isso pode levar alguns segundos
        </div>
      `;
      document.body.appendChild(loading);

      const formData = new FormData();
      formData.append('video', blob, 'recording.webm');

      const response = await fetch('/api/convert-video', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (loading && loading.parentNode) {
        document.body.removeChild(loading);
        loading = null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP ${response.status}`);
      }

      const mp4Blob = await response.blob();
      
      if (mp4Blob.size === 0) {
        throw new Error('Arquivo convertido está vazio');
      }
      
      console.log(`📦 Vídeo convertido: ${(mp4Blob.size / 1024 / 1024).toFixed(2)} MB`);
      
      const url = URL.createObjectURL(mp4Blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `connect4-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      this.showSuccess();
      console.log('💾 Vídeo salvo em MP4');
    } catch (error) {
      console.error('❌ Erro ao processar:', error);
      
      if (loading && loading.parentNode) {
        document.body.removeChild(loading);
      }
      
      this.showError('Erro ao processar vídeo: ' + error.message);
    }
  }

  showError(message) {
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #ff4444; color: white; padding: 15px 25px;
      border-radius: 10px; z-index: 9999; font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 400px;
    `;
    msg.textContent = message;
    document.body.appendChild(msg);
    setTimeout(() => {
      if (msg.parentNode) {
        document.body.removeChild(msg);
      }
    }, 5000);
  }

  showSuccess() {
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #4ade80; color: white; padding: 15px 25px;
      border-radius: 10px; z-index: 9999; font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    msg.textContent = '✅ Vídeo salvo com sucesso!';
    document.body.appendChild(msg);
    setTimeout(() => document.body.removeChild(msg), 3000);
  }
}

window.VideoCallManager = VideoCallManager;

// CSS para webcams
const style = document.createElement('style');
style.textContent = `
  .video-container {
    display: flex;
    gap: 12px;
    margin: 16px 0;
    flex-wrap: wrap;
    justify-content: center;
  }

  .video-wrapper {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .video-wrapper:not(.local) {
    width: 100%;
    max-width: 480px;
    aspect-ratio: 4/3;
  }

  .video-wrapper.local {
    width: 200px;
    aspect-ratio: 4/3;
  }

  .video-wrapper video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .video-label {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .video-container {
      flex-direction: column;
      align-items: center;
    }

    .video-wrapper:not(.local) {
      max-width: 100%;
    }

    .video-wrapper.local {
      width: 160px;
    }
  }
`;
document.head.appendChild(style);