# No Sports Zone 🚫⚽🏀

A Discord bot that monitors voice channels for sports talk and kicks users who violate the no-sports rule.

**100% FREE - All processing runs locally on your machine!**

## Features

- 🎤 Real-time voice monitoring using Discord voice channels
- 🗣️ **FREE local speech-to-text** using Vosk (no API costs!)
- 🔍 Intelligent sports keyword detection
- 👢 Automatic user kicking when sports are mentioned
- 📝 Comprehensive logging of all detections
- 💰 Zero ongoing costs - completely free to run

## How It Works

1. The bot joins voice channels in your Discord server
2. It listens to all users speaking in the channel
3. Audio is transcribed to text using **Vosk (local, offline speech recognition)**
4. The text is analyzed for sports-related keywords
5. If sports are detected, the user is immediately kicked from the server

## Setup

### Prerequisites

- **Node.js 18 or higher**
- **FFmpeg** (required for audio processing)
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **unzip** utility (for extracting the model)
- A Discord Bot Token ([Create one here](https://discord.com/developers/applications))

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd no-sports-zone
```

2. Install dependencies:
```bash
npm install
```

3. Download the Vosk speech recognition model (~40MB):
```bash
npm run setup
```

This will automatically download the English language model. It only needs to be done once.

4. Create a `.env` file from the example:
```bash
cp .env.example .env
```

5. Fill in your `.env` file with your Discord bot token:
```env
DISCORD_TOKEN=your_discord_bot_token_here
GUILD_ID=your_guild_id_here
```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
6. Go to OAuth2 > URL Generator
7. Select scopes: `bot`
8. Select bot permissions:
   - View Channels
   - Connect
   - Speak
   - Kick Members
9. Use the generated URL to invite the bot to your server

## Usage

### Development mode:
```bash
npm run dev
```

### Production:
```bash
npm run build
npm start
```

## How to Use the Bot

1. Start the bot using one of the commands above
2. Join a voice channel in your Discord server
3. Drag the bot into the same voice channel (or use Discord's interface to move it)
4. The bot will now monitor all conversations
5. Anyone mentioning sports will be kicked automatically

## Sports Keywords

The bot detects mentions of:
- Major sports (football, basketball, baseball, hockey, etc.)
- Sports organizations (NFL, NBA, MLB, NHL, FIFA, UFC, etc.)
- Common sports terms (game, match, tournament, playoffs, etc.)
- Popular teams and athletes
- Sports events (Super Bowl, World Cup, Olympics, etc.)

You can customize the keyword list in `src/sportsDetector.ts:8`.

## Project Structure

```
no-sports-zone/
├── src/
│   ├── index.ts              # Main bot logic and event handlers
│   ├── config.ts             # Configuration and environment variables
│   ├── audioProcessor.ts     # Audio capture and Vosk transcription
│   └── sportsDetector.ts     # Sports keyword detection
├── scripts/
│   └── download-model.js     # Vosk model downloader
├── models/                   # Vosk speech recognition models (auto-downloaded)
├── package.json
├── tsconfig.json
└── .env.example
```

## Configuration

All configuration is done through environment variables in the `.env` file:

- `DISCORD_TOKEN`: Your Discord bot token (required)
- `GUILD_ID`: (Optional) Your Discord server ID

## Why Vosk?

Vosk is a free, offline speech recognition toolkit that:
- Runs completely locally (no API costs)
- Works offline (no internet required after setup)
- Supports multiple languages
- Is lightweight and fast
- Has good accuracy for English

The small English model is only ~40MB and provides excellent results for this use case.

## Permissions Required

The bot needs these Discord permissions:
- View Channels
- Connect to voice channels
- Receive audio (automatically granted)
- Kick Members

## Troubleshooting

**Bot can't hear users:**
- Make sure the bot is not deafened
- Check that users aren't muted
- Verify the bot has proper permissions

**Transcription not working:**
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check that the Vosk model was downloaded: `npm run setup`
- Look for errors in the console logs

**Model not found error:**
- Run `npm run setup` to download the model
- Verify the `models/` directory exists with the Vosk model inside

**Can't kick users:**
- Ensure the bot role is higher than the users it's trying to kick
- Verify the bot has "Kick Members" permission
- Bot cannot kick server administrators or owners

**Poor transcription accuracy:**
- The small model prioritizes speed over accuracy
- For better accuracy, you can download larger Vosk models from [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models)
- Update the model path in `src/audioProcessor.ts:15`

## System Requirements

- **CPU**: Any modern processor (transcription happens in real-time)
- **RAM**: ~200MB for the model + normal Node.js overhead
- **Disk**: ~100MB (40MB for model, rest for dependencies)
- **Network**: Only needed for Discord connection (not for transcription)

## License

ISC
