# No Sports Zone

A Discord bot that monitors voice channels for sports talk and disconnects users who violate the no-sports rule.

**100% FREE - All processing runs locally on your machine!**

## Features

- Real-time voice monitoring using Discord voice channels
- **FREE local speech-to-text** using OpenAI's Whisper (no API costs!)
- Intelligent sports keyword detection
- Automatic user disconnect when sports are mentioned
- Comprehensive logging of all detections
- Zero ongoing costs - completely free to run

## How It Works

1. The bot joins voice channels in your Discord server
2. It listens to all users speaking in the channel
3. Audio is transcribed to text using **Whisper (local, offline speech recognition)**
4. The text is analyzed for sports-related keywords
5. If sports are detected, the user is immediately disconnected from the voice channel

## Setup

### Prerequisites

- **Node.js 18 or higher**
- **FFmpeg** (required for audio processing)
  - **Windows**: `winget install Gyan.FFmpeg` (then restart your terminal)
  - **macOS**: `brew install ffmpeg`
  - **Ubuntu/Debian**: `sudo apt-get install ffmpeg`
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

3. (Optional) Pre-download the Whisper model (~150MB):
```bash
npm run setup
```

The model will also auto-download on first bot startup if you skip this step.

> **Note**: You can run `npm run check` at any time to verify your system has all required dependencies.

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
   - Move Members
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
3. Type `!join` in a text channel to make the bot join your voice channel
4. The bot will now monitor all conversations
5. Anyone mentioning sports will be disconnected from the voice channel

## Sports Keywords

The bot detects mentions of:
- Major sports (football, basketball, baseball, hockey, etc.)
- Sports organizations (NFL, NBA, MLB, NHL, FIFA, UFC, etc.)
- Common sports terms (game, match, tournament, playoffs, etc.)
- Popular teams and athletes
- Sports events (Super Bowl, World Cup, Olympics, etc.)

You can customize the keyword list in `src/sportsDetector.ts`.

## Project Structure

```
no-sports-zone/
├── src/
│   ├── index.ts              # Main bot logic and event handlers
│   ├── config.ts             # Configuration and environment variables
│   ├── audioProcessor.ts     # Audio capture and Whisper transcription
│   └── sportsDetector.ts     # Sports keyword detection
├── scripts/
│   ├── download-model.js     # Whisper model pre-downloader
│   └── check-ffmpeg.js       # FFmpeg verification
├── package.json
├── tsconfig.json
└── .env.example
```

## Configuration

All configuration is done through environment variables in the `.env` file:

- `DISCORD_TOKEN`: Your Discord bot token (required)
- `GUILD_ID`: (Optional) Your Discord server ID

## Why Whisper?

This bot uses OpenAI's Whisper model (base.en) running locally via @xenova/transformers:
- Runs completely locally (no API costs, no data sent anywhere)
- Works offline (no internet required after model download)
- Excellent accuracy for English conversational speech
- Free and open source
- Significantly more accurate than traditional speech recognition

## Permissions Required

The bot needs these Discord permissions:
- View Channels
- Connect to voice channels
- Receive audio (automatically granted)
- Move Members (to disconnect users from voice)

## Troubleshooting

**Bot can't hear users:**
- Make sure the bot is not deafened
- Check that users aren't muted
- Verify the bot has proper permissions

**Transcription not working:**
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check that the Whisper model downloaded successfully
- Look for errors in the console logs

**Can't disconnect users:**
- Ensure the bot role is higher than the users it's trying to disconnect
- Verify the bot has "Move Members" permission
- Bot cannot disconnect server administrators or owners

**Poor transcription accuracy:**
- The base.en model provides good accuracy for English
- For better results, you can modify `audioProcessor.ts` to use `Xenova/whisper-small.en` (~500MB)

## System Requirements

- **CPU**: Any modern processor
- **RAM**: ~500MB for the model + normal Node.js overhead
- **Disk**: ~300MB (150MB for model, rest for dependencies)
- **Network**: Only needed for Discord connection (not for transcription)

## License

ISC
