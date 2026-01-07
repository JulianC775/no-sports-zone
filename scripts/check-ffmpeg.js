const { execSync } = require('child_process');

console.log('🔍 Checking system requirements...\n');

// Check FFmpeg
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('✅ FFmpeg is installed');
} catch (error) {
  console.error('❌ FFmpeg is NOT installed');
  console.log('\nFFmpeg is required for audio processing.');
  console.log('Please install it using one of these methods:\n');

  if (process.platform === 'win32') {
    console.log('  Windows:');
    console.log('    winget install Gyan.FFmpeg');
    console.log('    (then restart your terminal)\n');
  } else if (process.platform === 'darwin') {
    console.log('  macOS:');
    console.log('    brew install ffmpeg\n');
  } else {
    console.log('  Linux (Ubuntu/Debian):');
    console.log('    sudo apt-get install ffmpeg\n');
  }

  console.log('After installing, restart your terminal and run: npm install\n');
  process.exit(1);
}

// Check Node version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0]);

if (majorVersion < 18) {
  console.error(`❌ Node.js ${nodeVersion} is too old`);
  console.log('   Please upgrade to Node.js 18 or higher\n');
  process.exit(1);
} else {
  console.log(`✅ Node.js ${nodeVersion} is compatible`);
}

console.log('\n✅ All system requirements are met!\n');