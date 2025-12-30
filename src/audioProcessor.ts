import { VoiceConnection, VoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { User } from 'discord.js';
import { createWriteStream, createReadStream, mkdirSync, existsSync, unlinkSync, statSync } from 'fs';
import { pipeline, PassThrough } from 'stream';
import { promisify } from 'util';
import * as prism from 'prism-media';
import * as vosk from 'vosk';
import * as path from 'path';

const pipelineAsync = promisify(pipeline);

export class AudioProcessor {
  private model: vosk.Model;
  private audioDir = './audio_recordings';
  private modelPath = path.join(__dirname, '..', 'models', 'vosk-model-small-en-us-0.15');
  private processingQueue: Set<string> = new Set();
  private readonly MAX_CONCURRENT = 3;

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

    const opusStream = receiver.subscribe(user.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 2000, // Increased to capture longer phrases
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
      console.log(`📊 Audio file size: ${stats.size} bytes`);

      if (stats.size < 512) {
        console.log(`⚠️  Audio too short, skipping`);
        unlinkSync(filename);
        this.processingQueue.delete(processingKey);
        return;
      }

      // Transcribe the audio
      console.log(`🔄 Transcribing audio from ${user.username}...`);
      const text = await this.transcribeAudio(filename);

      if (text && text.trim().length > 0) {
        console.log(`[${user.username}]: ${text}`);
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

          // Read the PCM file and process it
          const audioStream = createReadStream(filename);
          const resampler = new prism.FFmpeg({
            args: [
              '-f', 's16le',
              '-ar', '48000',
              '-ac', '2',
              '-i', 'pipe:0',
              '-f', 's16le',
              '-ar', '16000',
              '-ac', '1',
              'pipe:1'
            ]
          });

          let transcription = '';

          audioStream.pipe(resampler);

          let chunksProcessed = 0;
          resampler.on('data', (chunk: Buffer) => {
            try {
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
            } catch (e) {
              // Ignore parse errors
            }
          });

          resampler.on('end', () => {
            console.log(`   📦 Processed ${chunksProcessed} audio chunks`);
            try {
              if (recognizer) {
                const finalResultStr = recognizer.finalResult();
                console.log(`   🔍 Final result: ${finalResultStr?.substring(0, 100)}`);
                if (finalResultStr && finalResultStr !== '[object Object]') {
                  const finalResult = JSON.parse(finalResultStr);
                  if (finalResult.text) {
                    transcription += finalResult.text;
                  }
                }
                recognizer.free();
                recognizer = null;
              }
            } catch (e) {
              console.log(`   ⚠️  Parse error: ${e}`);
            }
            resolve(transcription.trim());
          });

          resampler.on('error', (error) => {
            if (recognizer) {
              recognizer.free();
              recognizer = null;
            }
            reject(error);
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

  destroy(): void {
    // Clean up model resources
    if (this.model) {
      this.model.free();
    }
  }
}
