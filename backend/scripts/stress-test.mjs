#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const config = {
  baseUrl: readStringArg('--url', process.env.SHIELD_STRESS_URL || 'http://localhost:5000/api').replace(/\/+$/u, ''),
  email: readStringArg('--email', process.env.SHIELD_STRESS_EMAIL || ''),
  password: readStringArg('--password', process.env.SHIELD_STRESS_PASSWORD || ''),
  users: readNumberArg('--users', Number(process.env.SHIELD_STRESS_USERS || 10)),
  durationSeconds: readNumberArg('--duration', Number(process.env.SHIELD_STRESS_DURATION || 60)),
  rampSeconds: readNumberArg('--ramp', Number(process.env.SHIELD_STRESS_RAMP || 10)),
  write: readBooleanArg('--write', process.env.SHIELD_STRESS_WRITE === 'true'),
};

const readOnlyScenarios = [
  { name: 'session', weight: 15, run: (client) => client.get('/auth/session') },
  { name: 'user-search', weight: 18, run: (client) => client.get('/users/search?q=a') },
  { name: 'calendar', weight: 14, run: (client) => client.get('/calendar') },
  { name: 'reports', weight: 10, run: (client) => client.get('/reports/trooper-dailies?page=1&pageSize=25') },
  { name: 'notifications', weight: 10, run: (client) => client.get('/notifications') },
  { name: 'quick-launch', weight: 8, run: (client) => client.get('/quick-launch') },
  { name: 'dashboard-posts', weight: 10, run: (client) => client.get('/dashboard-posts?limit=10') },
  { name: 'messages-inbox', weight: 8, run: (client) => client.get(`/messages/inbox/${client.accountId}`) },
  { name: 'assigned-devices', weight: 7, run: (client) => client.get('/devices/assigned/me') },
];

const writeScenarios = [
  {
    name: 'calendar-create',
    weight: 5,
    run: (client) =>
      client.post('/calendar', {
        accountId: client.accountId,
        category: 'Trooper Daily',
        date: new Date().toISOString().slice(0, 10),
        dutyHours: '0.25',
        districtWorked: client.district || 'Headquarters',
        specialStatus: 'None',
        color: '#9C865C',
        details: {
          narrative: `Stress test entry ${new Date().toISOString()}`,
        },
      }),
  },
];

const scenarios = config.write ? [...readOnlyScenarios, ...writeScenarios] : readOnlyScenarios;
const stats = new Map(scenarios.map((scenario) => [scenario.name, createStats()]));
const totals = createStats();
let stopRequested = false;

if (!config.email || !config.password) {
  console.error('Missing credentials. Set SHIELD_STRESS_EMAIL and SHIELD_STRESS_PASSWORD, or pass --email and --password.');
  process.exit(1);
}

if (config.users < 1 || config.durationSeconds < 1) {
  console.error('Users and duration must both be greater than zero.');
  process.exit(1);
}

process.on('SIGINT', () => {
  stopRequested = true;
  console.log('\nStopping stress test after current requests finish...');
});

const startedAt = performance.now();
const client = await login();
const endsAt = startedAt + config.durationSeconds * 1000;
const workers = Array.from({ length: config.users }, (_, index) => runWorker(index, client, endsAt));

console.log(`SHIELD stress test`);
console.log(`Target: ${config.baseUrl}`);
console.log(`Users: ${config.users}, duration: ${config.durationSeconds}s, ramp: ${config.rampSeconds}s, writes: ${config.write ? 'on' : 'off'}`);
console.log('');

await Promise.all(workers);
printSummary(performance.now() - startedAt);

async function login() {
  const response = await fetch(`${config.baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
    }),
  });

  const body = await readBody(response);
  if (!response.ok || !body?.token || !body?.account?.id) {
    throw new Error(`Login failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return {
    token: body.token,
    accountId: body.account.id,
    district: body.account.district,
    async get(path) {
      return request('GET', path, this.token);
    },
    async post(path, payload) {
      return request('POST', path, this.token, payload);
    },
  };
}

async function runWorker(index, client, endsAt) {
  const rampDelay = config.rampSeconds > 0 ? (index / config.users) * config.rampSeconds * 1000 : 0;
  await delay(rampDelay);

  while (!stopRequested && performance.now() < endsAt) {
    const scenario = pickScenario();
    const started = performance.now();
    let ok = false;
    let status = 0;

    try {
      const response = await scenario.run(client);
      status = response.status;
      ok = response.ok;
    } catch {
      ok = false;
    }

    const elapsed = performance.now() - started;
    record(stats.get(scenario.name), elapsed, ok, status);
    record(totals, elapsed, ok, status);
  }
}

async function request(method, path, token, payload) {
  return fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pickScenario() {
  const totalWeight = scenarios.reduce((total, scenario) => total + scenario.weight, 0);
  let value = Math.random() * totalWeight;

  for (const scenario of scenarios) {
    value -= scenario.weight;
    if (value <= 0) {
      return scenario;
    }
  }

  return scenarios[scenarios.length - 1];
}

function createStats() {
  return {
    count: 0,
    failures: 0,
    durations: [],
    statuses: new Map(),
  };
}

function record(target, elapsed, ok, status) {
  target.count += 1;
  target.durations.push(elapsed);
  if (!ok) {
    target.failures += 1;
  }

  if (status) {
    target.statuses.set(status, (target.statuses.get(status) || 0) + 1);
  }
}

function printSummary(elapsedMs) {
  const elapsedSeconds = elapsedMs / 1000;
  console.log('Summary');
  console.log(`Requests: ${totals.count}`);
  console.log(`Rate: ${formatNumber(totals.count / elapsedSeconds)} req/s`);
  console.log(`Failures: ${totals.failures} (${formatNumber((totals.failures / Math.max(1, totals.count)) * 100)}%)`);
  console.log(`Latency: avg ${formatNumber(avg(totals.durations))} ms, p95 ${formatNumber(percentile(totals.durations, 95))} ms, p99 ${formatNumber(percentile(totals.durations, 99))} ms`);
  console.log(`Statuses: ${formatStatuses(totals.statuses)}`);
  console.log('');
  console.log('By scenario');

  for (const [name, item] of stats.entries()) {
    if (item.count === 0) continue;
    console.log(
      `${name.padEnd(18)} ${String(item.count).padStart(6)} req  failures ${String(item.failures).padStart(4)}  avg ${String(formatNumber(avg(item.durations))).padStart(7)} ms  p95 ${String(formatNumber(percentile(item.durations, 95))).padStart(7)} ms  ${formatStatuses(item.statuses)}`,
    );
  }
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatStatuses(statuses) {
  return Array.from(statuses.entries())
    .sort(([first], [second]) => first - second)
    .map(([status, count]) => `${status}:${count}`)
    .join(', ') || 'none';
}

function formatNumber(value) {
  return value.toFixed(2);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readStringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isFinite(value) ? value : fallback;
}

function readBooleanArg(name, fallback) {
  return process.argv.includes(name) || fallback;
}
