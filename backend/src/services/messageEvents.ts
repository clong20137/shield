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
  actorLastSeenAt?: string;
}

const clients = new Map<string, Set<Response>>();

function sendEvent(response: Response, payload: MessageEventPayload) {
  response.write(`event: ${payload.type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    sendEvent(response, {
      type: 'presence-updated',
      actorAccountId: onlineAccountId,
      actorOnline: true,
      actorLastSeenAt: new Date().toISOString(),
    });
  });

  const announceOnline = () => {
    const lastSeenAt = new Date().toISOString();
    void AuthAccountModel.updateLastSeen(accountId).catch((error) => {
      console.error('Failed to update message presence:', error);
    });
    broadcastMessageEventToAll({
      type: 'presence-updated',
      actorAccountId: accountId,
      actorOnline: true,
      actorLastSeenAt: lastSeenAt,
    });
  };

  announceOnline();

  const keepAlive = windowlessInterval(() => {
    response.write(': keep-alive\n\n');
    announceOnline();
  }, 25000);

  response.on('close', () => {
    clearInterval(keepAlive);
    accountClients.delete(response);
    if (accountClients.size === 0) {
      clients.delete(accountId);
      broadcastMessageEventToAll({
        type: 'presence-updated',
        actorAccountId: accountId,
        actorOnline: false,
        actorLastSeenAt: new Date().toISOString(),
      });
    }
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
  clients.forEach((accountClients) => {
    accountClients.forEach((client) => sendEvent(client, payload));
  });
}

function windowlessInterval(callback: () => void, milliseconds: number): NodeJS.Timeout {
  return setInterval(callback, milliseconds);
}
