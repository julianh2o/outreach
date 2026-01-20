import { Client, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';
import { config } from './config';
import { prisma } from './db';

let discordClient: Client | null = null;

interface OverdueContact {
  id: string;
  firstName: string;
  lastName: string | null;
  outreachFrequencyDays: number;
  lastContacted: Date | null;
  daysSinceContact: number;
  daysOverdue: number;
}

async function getOverdueContacts(): Promise<OverdueContact[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      outreachFrequencyDays: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      outreachFrequencyDays: true,
      lastContacted: true,
    },
  });

  const now = new Date();
  const overdueContacts: OverdueContact[] = [];

  for (const contact of contacts) {
    if (contact.outreachFrequencyDays === null) continue;

    let daysSinceContact: number;

    if (contact.lastContacted === null) {
      // If never contacted, consider them overdue from creation
      daysSinceContact = Infinity;
    } else {
      const timeDiff = now.getTime() - contact.lastContacted.getTime();
      daysSinceContact = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    }

    const daysOverdue = daysSinceContact - contact.outreachFrequencyDays;

    if (daysOverdue > 0 || contact.lastContacted === null) {
      overdueContacts.push({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        outreachFrequencyDays: contact.outreachFrequencyDays,
        lastContacted: contact.lastContacted,
        daysSinceContact: contact.lastContacted === null ? -1 : daysSinceContact,
        daysOverdue: contact.lastContacted === null ? -1 : daysOverdue,
      });
    }
  }

  // Sort by most overdue first
  overdueContacts.sort((a, b) => {
    // Never contacted goes first
    if (a.lastContacted === null && b.lastContacted !== null) return -1;
    if (a.lastContacted !== null && b.lastContacted === null) return 1;
    if (a.lastContacted === null && b.lastContacted === null) return 0;
    return b.daysOverdue - a.daysOverdue;
  });

  return overdueContacts;
}

function formatOverdueMessage(contacts: OverdueContact[]): string {
  if (contacts.length === 0) {
    return "You're all caught up! No overdue contacts today.";
  }

  const lines: string[] = [`**Overdue Contacts (${contacts.length}):**\n`];

  for (const contact of contacts) {
    const name = contact.lastName ? `${contact.firstName} ${contact.lastName}` : contact.firstName;

    if (contact.lastContacted === null) {
      lines.push(`- **${name}** - Never contacted (goal: every ${contact.outreachFrequencyDays} days)`);
    } else {
      lines.push(
        `- **${name}** - ${contact.daysOverdue} days overdue (last: ${contact.daysSinceContact} days ago, goal: every ${contact.outreachFrequencyDays} days)`,
      );
    }
  }

  return lines.join('\n');
}

async function findUserByIdOrUsername(userId: string): Promise<ReturnType<Client['users']['fetch']> | null> {
  if (!discordClient) return null;

  // If it looks like a snowflake ID, try fetching directly
  if (/^\d{17,19}$/.test(userId)) {
    try {
      return await discordClient.users.fetch(userId);
    } catch {
      console.log(`[Discord] Could not fetch user by ID: ${userId}`);
    }
  }

  // Otherwise, search through guild members by username
  for (const guild of discordClient.guilds.cache.values()) {
    try {
      // Fetch all members to ensure cache is populated
      await guild.members.fetch();
      const member = guild.members.cache.find((m) => m.user.username === userId || m.user.tag === userId);
      if (member) {
        return member.user;
      }
    } catch (error) {
      console.log(`[Discord] Could not fetch members from guild ${guild.name}:`, error);
    }
  }

  return null;
}

async function sendDailyReminder(): Promise<void> {
  if (!discordClient || !config.discord.userId) {
    console.log('[Discord] Bot not configured, skipping reminder');
    return;
  }

  try {
    const overdueContacts = await getOverdueContacts();
    const message = formatOverdueMessage(overdueContacts);

    const targetUser = await findUserByIdOrUsername(config.discord.userId);

    if (!targetUser) {
      console.error(`[Discord] Could not find user: ${config.discord.userId}`);
      const guilds = discordClient.guilds.cache.map((g) => g.name).join(', ');
      console.log(`[Discord] Bot is in guilds: ${guilds || 'none'}`);
      return;
    }

    const dmChannel = await targetUser.createDM();
    await dmChannel.send(message);
    console.log(`[Discord] Sent daily reminder to ${targetUser.username}`);
  } catch (error) {
    console.error('[Discord] Failed to send daily reminder:', error);
  }
}

export async function startDiscordBot(): Promise<void> {
  if (!config.discord.botToken) {
    console.log('[Discord] No bot token configured, skipping Discord bot initialization');
    return;
  }

  if (!config.discord.userId) {
    console.log('[Discord] No user ID configured, skipping Discord bot initialization');
    return;
  }

  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
  });

  discordClient.on('ready', () => {
    console.log(`[Discord] Bot logged in as ${discordClient!.user?.tag}`);

    // Schedule daily reminder at 9am
    cron.schedule('0 9 * * *', () => {
      console.log('[Discord] Running scheduled 9am reminder');
      sendDailyReminder();
    });

    console.log('[Discord] Scheduled daily reminder for 9:00 AM');
  });

  discordClient.on('error', (error) => {
    console.error('[Discord] Client error:', error);
  });

  try {
    await discordClient.login(config.discord.botToken);
  } catch (error) {
    console.error('[Discord] Failed to login:', error);
  }
}

export async function stopDiscordBot(): Promise<void> {
  if (discordClient) {
    discordClient.destroy();
    discordClient = null;
    console.log('[Discord] Bot disconnected');
  }
}

// Export for testing or manual triggering
export { getOverdueContacts, sendDailyReminder };
