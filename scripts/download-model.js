const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_ZIP = path.join(MODEL_DIR, 'model.zip');
const MODEL_NAME = 'vosk-model-small-en-us-0.15';

console.log('📦 Setting up Vosk speech recognition model...\n');

// Create models directory
if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

// Check if model already exists
if (fs.existsSync(path.join(MODEL_DIR, MODEL_NAME))) {
  console.log('✅ Model already downloaded!');
  process.exit(0);
}

console.log('⬇️  Downloading Vosk model (approximately 40MB)...');
console.log('   This may take a few minutes...\n');

const file = fs.createWriteStream(MODEL_ZIP);

https.get(MODEL_URL, (response) => {
  const totalSize = parseInt(response.headers['content-length'], 10);
  let downloadedSize = 0;

  response.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
    process.stdout.write(`\r   Progress: ${percent}%`);
  });

  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('\n\n📂 Extracting model...');

    try {
      // Extract the zip file
      execSync(`unzip -q "${MODEL_ZIP}" -d "${MODEL_DIR}"`, { stdio: 'inherit' });

      // Clean up zip file
      fs.unlinkSync(MODEL_ZIP);

      console.log('✅ Model setup complete!\n');
      console.log(`   Model location: ${path.join(MODEL_DIR, MODEL_NAME)}\n`);
    } catch (error) {
      console.error('\n❌ Error extracting model:', error.message);
      console.log('\nPlease manually extract the model:');
      console.log(`   1. Extract ${MODEL_ZIP}`);
      console.log(`   2. Place contents in ${MODEL_DIR}`);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  fs.unlinkSync(MODEL_ZIP);
  console.error('\n❌ Error downloading model:', err.message);
  process.exit(1);
});
