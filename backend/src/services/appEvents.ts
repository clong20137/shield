import { Response } from 'express';

export type AppEventType =
  | 'audit-updated'
  | 'bug-updated'
  | 'calendar-updated'
  | 'dashboard-updated'
  | 'device-updated'
  | 'error-updated'
  | 'permission-updated'
  | 'notification-created'
  | 'notification-updated'
  | 'urgent-alert-created'
  | 'urgent-alert-updated'
  | 'performance-evaluation-updated'
  | 'mileage-updated'
  | 'media-updated'
  | 'quick-launch-updated'
  | 'reminder-updated'
  | 'session-revoked'
  | 'user-updated';

interface AppEventPayload {
  type: AppEventType;
  accountId?: string | null;
  entityId?: string;
}

const globalClients = new Set<Response>();
const accountClients = new Map<string, Set<Response>>();

function writeEvent(response: Response, payload: AppEventPayload) {
  response.write(`event: ${payload.type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function addAppEventClient(accountId: string, response: Response) {
  globalClients.add(response);
  const clients = accountClients.get(accountId) || new Set<Response>();
  clients.add(response);
  accountClients.set(accountId, clients);

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(': connected\n\n');

  const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 25000);
  response.on('close', () => {
    clearInterval(keepAlive);
    globalClients.delete(response);
    clients.delete(response);
    if (clients.size === 0) {
      accountClients.delete(accountId);
    }
  });
}

export function broadcastAppEvent(payload: AppEventPayload) {
  globalClients.forEach((client) => writeEvent(client, payload));
}

export function broadcastAccountEvent(accountId: string | null | undefined, payload: AppEventPayload) {
  if (!accountId) return;
  const clients = accountClients.get(accountId);
  clients?.forEach((client) => writeEvent(client, { ...payload, accountId }));
}
