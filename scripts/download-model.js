// Whisper model is automatically downloaded on first run via @xenova/transformers
// This script pre-downloads the model so the first bot startup is faster

console.log('📦 Pre-downloading Whisper base.en speech recognition model...\n');
console.log('   Model: Xenova/whisper-base.en (~150MB)');
console.log('   This may take several minutes on first download...\n');

async function downloadModel() {
  try {
    const { pipeline } = await import('@xenova/transformers');
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en');
    console.log('\n✅ Whisper model downloaded and ready!');

    // Dispose to free memory
    await transcriber.dispose();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error downloading model:', error.message);
    process.exit(1);
  }
}

downloadModel();
