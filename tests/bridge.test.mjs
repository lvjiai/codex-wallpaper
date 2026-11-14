import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { FrameDecoder } from '../src/frames.mjs';
import { CdpClient, isCodexTarget } from '../src/cdp.mjs';

test('frame transport survives split headers and multiple frames per read', () => {
  const frames = [Buffer.from([255, 216, 1, 255, 217]), Buffer.from([255, 216, 2, 3, 255, 217])];
  const bytes = Buffer.concat(frames.map(frame => { const head = Buffer.alloc(4); head.writeUInt32LE(frame.length); return Buffer.concat([head, frame]); }));
  const received = []; const decoder = new FrameDecoder(frame => received.push(frame));
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  assert.deepEqual(received, frames);
});
test('frame transport rejects oversized or non-JPEG payloads', () => {
  const decoder = new FrameDecoder(() => {}, 100); const header = Buffer.alloc(4); header.writeUInt32LE(101);
  assert.throws(() => decoder.push(header), /无效帧长度/);
  assert.throws(() => new FrameDecoder(() => {}).push(Buffer.from([4, 0, 0, 0, 1, 2, 3, 4])), /不是 JPEG/);
});
test('only the Codex main page and matching loopback endpoint are eligible', () => {
  const target = { type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1' };
  assert.equal(isCodexTarget(target), true);
  for (const mutation of [{ url: 'https://chatgpt.com/auth/login' }, { webSocketDebuggerUrl: 'ws://example.com:9222/devtools/page/1' }, { type: 'service_worker' }, { webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/1' }]) assert.equal(isCodexTarget({ ...target, ...mutation }), false);
});
class TestSocket extends EventTarget {
  constructor() { super(); this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  send(text) { const request = JSON.parse(text); if (request.method === 'hang') return; setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: request.id, result: { method: request.method } }) })), request.method === 'slow' ? 15 : 1); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
test('CDP multiplexes out-of-order replies and rejects requests on disconnect', async () => {
  const client = new CdpClient('ws://127.0.0.1/test', 1000, TestSocket); await client.connect();
  assert.deepEqual(await Promise.all([client.call('slow'), client.call('fast')]), [{ method: 'slow' }, { method: 'fast' }]);
  const pending = assert.rejects(client.call('hang'), /结束|关闭/); client.close(); await pending;
});
test('detaching a scene iframe rejects only requests scoped to that iframe', async () => {
  const client = new CdpClient('ws://127.0.0.1/test', 1000, TestSocket);
  await client.connect();
  try {
    const pending = assert.rejects(client.call('hang', {}, 'scene-session'), /场景壁纸的调试连接已关闭/);
    const mainPage = client.call('slow');
    client.socket.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ method: 'Target.detachedFromTarget', params: { sessionId: 'scene-session' } }),
    }));
    await pending;
    assert.deepEqual(await mainPage, { method: 'slow' });
  } finally { client.close(); }
});
test('MCP stdio initializes and lists tools without non-protocol stdout', async () => {
  const child = spawn(process.execPath, ['src/mcp.mjs'], { cwd: new URL('../', import.meta.url), stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  const code = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(code, 0, stderr); const replies = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.length, 2); assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.ok(replies[1].result.tools.some(tool => tool.name === 'wallpaper_start'));
});
