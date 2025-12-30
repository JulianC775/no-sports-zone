declare module 'vosk' {
  export class Model {
    constructor(modelPath: string);
    free(): void;
  }

  export interface RecognizerConfig {
    model: Model;
    sampleRate: number;
  }

  export class Recognizer {
    constructor(config: RecognizerConfig);
    acceptWaveform(buffer: Buffer): boolean;
    result(): string;
    finalResult(): string;
    free(): void;
  }
}
