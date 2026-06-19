import { Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { UserMessage } from '../models/UserMessage';

export type MessageEventType = 'message-created' | 'message-read' | 'message-archived' | 'message-deleted' | 'message-reaction' | 'message-typing' | 'presence-updated';

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
  actorLastSeenAt?: string | null;
}

const clients = new Map<string, Set<Response>>();
const hiddenPresenceAccounts = new Set<string>();
const awayPresenceAccounts = new Set<string>();

function sendEvent(response: Response, payload: MessageEventPayload) {
  response.write(`event: ${payload.type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function canViewIncognitoPresence(viewerAccountId: string, actorAccountId?: string): Promise<boolean> {
  if (viewerAccountId === actorAccountId) {
    return true;
  }

  const viewer = await AuthAccountModel.getAccountById(viewerAccountId);
  if (!viewer) {
    return false;
  }

  if (viewer.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(viewerAccountId);
  return permissions.includes('presence:view-incognito');
}

async function getPayloadForViewer(viewerAccountId: string, payload: MessageEventPayload): Promise<MessageEventPayload> {
  if (payload.type !== 'presence-updated' || !payload.actorAccountId) {
    return payload;
  }

  const actor = await AuthAccountModel.getAccountById(payload.actorAccountId);
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
        actorLastSeenAt: payload.type === 'presence-updated' ? null : payload.actorLastSeenAt,
      });
    });
}

export function addMessageEventClient(accountId: string, response: Response) {
  const accountClients = clients.get(accountId) || new Set<Response>();
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
    void AuthAccountModel.getAccountById(onlineAccountId).then((account) => {
      if (!account) {
        hiddenPresenceAccounts.add(onlineAccountId);
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
        actorLastSeenAt: new Date().toISOString(),
      });
    }).catch((error) => {
      console.error('Failed to load message presence:', error);
    });
  });

  const announceOnline = async () => {
    const account = await AuthAccountModel.getAccountById(accountId);
    if (!account) {
      hiddenPresenceAccounts.add(accountId);
      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: false,
        actorAway: false,
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
      actorLastSeenAt: lastSeenAt,
    });
  };

  void announceOnline().catch((error) => {
    console.error('Failed to announce message presence:', error);
  });

  const keepAlive = windowlessInterval(() => {
    response.write(': keep-alive\n\n');
    void announceOnline().catch((error) => {
      console.error('Failed to announce message presence:', error);
    });
  }, 25000);

  response.on('close', () => {
    clearInterval(keepAlive);
    accountClients.delete(response);
    if (accountClients.size === 0) {
      clients.delete(accountId);
      hiddenPresenceAccounts.delete(accountId);

      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: false,
        actorAway: false,
        actorLastSeenAt: new Date().toISOString(),
      });
      awayPresenceAccounts.delete(accountId);
    }
  });
}

export async function updateMessagePresence(accountId: string, isAway: boolean) {
  const account = await AuthAccountModel.getAccountById(accountId);
  if (!account) {
    hiddenPresenceAccounts.add(accountId);
    awayPresenceAccounts.delete(accountId);
    broadcastMessageEventToAll({
      type: 'presence-updated',
      actorAccountId: accountId,
      actorOnline: false,
      actorAway: false,
      actorLastSeenAt: null,
    });
    return;
  }

  if (account.presenceHidden) {
    hiddenPresenceAccounts.add(accountId);
  } else {
    hiddenPresenceAccounts.delete(accountId);
  }

  if (isAway) {
    awayPresenceAccounts.add(accountId);
  } else {
    awayPresenceAccounts.delete(accountId);
  }

  const lastSeenAt = new Date().toISOString();
  if (!isAway && !account.presenceHidden) {
    void AuthAccountModel.updateLastSeen(accountId).catch((error) => {
      console.error('Failed to update message presence:', error);
    });
  }

  broadcastMessageEventToAll({
    type: 'presence-updated',
    actorAccountId: accountId,
    actorOnline: true,
    actorAway: isAway,
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
