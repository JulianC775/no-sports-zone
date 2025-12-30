import dotenv from 'dotenv';

dotenv.config();

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',
};

if (!config.discordToken) {
  console.error('Missing DISCORD_TOKEN in .env file.');
  process.exit(1);
}
