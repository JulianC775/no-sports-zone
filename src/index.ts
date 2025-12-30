import {
  Client,
  GatewayIntentBits,
  VoiceState,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { config } from './config';
import { AudioProcessor } from './audioProcessor';
import { SportsDetector } from './sportsDetector';

// Load sodium for voice encryption
try {
  require('sodium-native');
} catch {
  try {
    require('libsodium-wrappers');
  } catch {
    console.error('❌ No encryption library found. Install with: npm install sodium-native');
  }
}

class NoSportsZoneBot {
  private client: Client;
  private audioProcessor: AudioProcessor;
  private sportsDetector: SportsDetector;
  private activeConnections: Map<string, VoiceConnection>;
  private userWarnings: Map<string, number>;
  private monitoredUsers: Set<string>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.audioProcessor = new AudioProcessor();
    this.sportsDetector = new SportsDetector();
    this.activeConnections = new Map();
    this.userWarnings = new Map();
    this.monitoredUsers = new Set();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      console.log(`✅ Bot logged in as ${this.client.user?.tag}`);
      console.log('🚫 No Sports Zone is active!');
      console.log('💬 Type !join in a text channel to make the bot join your voice channel');
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      if (message.content === '!join') {
        const member = message.guild?.members.cache.get(message.author.id);
        const voiceChannel = member?.voice.channel;

        if (!voiceChannel) {
          message.reply('❌ You need to be in a voice channel first!');
          return;
        }

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
            selfDeaf: false,
            selfMute: true,
          });

          await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
          this.activeConnections.set(voiceChannel.guild.id, connection);

          console.log(`✅ Joined ${voiceChannel.name} via command`);
          message.reply(`✅ Joined ${voiceChannel.name}! No sports talk allowed! 🚫`);

          // Start monitoring all users in the channel
          const members = voiceChannel.members.filter((m) => !m.user.bot);
          members.forEach((m) => this.monitorUser(connection, m));

          connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
              ]);
            } catch {
              connection.destroy();
              this.activeConnections.delete(voiceChannel.guild.id);
            }
          });
        } catch (error) {
          console.error('Failed to join voice channel:', error);
          message.reply('❌ Failed to join voice channel!');
        }
      }

      if (message.content === '!leave') {
        const connection = this.activeConnections.get(message.guild!.id);
        if (connection) {
          connection.destroy();
          this.activeConnections.delete(message.guild!.id);
          message.reply('👋 Left the voice channel!');
          console.log('Left voice channel via command');
        } else {
          message.reply('❌ I\'m not in a voice channel!');
        }
      }
    });

    this.client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });
  }

  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const botId = this.client.user?.id;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      console.log(`User ${newState.member?.user.username} joined ${newState.channel.name}`);

      // If bot is already in the channel, start monitoring this user
      const connection = this.activeConnections.get(newState.guild.id);
      if (connection && newState.member?.user.id !== botId) {
        this.monitorUser(connection, newState.member!);
      }
    }

    // User left a voice channel
    if (oldState.channel && !newState.channel) {
      console.log(`User ${oldState.member?.user.username} left ${oldState.channel.name}`);
    }

    // Bot joined a channel (only if not already connected)
    if (newState.member?.user.id === botId && newState.channel && !oldState.channel) {
      console.log(`Bot joined ${newState.channel.name}`);
      // Only handle if we don't already have a connection
      if (!this.activeConnections.has(newState.guild.id)) {
        await this.handleBotJoinedChannel(newState);
      }
    }

    // Bot left a channel
    if (oldState.member?.user.id === botId && oldState.channel && !newState.channel) {
      console.log(`Bot left ${oldState.channel.name}`);
      this.activeConnections.delete(oldState.guild.id);
    }
  }

  private async handleBotJoinedChannel(voiceState: VoiceState): Promise<void> {
    const channel = voiceState.channel!;
    const guild = voiceState.guild;

    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator as any,
        selfDeaf: false,
        selfMute: true,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      this.activeConnections.set(guild.id, connection);

      console.log(`✅ Connected to voice channel: ${channel.name}`);

      // Start monitoring all users already in the channel
      const members = channel.members.filter((member) => !member.user.bot);
      members.forEach((member) => this.monitorUser(connection, member));

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          connection.destroy();
          this.activeConnections.delete(guild.id);
        }
      });
    } catch (error) {
      console.error('Failed to join voice channel:', error);
    }
  }

  private monitorUser(connection: VoiceConnection, member: GuildMember): void {
    const userKey = `${member.guild.id}-${member.user.id}`;

    // Don't add duplicate listeners
    if (this.monitoredUsers.has(userKey)) {
      return;
    }

    this.monitoredUsers.add(userKey);
    console.log(`👂 Now monitoring: ${member.user.username}`);
    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      console.log(`🎤 ${member.user.username} started speaking`);
      if (userId === member.user.id) {
        this.audioProcessor.setupUserAudioCapture(
          receiver,
          member.user,
          (uid, username, text) => this.handleTranscription(member, text)
        );
      }
    });
  }

  private async handleTranscription(member: GuildMember, text: string): Promise<void> {
    const result = this.sportsDetector.detectSports(text);

    if (result.detected) {
      console.log(`🚨 SPORTS DETECTED from ${member.user.username}!`);
      console.log(`   Keywords: ${result.keywords.join(', ')}`);
      console.log(`   Text: "${text}"`);

      await this.kickUser(member, result.keywords);
    }
  }

  private async kickUser(member: GuildMember, keywords: string[]): Promise<void> {
    try {
      if (!member.kickable) {
        console.log(`⚠️  Cannot kick ${member.user.username} - insufficient permissions`);
        return;
      }

      await member.kick(`Talking about sports: ${keywords.join(', ')}`);
      console.log(`👢 Kicked ${member.user.username} for talking about sports`);

      // Reset warnings after kick
      this.userWarnings.delete(member.id);
    } catch (error) {
      console.error(`Failed to kick ${member.user.username}:`, error);
    }
  }

  async start(): Promise<void> {
    try {
      await this.client.login(config.discordToken);
    } catch (error) {
      console.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
}

// Start the bot
const bot = new NoSportsZoneBot();
bot.start();
