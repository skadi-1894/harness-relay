// Plain Node.js so the production image needs no TypeScript runtime or test dependencies.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.argv.includes('--container');
const live = process.argv.includes('--live');
const key = container ? randomBytes(32).toString('hex') : process.env.INFERENCE_API_KEY;
assert.ok(key, 'Set INFERENCE_API_KEY before running smoke checks');
const base = container ? 'http://127.0.0.1:3000' : (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000');
const child = container ? spawn(process.execPath, ['dist/main.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '3000', INFERENCE_API_KEY: key },
  stdio: ['ignore', 'inherit', 'inherit'],
}) : undefined;
const exited = child ? new Promise(resolve => child.once('exit', resolve)) : undefined;
try {
  let ready = false;
  for (let i = 0; i < (container ? 100 : 1); i++) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      ready = res.ok;
    } catch { /* The spawned server may still be starting. */ }
    if (ready) break;
    assert.ok(!child || child.exitCode === null, 'Container server exited during startup');
    if (container) await delay(100);
  }
  assert.ok(ready, 'Health endpoint did not become ready');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const unauthorized = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(5000) });
  assert.equal(unauthorized.status, 401);
  const models = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(5000) });
  assert.equal(models.status, 200);
  const catalog = await models.json();
  assert.equal(catalog.object, 'list');
  assert.ok(catalog.data.length > 0);
  const invalid = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify({ messages: [] }), signal: AbortSignal.timeout(5000),
  });
  assert.equal(invalid.status, 400);
  const metrics = await fetch(`${base}/metrics`, {
    headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN ?? key}` }, signal: AbortSignal.timeout(5000),
  });
  assert.equal(metrics.status, 200);
  assert.ok((await metrics.text()).includes('inference_requests_in_flight'));
  if (container) {
    const { claudePath, codexCommand } = await import('../dist/cli-paths.js');
    const codex = codexCommand();
    execFileSync(codex.command, [...codex.prefix, '--version'], {stdio:'pipe',timeout:10000});
    execFileSync(claudePath(), ['--version'], {stdio:'pipe',timeout:10000});
    const ready = await fetch(`${base}/health/ready`, {signal:AbortSignal.timeout(10000)});
    assert.equal(ready.status, 503, 'An unconfigured container must not claim readiness');
  }
  if (live) {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: process.env.SMOKE_MODEL ?? catalog.data[0].id,
        messages: [{ role: 'user', content: 'Reply with exactly HARNESS_RELAY_OK. Do not use tools.' }] }),
      signal: AbortSignal.timeout(130000),
    });
    assert.equal(res.status, 200, 'Live inference failed; check local login and configured model');
    const body = await res.json();
    assert.equal(body.object, 'chat.completion');
    assert.ok(body.choices[0].message.content.includes('HARNESS_RELAY_OK'));
    assert.ok(body.usage.total_tokens > 0);
    console.log(JSON.stringify({ check: 'live_inference', status: 'passed', model: body.model, usage: body.usage }));
  }
  console.log(JSON.stringify({ check: 'smoke', status: 'passed', live }));
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  }
}
