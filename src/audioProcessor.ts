import { VoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { User } from 'discord.js';
import { createWriteStream, mkdirSync, existsSync, unlinkSync, statSync, readFileSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { spawn } from 'child_process';
import * as prism from 'prism-media';
import * as path from 'path';

const pipelineAsync = promisify(pipeline);

export class AudioProcessor {
  private transcriber: any = null;
  private audioDir = './audio_recordings';
  private processingQueue: Set<string> = new Set();
  private activeUsers: Set<string> = new Set();
  private readonly MAX_CONCURRENT = 5;
  private readonly MIN_AUDIO_BYTES = 1024;      // Lower threshold to catch shorter speech
  private readonly MIN_AUDIO_DURATION_MS = 300; // Shorter minimum duration
  private readonly PROCESSING_TIMEOUT_MS = 30000;
  private readonly MIN_ENERGY = 50;             // More sensitive to quieter speech

  constructor() {
    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    console.log('📚 Loading Whisper base speech recognition model...');
    console.log('   (First run will download ~150MB model)');

    const { pipeline: transformersPipeline } = await import('@xenova/transformers');
    this.transcriber = await transformersPipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base.en',
    );

    console.log('✅ Whisper model loaded successfully!');
  }

  async setupUserAudioCapture(
    receiver: VoiceReceiver,
    user: User,
    onTranscription: (userId: string, username: string, text: string) => void
  ): Promise<void> {
    if (this.activeUsers.has(user.id)) {
      return;
    }

    if (this.processingQueue.size >= this.MAX_CONCURRENT) {
      console.log(`⏸️  Queue full, skipping ${user.username}`);
      return;
    }

    this.activeUsers.add(user.id);
    const processingKey = `${user.id}-${Date.now()}`;
    this.processingQueue.add(processingKey);
    console.log(`🎧 Capturing audio from ${user.username}`);

    const timeoutId: any = setTimeout(() => {
      if (this.processingQueue.has(processingKey)) {
        console.log(`⏱️  Processing timeout for ${user.username}, cleaning up`);
        this.processingQueue.delete(processingKey);
      }
    }, this.PROCESSING_TIMEOUT_MS);

    const opusStream = receiver.subscribe(user.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 800, // Slightly faster cutoff for snappier response
      },
    });

    opusStream.setMaxListeners(20);

    const filename = `${this.audioDir}/${user.id}-${Date.now()}.pcm`;

    const pcmStream = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    try {
      await pipelineAsync(opusStream, pcmStream, createWriteStream(filename));

      const stats = statSync(filename);
      const durationMs = (stats.size / 192000) * 1000;

      console.log(`📊 Audio: ${stats.size} bytes (~${durationMs.toFixed(0)}ms)`);

      if (stats.size < this.MIN_AUDIO_BYTES) {
        unlinkSync(filename);
        return;
      }

      if (durationMs < this.MIN_AUDIO_DURATION_MS) {
        unlinkSync(filename);
        return;
      }

      const energy = this.calculateAudioEnergy(filename);
      console.log(`🔊 Audio energy: ${energy.toFixed(0)} RMS`);

      if (energy < this.MIN_ENERGY) {
        console.log(`⚠️  Audio energy too low, skipping`);
        unlinkSync(filename);
        return;
      }

      console.log(`🔄 Transcribing audio from ${user.username}...`);
      const text = await this.transcribeAudio(filename);

      if (text && text.trim().length > 0) {
        console.log(`\n💬 [${user.username}]: "${text}"`);
        console.log(`   Length: ${text.length} chars\n`);
        onTranscription(user.id, user.username, text);
      } else {
        console.log(`❌ No transcription for ${user.username} (empty or unclear)`);
      }

      unlinkSync(filename);
    } catch (error: any) {
      const ignoredErrors = [
        'ERR_STREAM_PREMATURE_CLOSE',
        'The compressed data passed is corrupted',
        'ENOENT'
      ];

      const shouldLog = !ignoredErrors.some(msg =>
        error.code === msg || error.message?.includes(msg)
      );

      if (shouldLog) {
        console.error(`Error processing audio for ${user.username}:`, error.message);
      }

      try {
        if (existsSync(filename)) {
          unlinkSync(filename);
        }
      } catch {}
    } finally {
      clearTimeout(timeoutId);
      this.processingQueue.delete(processingKey);
      this.activeUsers.delete(user.id);
    }
  }

  private transcriptionLock: Promise<any> = Promise.resolve();

  // Convert PCM to WAV with noise reduction (runs in parallel)
  private convertAudio(filename: string): Promise<string | null> {
    return new Promise((resolve) => {
      const convertedFile = `${filename}.converted.wav`;

      const ffmpegProcess = spawn('ffmpeg', [
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        '-i', filename,
        '-af', [
          // Stage 1: Bandpass - keep speech frequencies (wider range for Whisper)
          'highpass=f=60',
          'lowpass=f=8000',
          // Stage 2: Gentle noise reduction (less aggressive to preserve speech)
          'afftdn=nf=-20:nt=w:om=o',
          // Stage 3: Speech clarity EQ
          'equalizer=f=200:t=q:w=1:g=-3',   // Slight mud cut
          'equalizer=f=3000:t=q:w=2:g=4',   // Presence boost for clarity
          'equalizer=f=6000:t=q:w=1.5:g=2', // Air/consonants
          // Stage 4: Gentle compression (preserve dynamics)
          'acompressor=threshold=0.05:ratio=4:attack=10:release=100:makeup=3',
          // Stage 5: Normalize volume
          'loudnorm=I=-16:TP=-1.5:LRA=11',
        ].join(','),
        '-ar', '16000',
        '-ac', '1',
        convertedFile,
        '-y'
      ]);

      ffmpegProcess.on('error', (err) => {
        console.log(`   ⚠️  FFmpeg spawn error: ${err.message}`);
        resolve(null);
      });

      ffmpegProcess.stderr.on('data', () => {});

      ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
          console.log(`   ⚠️  FFmpeg exited with code ${code}`);
          resolve(null);
          return;
        }
        resolve(convertedFile);
      });
    });
  }

  // Read WAV file and return Float32Array of audio samples
  private readWavAsFloat32(filepath: string): Float32Array {
    const buffer = readFileSync(filepath);

    // WAV header is 44 bytes, audio data starts after
    const headerSize = 44;
    const pcmData = buffer.subarray(headerSize);

    // Convert 16-bit PCM to Float32 (-1.0 to 1.0)
    const float32 = new Float32Array(pcmData.length / 2);
    for (let i = 0; i < float32.length; i++) {
      const sample = pcmData.readInt16LE(i * 2);
      float32[i] = sample / 32768;
    }

    return float32;
  }

  private async transcribeAudio(filename: string): Promise<string> {
    // Step 1: Convert to WAV with noise reduction (parallel)
    const wavFile = await this.convertAudio(filename);
    if (!wavFile || !existsSync(wavFile)) {
      return '';
    }

    // Step 2: Run Whisper transcription (serialized to manage memory)
    const recognize = async () => {
      try {
        if (!this.transcriber) {
          console.log('   ⚠️  Whisper not initialized');
          return '';
        }

        // Read WAV as Float32Array (Node.js has no AudioContext)
        const audioData = this.readWavAsFloat32(wavFile);
        console.log(`   📦 Audio: ${audioData.length} samples`);

        const result = await this.transcriber(audioData, {
          language: 'english',
          task: 'transcribe',
          sampling_rate: 16000,
        });

        try { unlinkSync(wavFile); } catch {}

        const text = result?.text?.trim() || '';
        console.log(`   🔍 Whisper result: "${text}"`);
        return text;
      } catch (e: any) {
        console.log(`   ⚠️  Whisper error: ${e.message}`);
        try { if (existsSync(wavFile)) unlinkSync(wavFile); } catch {}
        return '';
      }
    };

    const result = await (this.transcriptionLock = this.transcriptionLock.then(() => recognize()));
    return result;
  }

  private calculateAudioEnergy(filename: string): number {
    const buffer = readFileSync(filename);
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }

    return Math.sqrt(sumSquares / samples.length);
  }

  destroy(): void {
    // Whisper/transformers handles its own cleanup
  }
}
