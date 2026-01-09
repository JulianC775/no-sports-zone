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
  private userCooldowns: Map<string, number>; // userId -> timestamp when they can be monitored again
  private readonly COOLDOWN_MS = 10000; // 10 seconds cooldown after rejoining

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
    this.userCooldowns = new Map();

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
      const userId = newState.member?.user.id;
      console.log(`User ${newState.member?.user.username} joined ${newState.channel.name}`);

      // Check if user is on cooldown
      if (userId && this.userCooldowns.has(userId)) {
        const cooldownEnd = this.userCooldowns.get(userId)!;
        const now = Date.now();
        if (now < cooldownEnd) {
          const remainingSeconds = Math.ceil((cooldownEnd - now) / 1000);
          console.log(`⏳ ${newState.member?.user.username} on cooldown (${remainingSeconds}s remaining)`);
          // Set timer to start monitoring after cooldown
          setTimeout(() => {
            this.userCooldowns.delete(userId);
            const connection = this.activeConnections.get(newState.guild.id);
            if (connection && newState.member?.voice.channel) {
              console.log(`✅ Cooldown ended, now monitoring ${newState.member?.user.username}`);
              this.monitorUser(connection, newState.member);
            }
          }, cooldownEnd - now);
          return;
        } else {
          // Cooldown expired
          this.userCooldowns.delete(userId);
        }
      }

      // If bot is already in the channel, start monitoring this user
      const connection = this.activeConnections.get(newState.guild.id);
      if (connection && userId !== botId) {
        this.monitorUser(connection, newState.member!);
      }
    }

    // User left a voice channel
    if (oldState.channel && !newState.channel) {
      const userId = oldState.member?.user.id;
      console.log(`User ${oldState.member?.user.username} left ${oldState.channel.name}`);

      // Clear warnings when user leaves
      if (userId) {
        this.userWarnings.delete(userId);
      }
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
      // Disconnect user from voice channel
      if (!member.voice.channel) {
        console.log(`⚠️  ${member.user.username} is not in a voice channel`);
        return;
      }

      await member.voice.disconnect(`Talking about sports: ${keywords.join(', ')}`);
      console.log(`👢 Disconnected ${member.user.username} from voice channel for talking about sports`);

      // Set cooldown for rejoining (prevents instant re-kick)
      const cooldownEnd = Date.now() + this.COOLDOWN_MS;
      this.userCooldowns.set(member.id, cooldownEnd);
      console.log(`⏳ ${member.user.username} has ${this.COOLDOWN_MS / 1000}s cooldown before monitoring resumes`);

      // Reset warnings after disconnect
      this.userWarnings.delete(member.id);
    } catch (error) {
      console.error(`Failed to disconnect ${member.user.username}:`, error);
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
