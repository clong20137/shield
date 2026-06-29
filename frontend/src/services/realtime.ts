import { getAppEventsUrl, getMessageEventsUrl } from './api';

type RealtimeChannelName = 'app' | 'message';
type RealtimeEventListener = (event: Event) => void;

interface RealtimeChannel {
  source: EventSource | null;
  listeners: Map<string, Set<RealtimeEventListener>>;
  dispatchers: Map<string, EventListener>;
  closeTimer: number | null;
}

const CLOSE_DELAY_MS = 750;

const channels: Record<RealtimeChannelName, RealtimeChannel> = {
  app: {
    source: null,
    listeners: new Map(),
    dispatchers: new Map(),
    closeTimer: null,
  },
  message: {
    source: null,
    listeners: new Map(),
    dispatchers: new Map(),
    closeTimer: null,
  },
};

const getRealtimeUrl = (channelName: RealtimeChannelName) => (
  channelName === 'app' ? getAppEventsUrl() : getMessageEventsUrl()
);

const getListenerCount = (channel: RealtimeChannel) => (
  Array.from(channel.listeners.values()).reduce((count, listeners) => count + listeners.size, 0)
);

const ensureDispatcher = (channel: RealtimeChannel, eventName: string) => {
  if (channel.dispatchers.has(eventName)) {
    return;
  }

  const dispatcher: EventListener = (event) => {
    const listeners = channel.listeners.get(eventName);
    if (!listeners) {
      return;
    }

    Array.from(listeners).forEach((listener) => listener(event));
  };

  channel.dispatchers.set(eventName, dispatcher);
  channel.source?.addEventListener(eventName, dispatcher);
};

const openChannel = (channelName: RealtimeChannelName) => {
  const channel = channels[channelName];
  if (channel.closeTimer) {
    window.clearTimeout(channel.closeTimer);
    channel.closeTimer = null;
  }

  if (channel.source || getListenerCount(channel) === 0) {
    return;
  }

  channel.source = new EventSource(getRealtimeUrl(channelName), { withCredentials: true });
  channel.dispatchers.forEach((dispatcher, eventName) => {
    channel.source?.addEventListener(eventName, dispatcher);
  });
};

const closeChannel = (channelName: RealtimeChannelName, immediately = false) => {
  const channel = channels[channelName];
  if (channel.closeTimer) {
    window.clearTimeout(channel.closeTimer);
    channel.closeTimer = null;
  }

  const close = () => {
    channel.dispatchers.forEach((dispatcher, eventName) => {
      channel.source?.removeEventListener(eventName, dispatcher);
    });
    channel.source?.close();
    channel.source = null;
    channel.closeTimer = null;
  };

  if (immediately) {
    close();
    return;
  }

  channel.closeTimer = window.setTimeout(close, CLOSE_DELAY_MS);
};

export const subscribeRealtime = (
  channelName: RealtimeChannelName,
  eventName: string,
  listener: RealtimeEventListener,
) => {
  const channel = channels[channelName];
  const listeners = channel.listeners.get(eventName) ?? new Set<RealtimeEventListener>();
  listeners.add(listener);
  channel.listeners.set(eventName, listeners);
  ensureDispatcher(channel, eventName);
  openChannel(channelName);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      channel.listeners.delete(eventName);
    }

    if (getListenerCount(channel) === 0) {
      closeChannel(channelName);
    }
  };
};

export const subscribeAppRealtime = (eventName: string, listener: RealtimeEventListener) => (
  subscribeRealtime('app', eventName, listener)
);

export const subscribeMessageRealtime = (eventName: string, listener: RealtimeEventListener) => (
  subscribeRealtime('message', eventName, listener)
);

export const closeRealtimeConnections = () => {
  closeChannel('app', true);
  closeChannel('message', true);
};
