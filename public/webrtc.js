
class VideoCallManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    
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
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: true
      });

      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

      console.log('📹 Webcam local iniciada');
      return true;
    } catch (error) {
      console.error('❌ Erro ao acessar webcam:', error);
      alert('Não foi possível acessar sua webcam. Verifique as permissões.');
      return false;
    }
  }

  stopLocalVideo() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = null;
      }
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
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
      console.log('📹 Stream remoto recebido');
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc_ice_candidate', {
          candidate: event.candidate
        });
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
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
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

    this.socket.on('match_start', async () => {
      await this.startLocalVideo();
      await this.createPeerConnection(true);
    });

    this.socket.on('game_over', () => {
      this.stopRecording();
      this.stopLocalVideo();
      this.closePeerConnection();
    });
  }

  
  startRecording() {
    if (this.isRecording) {
      alert('Gravação já está em andamento!');
      return;
    }

    if (!this.localStream && !this.remoteStream) {
      alert('Nenhum vídeo disponível para gravar!');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      const localVideo = document.getElementById('local-video');
      const remoteVideo = document.getElementById('remote-video');

      const drawFrame = () => {
        if (!this.isRecording) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (remoteVideo && remoteVideo.srcObject) {
          ctx.drawImage(remoteVideo, 0, 0, 480, 480);
        }

        if (localVideo && localVideo.srcObject) {
          ctx.drawImage(localVideo, 480, 0, 160, 120);
        }

        requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const canvasStream = canvas.captureStream(30);
      
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          canvasStream.addTrack(track);
        });
      }

      this.mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
      };

      this.isRecording = true;
      
      const recordBtn = document.getElementById('record-btn');
      if (recordBtn) {
        recordBtn.textContent = '⏹️ Parar Gravação';
        recordBtn.classList.add('recording');
      }

      console.log('🔴 Gravação iniciada');
    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      alert('Erro ao iniciar gravação: ' + error.message);
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.mediaRecorder.stop();
    this.isRecording = false;

    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) {
      recordBtn.textContent = '🔴 Gravar Partida';
      recordBtn.classList.remove('recording');
    }

    console.log('⏹️ Gravação parada');
  }

  saveRecording() {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `connect4-game-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    console.log('💾 Gravação salva');
    alert('Gravação salva com sucesso!');
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }
}

window.VideoCallManager = VideoCallManager;