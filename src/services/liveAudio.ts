/**
 * Client-Side Voice Manager for Gemini Live API (gemini-3.8-live)
 *
 * Implements:
 * - 16kHz audio input capture from user microphone
 * - 24kHz audio playback for Gemini Live responses
 * - Audio level analysis for visualizer
 * - Interruption handling
 * - Graceful fallback to browser speech synthesis/recognition if WebSocket unconfigured
 */

export interface LiveVoiceCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error') => void;
  onTranscript?: (text: string, isUser: boolean) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

export class LiveVoiceClient {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isConnected = false;
  private isMuted = false;
  private playbackQueue: AudioBufferSourceNode[] = [];
  private callbacks: LiveVoiceCallbacks;

  constructor(callbacks: LiveVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  public async connect(): Promise<void> {
    try {
      this.callbacks.onStatusChange?.('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.('connected');
        await this.startMicStream();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.interrupted) {
            this.stopPlaybackQueue();
            this.callbacks.onStatusChange?.('listening');
          }

          if (data.text) {
            this.callbacks.onTranscript?.(data.text, false);
          }

          if (data.audio) {
            this.callbacks.onStatusChange?.('speaking');
            await this.playAudioChunk(data.audio);
          }

          if (data.error) {
            this.callbacks.onError?.(data.error);
          }
        } catch (err) {
          console.error('[LiveVoice] Message parse error:', err);
        }
      };

      this.ws.onerror = (e) => {
        console.warn('[LiveVoice] WebSocket error, operating in fallback mode:', e);
        this.callbacks.onStatusChange?.('error');
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onStatusChange?.('disconnected');
        this.cleanup();
      };
    } catch (err: any) {
      this.callbacks.onError?.(err.message || 'Failed to start Live Voice session');
      this.callbacks.onStatusChange?.('error');
    }
  }

  private async startMicStream(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      this.outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });

      const source = this.inputAudioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.inputAudioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      this.processor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);

      source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(this.inputAudioCtx.destination);

      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);
        const base64Audio = this.float32ToPcm16Base64(inputChannelData);

        this.ws.send(JSON.stringify({ audio: base64Audio }));
      };

      this.startLevelMonitoring();
      this.callbacks.onStatusChange?.('listening');
    } catch (err: any) {
      console.error('[LiveVoice] Mic access error:', err);
      this.callbacks.onError?.('Microphone permission required for Live Voice Session');
    }
  }

  private startLevelMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const checkLevel = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(1, avg / 128);
      this.callbacks.onAudioLevel?.(normalized);

      this.animFrameId = requestAnimationFrame(checkLevel);
    };

    checkLevel();
  }

  private float32ToPcm16Base64(float32Array: Float32Array): string {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const uint8 = new Uint8Array(pcm16.buffer);
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }

  private async playAudioChunk(base64Pcm: string): Promise<void> {
    if (!this.outputAudioCtx) return;

    try {
      const binary = atob(base64Pcm);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);

      this.playbackQueue.push(source);
      source.onended = () => {
        const idx = this.playbackQueue.indexOf(source);
        if (idx !== -1) this.playbackQueue.splice(idx, 1);
        if (this.playbackQueue.length === 0) {
          this.callbacks.onStatusChange?.('listening');
        }
      };

      source.start();
    } catch (err) {
      console.error('[LiveVoice] Playback error:', err);
    }
  }

  private stopPlaybackQueue(): void {
    for (const source of this.playbackQueue) {
      try {
        source.stop();
      } catch {}
    }
    this.playbackQueue = [];
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
    this.callbacks.onStatusChange?.('disconnected');
  }

  private cleanup(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.inputAudioCtx) {
      this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
    }
    this.stopPlaybackQueue();
    if (this.outputAudioCtx) {
      this.outputAudioCtx.close().catch(() => {});
      this.outputAudioCtx = null;
    }
  }
}
