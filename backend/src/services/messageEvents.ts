import { Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { UserMessage } from '../models/UserMessage';

export type MessageEventType = 'message-created' | 'message-read' | 'message-archived' | 'message-deleted' | 'message-reaction' | 'message-typing' | 'presence-updated';
export type MessagePresenceStatus = 'active' | 'away' | 'busy';

interface MessageEventPayload {
  type: MessageEventType;
  message?: UserMessage;
  messageId?: string;
  actorAccountId?: string;
  typingThreadId?: string;
  typingName?: string;
  typingIsActive?: boolean;
  actorOnline?: boolean;
  actorAway?: boolean;
  actorStatus?: MessagePresenceStatus;
  actorLastSeenAt?: string | null;
}

const clients = new Map<string, Set<Response>>();
const hiddenPresenceAccounts = new Set<string>();
const awayPresenceAccounts = new Set<string>();
const presenceStatuses = new Map<string, MessagePresenceStatus>();
const accountCache = new Map<string, { expiresAt: number; account: Awaited<ReturnType<typeof AuthAccountModel.getAccountById>> }>();
const permissionCache = new Map<string, { expiresAt: number; permissions: string[] }>();
const PRESENCE_CACHE_TTL_MS = 15 * 1000;

function normalizePresenceStatus(status?: string): MessagePresenceStatus {
  return status === 'away' || status === 'busy' || status === 'active'
    ? status
    : 'active';
}

function getPresenceStatus(actorAccountId: string): MessagePresenceStatus {
  return presenceStatuses.get(actorAccountId) || 'active';
}

async function getCachedAccount(accountId: string) {
  const cached = accountCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.account;
  }

  const account = await AuthAccountModel.getAccountById(accountId);
  accountCache.set(accountId, { account, expiresAt: Date.now() + PRESENCE_CACHE_TTL_MS });
  return account;
}

async function getCachedPermissions(accountId: string): Promise<string[]> {
  const cached = permissionCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  permissionCache.set(accountId, { permissions, expiresAt: Date.now() + PRESENCE_CACHE_TTL_MS });
  return permissions;
}

