import { VoiceConnection, VoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { User } from 'discord.js';
import { createWriteStream, mkdirSync, existsSync, unlinkSync, statSync, readFileSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { spawn } from 'child_process';
import * as prism from 'prism-media';
import * as vosk from 'vosk';
import * as path from 'path';

const pipelineAsync = promisify(pipeline);

export class AudioProcessor {
  private model: vosk.Model;
  private audioDir = './audio_recordings';
  private modelPath = path.join(__dirname, '..', 'models', 'vosk-model-en-us-0.22-lgraph');
  private processingQueue: Set<string> = new Set();
  private readonly MAX_CONCURRENT = 5;
  private readonly MIN_AUDIO_BYTES = 2048;
  private readonly MIN_AUDIO_DURATION_MS = 500;
  private readonly PROCESSING_TIMEOUT_MS = 15000;
  private readonly MIN_ENERGY = 100; // Lowered from 500 to capture quieter speech

  constructor() {
    // Check if model exists
    if (!existsSync(this.modelPath)) {
      console.error('❌ Vosk model not found!');
      console.error('   Please run: npm run setup');
      process.exit(1);
    }

    console.log('📚 Loading Vosk speech recognition model...');
    this.model = new vosk.Model(this.modelPath);
    console.log('✅ Model loaded successfully!');

    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true });
    }
  }

  async setupUserAudioCapture(
    receiver: VoiceReceiver,
    user: User,
    onTranscription: (userId: string, username: string, text: string) => void
  ): Promise<void> {
    // Limit concurrent processing to prevent crashes
    if (this.processingQueue.size >= this.MAX_CONCURRENT) {
      console.log(`⏸️  Queue full, skipping ${user.username}`);
      return;
    }

    const processingKey = `${user.id}-${Date.now()}`;
    this.processingQueue.add(processingKey);
    console.log(`🎧 Capturing audio from ${user.username}`);

    // Add timeout to auto-cleanup stuck processing
    const timeoutId: any = setTimeout(() => {
      if (this.processingQueue.has(processingKey)) {
        console.log(`⏱️  Processing timeout for ${user.username}, cleaning up`);
        this.processingQueue.delete(processingKey);
      }
    }, this.PROCESSING_TIMEOUT_MS);

    const opusStream = receiver.subscribe(user.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000, // 1 second of silence to end capture (was 3000)
      },
    });

    // Increase max listeners to prevent warnings
    opusStream.setMaxListeners(20);

    const filename = `${this.audioDir}/${user.id}-${Date.now()}.pcm`;

    // Decode Opus to PCM (16-bit, 48kHz, stereo -> mono for Vosk)
    const pcmStream = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    try {
      await pipelineAsync(opusStream, pcmStream, createWriteStream(filename));

      // Check if file has meaningful content
      const stats = statSync(filename);
      const durationMs = (stats.size / 192000) * 1000; // Approximate duration (48kHz, 2ch, 16bit)

      console.log(`📊 Audio: ${stats.size} bytes (~${durationMs.toFixed(0)}ms)`);

      if (stats.size < this.MIN_AUDIO_BYTES) {
        console.log(`⚠️  Audio too small (< ${this.MIN_AUDIO_BYTES} bytes), skipping`);
        unlinkSync(filename);
        return;
      }

      if (durationMs < this.MIN_AUDIO_DURATION_MS) {
        console.log(`⚠️  Audio too short (< ${this.MIN_AUDIO_DURATION_MS}ms), skipping`);
        unlinkSync(filename);
        return;
      }

      // Check audio energy to filter out silence/noise
      const energy = this.calculateAudioEnergy(filename);
      console.log(`🔊 Audio energy: ${energy.toFixed(0)} RMS`);

      if (energy < this.MIN_ENERGY) {
        console.log(`⚠️  Audio energy too low (likely silence/noise), skipping`);
        unlinkSync(filename);
        return;
      }

      // Transcribe the audio
      console.log(`🔄 Transcribing audio from ${user.username}...`);
      const text = await this.transcribeAudio(filename);

      if (text && text.trim().length > 0) {
        console.log(`\n💬 [${user.username}]: "${text}"`);
        console.log(`   Length: ${text.length} chars\n`);
        onTranscription(user.id, user.username, text);
      } else {
        console.log(`❌ No transcription for ${user.username} (empty or unclear)`);
      }

      // Clean up audio file
      unlinkSync(filename);
    } catch (error: any) {
      // Ignore common voice chat errors
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

      // Clean up on error
      try {
        if (existsSync(filename)) {
          unlinkSync(filename);
        }
      } catch {}
    } finally {
      clearTimeout(timeoutId);
      this.processingQueue.delete(processingKey);
    }
  }

  private transcriptionLock: Promise<any> = Promise.resolve();

  private async transcribeAudio(filename: string): Promise<string> {
    // Queue transcription to prevent concurrent Vosk usage (causes segfaults)
    const transcribe = async (): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        let recognizer: vosk.Recognizer | null = null;

        try {
          // Create recognizer for 16kHz mono audio (Vosk requirement)
          recognizer = new vosk.Recognizer({
            model: this.model,
            sampleRate: 16000
          });

          // Use FFmpeg to convert to 16kHz mono and save to temp file
          const convertedFile = `${filename}.converted.pcm`;

          const ffmpegProcess = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            '-i', filename,
            '-f', 's16le',
            '-ar', '16000',
            '-ac', '1',
            convertedFile,
            '-y' // Overwrite output file
          ]);

          let transcription = '';

          ffmpegProcess.on('error', (err) => {
            console.log(`   ⚠️  FFmpeg spawn error: ${err.message}`);
            if (recognizer) {
              recognizer.free();
              recognizer = null;
            }
            reject(err);
          });

          ffmpegProcess.stderr.on('data', (data) => {
            // FFmpeg outputs to stderr, ignore it unless we need to debug
            // console.log(`FFmpeg: ${data.toString()}`);
          });

          ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
              console.log(`   ⚠️  FFmpeg exited with code ${code}`);
              if (recognizer) {
                recognizer.free();
                recognizer = null;
              }
              resolve('');
              return;
            }
            // Now read the converted file and process it with Vosk
            try {
              if (!existsSync(convertedFile)) {
                console.log(`   ⚠️  Converted file not created`);
                resolve('');
                return;
              }

              const audioData = readFileSync(convertedFile);
              console.log(`   📦 Reading ${audioData.length} bytes of converted audio`);

              // Process in chunks
              const chunkSize = 8192;
              let offset = 0;
              let chunksProcessed = 0;

              while (offset < audioData.length) {
                const end = Math.min(offset + chunkSize, audioData.length);
                const chunk = audioData.slice(offset, end);
                chunksProcessed++;

                if (recognizer && recognizer.acceptWaveform(chunk)) {
                  const resultStr = recognizer.result();
                  if (resultStr && resultStr !== '[object Object]') {
                    const result = JSON.parse(resultStr);
                    if (result.text) {
                      transcription += result.text + ' ';
                    }
                  }
                }
                offset = end;
              }

              console.log(`   📦 Processed ${chunksProcessed} audio chunks`);

              // Get final result
              if (recognizer) {
                const finalResult = recognizer.finalResult();
                console.log(`   🔍 Final result: ${JSON.stringify(finalResult)?.substring(0, 100)}`);
                if (finalResult !== null && typeof finalResult === 'object') {
                  const result = finalResult as Record<string, any>;
                  if ('text' in result && typeof result.text === 'string') {
                    transcription += result.text;
                  }
                }
                recognizer.free();
                recognizer = null;
              }

              // Clean up converted file
              try {
                unlinkSync(convertedFile);
              } catch {}

              resolve(transcription.trim());
            } catch (e: any) {
              console.log(`   ⚠️  Processing error: ${e.message}`);
              if (recognizer) {
                recognizer.free();
                recognizer = null;
              }
              // Clean up converted file
              try {
                if (existsSync(convertedFile)) {
                  unlinkSync(convertedFile);
                }
              } catch {}
              resolve('');
            }
          });
        } catch (error) {
          if (recognizer) {
            try {
              recognizer.free();
            } catch {}
          }
          console.error('Transcription error:', error);
          resolve('');
        }
      });
    };

    // Serialize transcription to prevent concurrent Vosk access
    const result = await (this.transcriptionLock = this.transcriptionLock.then(() => transcribe()));
    return result;
  }

  private calculateAudioEnergy(filename: string): number {
    const buffer = readFileSync(filename);
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }

    return Math.sqrt(sumSquares / samples.length); // RMS
  }

  destroy(): void {
    // Clean up model resources
    if (this.model) {
      this.model.free();
    }
  }
}
