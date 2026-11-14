export function checkedPort(value = 9222) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('无效的本地调试端口。');
  return port;
}
export function isCodexTarget(target, port = 9222) {
    if (target.type !== 'page' || target.url !== 'app://-/index.html') return false;
    try {
      const endpoint = new URL(target.webSocketDebuggerUrl);
      return endpoint.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) && Number(endpoint.port) === port;
    } catch { return false; }
}
export async function discoverTargets(port = 9222) {
  port = checkedPort(port);
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(`调试端口返回 HTTP ${response.status}。`);
  const targets = await response.json();
  return targets.filter(target => isCodexTarget(target, port));
}
export const mainWindowExpression = 'Boolean(document.querySelector(\'[data-app-shell-frame]\') && !document.documentElement.classList.contains("compact-window"))';
export class CdpClient {
  constructor(url, timeout = 10000, Socket = WebSocket) { this.url = url; this.timeout = timeout; this.Socket = Socket; this.pending = new Map(); this.nextId = 0; }
  async connect() {
    this.socket = new this.Socket(this.url);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Target.detachedFromTarget') {
        for (const [id, request] of this.pending) {
          if (request.sessionId !== message.params.sessionId) continue;
          this.pending.delete(id);
          clearTimeout(request.timer);
          request.reject(new Error('场景壁纸的调试连接已关闭。'));
        }
        return;
      }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    });
    this.socket.addEventListener('close', () => this.rejectAll(new Error('Codex 页面调试连接已关闭。')));
    this.socket.addEventListener('error', () => this.rejectAll(new Error('Codex 页面调试连接出错。')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.close(); reject(new Error('连接调试页面超时。')); }, this.timeout);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法连接调试页面。')); }, { once: true });
    });
  }
  rejectAll(error) { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); }
  call(method, params = {}, sessionId) {
    if (this.socket?.readyState !== 1) return Promise.reject(new Error('页面调试尚未连接。'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 超时。`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer, sessionId });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() { this.rejectAll(new Error('壁纸连接已结束。')); this.socket?.close(); }
}
export async function debugStatus(port = 9222) {
  try { const targets = await discoverTargets(port); return { available: targets.length > 0, port, targetCount: targets.length }; }
  catch (error) { return { available: false, port, targetCount: 0, error: error.message }; }
}
