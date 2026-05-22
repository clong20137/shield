import { User, UserModel } from '../models/User';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent } from './appEvents';

type MentionContext = {
  actorId: string;
  actorName: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
};

const mentionRegex = /(^|\s)@([a-zA-Z0-9._-]{2,80})/gu;

export function extractMentionTokens(text: string): string[] {
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    tokens.add(match[2].toLowerCase());
  }

  return Array.from(tokens);
}

export async function resolveMentions(text: string, actorId: string): Promise<User[]> {
  const users = await UserModel.findMentionableUsers(extractMentionTokens(text));
  const uniqueUsers = new Map<string, User>();

  users.forEach((user) => {
    if (user.id !== actorId) {
      uniqueUsers.set(user.id, user);
    }
  });

  return Array.from(uniqueUsers.values());
}

export async function notifyMentions(text: string, context: MentionContext): Promise<User[]> {
  const mentionedUsers = await resolveMentions(text, context.actorId);

  await Promise.all(mentionedUsers.map(async (user) => {
    await UserNotificationModel.create({
      userId: user.id,
      type: 'mention',
      title: context.title,
      message: context.message,
      entityType: context.entityType,
      entityId: context.entityId,
    });
    broadcastAccountEvent(user.id, { type: 'notification-created', entityId: context.entityId });
  }));

  return mentionedUsers;
}
