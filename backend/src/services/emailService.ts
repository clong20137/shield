import net from 'net';
import tls from 'tls';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

function readResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk.toString('utf8'));
      const text = chunks.join('');
      const lines = text.trimEnd().split(/\r?\n/u);
      const lastLine = lines[lines.length - 1] || '';

      if (/^\d{3} /u.test(lastLine)) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(text);
      }
    };
    const onError = (error: Error) => {
      socket.off('data', onData);
      socket.off('error', onError);
      reject(error);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function sendCommand(socket: net.Socket, command: string, expectedCodes: string[]) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = response.slice(0, 3);

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed: ${command} -> ${response.trim()}`);
  }

  return response;
}

function connectSmtp(host: string, port: number, secure: boolean): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect(port, host, { servername: host }) : net.connect(port, host);

    socket.once(secure ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host });
    secureSocket.once('secureConnect', () => resolve(secureSocket));
    secureSocket.once('error', reject);
  });
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]/gu, ' ').trim();
}

function buildMessage(from: string, message: EmailMessage) {
  return [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(message.to)}`,
    `Subject: ${sanitizeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    message.text,
  ].join('\r\n');
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const password = process.env.SMTP_PASSWORD || '';
  const from = process.env.SMTP_FROM || user;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !from) {
    console.log(`Email not sent because SMTP is not configured. To: ${message.to}. Subject: ${message.subject}\n${message.text}`);
    return false;
  }

  let socket = await connectSmtp(host, port, secure);

  try {
    await readResponse(socket);
    await sendCommand(socket, `EHLO ${process.env.SMTP_HELO || 'shield.local'}`, ['250']);

    if (!secure && process.env.SMTP_STARTTLS !== 'false') {
      await sendCommand(socket, 'STARTTLS', ['220']);
      socket = await upgradeToTls(socket, host);
      await sendCommand(socket, `EHLO ${process.env.SMTP_HELO || 'shield.local'}`, ['250']);
    }

    if (user && password) {
      await sendCommand(socket, 'AUTH LOGIN', ['334']);
      await sendCommand(socket, Buffer.from(user).toString('base64'), ['334']);
      await sendCommand(socket, Buffer.from(password).toString('base64'), ['235']);
    }

    await sendCommand(socket, `MAIL FROM:<${from}>`, ['250']);
    await sendCommand(socket, `RCPT TO:<${message.to}>`, ['250', '251']);
    await sendCommand(socket, 'DATA', ['354']);
    socket.write(`${buildMessage(from, message)}\r\n.\r\n`);
    const dataResponse = await readResponse(socket);
    if (!['250'].includes(dataResponse.slice(0, 3))) {
      throw new Error(`SMTP DATA failed: ${dataResponse.trim()}`);
    }
    await sendCommand(socket, 'QUIT', ['221']);
    return true;
  } finally {
    socket.end();
  }
}