function sendEvent(response: Response, payload: MessageEventPayload) {
  response.write(`event: ${payload.type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function canViewIncognitoPresence(viewerAccountId: string, actorAccountId?: string): Promise<boolean> {
  if (viewerAccountId === actorAccountId) {
    return true;
  }

  const viewer = await getCachedAccount(viewerAccountId);
  if (!viewer) {
    return false;
  }

  if (viewer.role === 'administrator') {
    return true;
  }

  const permissions = await getCachedPermissions(viewerAccountId);
  return permissions.includes('presence:view-incognito');
}

async function getPayloadForViewer(viewerAccountId: string, payload: MessageEventPayload): Promise<MessageEventPayload> {
  if (payload.type !== 'presence-updated' || !payload.actorAccountId) {
    return payload;
  }

  const actor = await getCachedAccount(payload.actorAccountId);
  if (!actor?.presenceHidden) {
    return payload;
  }

  if (await canViewIncognitoPresence(viewerAccountId, payload.actorAccountId)) {
    return payload;
  }

  return {
    ...payload,
    actorOnline: false,
    actorAway: false,
    actorStatus: 'away',
    actorLastSeenAt: null,
  };
}

function sendEventForViewer(viewerAccountId: string, response: Response, payload: MessageEventPayload) {
  void getPayloadForViewer(viewerAccountId, payload)
    .then((viewerPayload) => sendEvent(response, viewerPayload))
    .catch((error) => {
      console.error('Failed to filter message event for viewer:', error);
      sendEvent(response, {
        ...payload,
        actorOnline: payload.type === 'presence-updated' ? false : payload.actorOnline,
        actorAway: payload.type === 'presence-updated' ? false : payload.actorAway,
        actorStatus: payload.type === 'presence-updated' ? 'away' : payload.actorStatus,
        actorLastSeenAt: payload.type === 'presence-updated' ? null : payload.actorLastSeenAt,
      });
    });
}

export function addMessageEventClient(accountId: string, response: Response) {
  const accountClients = clients.get(accountId) || new Set<Response>();
  const isFirstClientForAccount = accountClients.size === 0;
  accountClients.add(response);
  clients.set(accountId, accountClients);

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(': connected\n\n');
  clients.forEach((_accountClients, onlineAccountId) => {
    void getCachedAccount(onlineAccountId).then((account) => {
    if (!account) {
      hiddenPresenceAccounts.add(onlineAccountId);
      presenceStatuses.delete(onlineAccountId);
      return;
    }

      if (account.presenceHidden) {
        hiddenPresenceAccounts.add(onlineAccountId);
      } else {
        hiddenPresenceAccounts.delete(onlineAccountId);
      }

      sendEventForViewer(accountId, response, {
        type: 'presence-updated',
        actorAccountId: onlineAccountId,
        actorOnline: true,
        actorAway: awayPresenceAccounts.has(onlineAccountId),
        actorStatus: getPresenceStatus(onlineAccountId),
        actorLastSeenAt: new Date().toISOString(),
      });
    }).catch((error) => {
      console.error('Failed to load message presence:', error);
    });
  });

  const announceOnline = async () => {
    const account = await getCachedAccount(accountId);
    if (!account) {
      hiddenPresenceAccounts.add(accountId);
      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: false,
        actorAway: false,
        actorStatus: 'away',
        actorLastSeenAt: null,
      });
      return;
    }

    if (account.presenceHidden) {
      hiddenPresenceAccounts.add(accountId);
    } else {
      hiddenPresenceAccounts.delete(accountId);
    }

    const lastSeenAt = new Date().toISOString();
    if (!account.presenceHidden) {
      void AuthAccountModel.updateLastSeen(accountId).catch((error) => {
        console.error('Failed to update message presence:', error);
      });
    }
    broadcastMessageEventToAll({
      type: 'presence-updated',
      actorAccountId: accountId,
      actorOnline: true,
      actorAway: awayPresenceAccounts.has(accountId),
      actorStatus: getPresenceStatus(accountId),
      actorLastSeenAt: lastSeenAt,
    });
  };

  if (isFirstClientForAccount) {
    void announceOnline().catch((error) => {
      console.error('Failed to announce message presence:', error);
    });
  }

  const keepAlive = windowlessInterval(() => {
    response.write(': keep-alive\n\n');
  }, 25000);

  response.on('close', () => {
    clearInterval(keepAlive);
    accountClients.delete(response);
    if (accountClients.size === 0) {
      clients.delete(accountId);
      hiddenPresenceAccounts.delete(accountId);
      presenceStatuses.delete(accountId);
      awayPresenceAccounts.delete(accountId);

      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: false,
        actorAway: false,
        actorStatus: 'away',
        actorLastSeenAt: new Date().toISOString(),
      });
    }
  });
}

export async function updateMessagePresence(accountId: string, status: MessagePresenceStatus) {
  const account = await getCachedAccount(accountId);
  const normalizedStatus = normalizePresenceStatus(status);
  if (!account) {
    hiddenPresenceAccounts.add(accountId);
    awayPresenceAccounts.delete(accountId);
    presenceStatuses.delete(accountId);
    broadcastMessageEventToAll({
      type: 'presence-updated',
      actorAccountId: accountId,
      actorOnline: false,
      actorAway: false,
      actorStatus: 'away',
      actorLastSeenAt: null,
    });
    return;
  }

  if (account.presenceHidden) {
    hiddenPresenceAccounts.add(accountId);
  } else {
    hiddenPresenceAccounts.delete(accountId);
  }

  if (normalizedStatus === 'away') {
    awayPresenceAccounts.add(accountId);
  } else {
    awayPresenceAccounts.delete(accountId);
  }
  presenceStatuses.set(accountId, normalizedStatus);

  const lastSeenAt = new Date().toISOString();
  if (normalizedStatus === 'active' && !account.presenceHidden) {
    void AuthAccountModel.updateLastSeen(accountId).catch((error) => {
      console.error('Failed to update message presence:', error);
    });
  }

  broadcastMessageEventToAll({
    type: 'presence-updated',
    actorAccountId: accountId,
    actorOnline: true,
    actorAway: normalizedStatus === 'away',
    actorStatus: normalizedStatus,
    actorLastSeenAt: lastSeenAt,
  });
}

export function broadcastMessageEvent(accountIds: string[], payload: MessageEventPayload) {
  const uniqueAccountIds = Array.from(new Set(accountIds.filter(Boolean)));

  uniqueAccountIds.forEach((accountId) => {
    const accountClients = clients.get(accountId);
    if (!accountClients) {
      return;
    }

    accountClients.forEach((client) => sendEvent(client, payload));
  });
}

export function broadcastMessageEventToAll(payload: MessageEventPayload) {
  clients.forEach((accountClients, accountId) => {
    accountClients.forEach((client) => sendEventForViewer(accountId, client, payload));
  });
}

function windowlessInterval(callback: () => void, milliseconds: number): NodeJS.Timeout {
  return setInterval(callback, milliseconds);
}
