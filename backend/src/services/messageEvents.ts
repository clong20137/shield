import { Response } from 'express';
import { UserMessage } from '../models/UserMessage';

export type MessageEventType = 'message-created' | 'message-read' | 'message-archived' | 'message-deleted' | 'presence-updated';

interface MessageEventPayload {
  type: MessageEventType;
  message?: UserMessage;
  messageId?: string;
  actorAccountId?: string;
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

  const keepAlive = windowlessInterval(() => response.write(': keep-alive\n\n'), 25000);

  response.on('close', () => {
    clearInterval(keepAlive);
    accountClients.delete(response);
    if (accountClients.size === 0) {
      clients.delete(accountId);
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
