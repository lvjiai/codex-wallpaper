import { createServer, createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA, readConfig } from './platform.mjs';
import { debugStatus } from './cdp.mjs';
import { SceneController } from './controller.mjs';
import { openLibrary } from './library.mjs';

const pipe = '\\\\.\\pipe\\codex-wallpaper-' + createHash('sha256').update(DATA.toLowerCase()).digest('hex').slice(0, 24);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function request(action, args) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(pipe);
    let response = '';
    socket.setEncoding('utf8');
    socket.setTimeout(300000, () => socket.destroy(new Error('壁纸后台响应超时。')));
    socket.once('error', reject);
    socket.once('connect', () => socket.write(JSON.stringify({ action, args }) + '\n'));
    socket.on('data', chunk => { response += chunk; });
    socket.once('end', () => {
      try {
        const result = JSON.parse(response);
        if (result.error) reject(new Error(result.error));
        else resolve(result.value);
      } catch (error) { reject(error); }
    });
  });
}

export async function backgroundRequest(action, args) {
  try { return await request(action, args); }
  catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve'], {
    env: { ...process.env, CODEX_WALLPAPER_DATA: DATA }, detached: true, windowsHide: true, stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(150);
    try { return await request(action, args); }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; }
  }
  throw new Error('壁纸后台启动失败。');
}

if (process.argv[2] === '--serve') {
  const controller = new SceneController();
  let queue = Promise.resolve();
  let initialized = false;
  let missing = 0;
  const actions = {
    async initialize() {
      if (initialized) return { ready: true };
      await openLibrary(controller, { visible: false });
      initialized = true;
      const config = readConfig();
      if (config.enabled && config.playlist?.length) {
        try { await controller.start({ persist: false }); }
        catch (error) { controller.lastError = error.message; }
      }
      return { ready: true };
    },
    status: () => controller.status(),
    choose: () => openLibrary(controller),
    start: args => controller.start(args),
    stop: () => controller.stop(),
  };
  const server = createServer(socket => {
    let input = '';
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', function read(chunk) {
      input += chunk;
      if (input.length > 1024 * 1024) { socket.destroy(); return; }
      if (!input.includes('\n')) return;
      socket.off('data', read);
      queue = queue.then(async () => {
        try {
          const { action, args } = JSON.parse(input);
          if (!Object.hasOwn(actions, action)) throw new Error('未知壁纸操作。');
          if (action !== 'initialize' && action !== 'status' && !initialized) await actions.initialize();
          socket.end(JSON.stringify({ value: await actions[action](args) }));
        } catch (error) { socket.end(JSON.stringify({ error: error.message })); }
      });
    });
  });
  server.once('error', error => { if (error.code !== 'EADDRINUSE') process.exitCode = 1; });
  server.listen(pipe);
  const monitor = setInterval(async () => {
    const status = await debugStatus(readConfig().cdpPort || 9222);
    missing = status.available ? 0 : missing + 1;
    if (missing >= 5) {
      clearInterval(monitor);
      await controller.stop(false);
      process.exit(0);
    }
  }, 3000);
  monitor.unref();
}
