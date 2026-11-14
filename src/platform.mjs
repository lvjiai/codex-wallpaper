import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.CODEX_WALLPAPER_DATA || process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(ROOT, '.state');
export function readConfig() {
  try { return JSON.parse(readFileSync(path.join(DATA, 'config.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
export function saveConfig(config) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(config, null, 2));
}
export function findSteamPath() {
  const output = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true });
  const decoded = new TextDecoder('gbk').decode(output);
  const match = decoded.match(/SteamPath\s+REG_SZ\s+(.+)/i);
  if (!match) throw new Error('Steam 安装路径未找到，请设置 enginePath。');
  return match[1].trim();
}
export function libraryRoots() {
  const steam = findSteamPath();
  const file = path.join(steam, 'steamapps', 'libraryfolders.vdf');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const roots = [steam, ...[...text.matchAll(/"path"\s+"([^"]+)"/g)].map(match => match[1].replaceAll('\\\\', '\\'))];
  return [...new Map(roots.map(root => [path.normalize(root).toLowerCase(), root])).values()];
}
export function resolveEngine(config = readConfig()) {
  if (config.enginePath && existsSync(config.enginePath)) return config.enginePath;
  for (const root of libraryRoots()) {
    const candidate = path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'wallpaper32.exe');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Wallpaper Engine 未找到。');
}
export function enumerateWallpapers(config = readConfig()) {
  const directories = new Map();
  const addDirectory = (directory, source) => directories.set(path.normalize(directory).toLowerCase(), { directory, source });
  for (const root of libraryRoots()) {
    addDirectory(path.join(root, 'steamapps', 'workshop', 'content', '431960'), 'workshop');
    const projects = path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'projects');
    addDirectory(path.join(projects, 'myprojects'), 'local');
    addDirectory(path.join(projects, 'defaultprojects'), 'built-in');
  }
  if (config.enginePath) {
    const projects = path.join(path.dirname(config.enginePath), 'projects');
    addDirectory(path.join(projects, 'myprojects'), 'local');
    addDirectory(path.join(projects, 'defaultprojects'), 'built-in');
  }
  const wallpapers = [];
  for (const { directory, source } of directories.values()) {
    if (!existsSync(directory)) continue;
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      try {
        const item = validateProject(path.join(directory, child.name, 'project.json'));
        wallpapers.push({ ...item, source, ...(source === 'workshop' ? { workshopId: child.name } : {}) });
      } catch { /* Skip unsupported or incomplete downloads. */ }
    }
  }
  return wallpapers;
}
export function enumerateScenes() {
  return enumerateWallpapers().filter(item => item.type === 'scene');
}
export function validateProject(project) {
  const full = path.resolve(project);
  if (path.basename(full).toLowerCase() !== 'project.json') throw new Error('请选择壁纸项目的 project.json。');
  const metadata = JSON.parse(readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
  const type = String(metadata.type).toLowerCase();
  if (!['scene', 'video'].includes(type)) throw new Error('请选择 Wallpaper Engine 的场景或视频壁纸。');
  if (type === 'video') videoSource(full, metadata.file);
  return { project: full, title: metadata.title || path.basename(path.dirname(full)), type };
}
function videoSource(project, file) {
  const directory = path.dirname(project);
  const relative = typeof file === 'string' ? path.normalize(file) : '';
  if (!relative || path.isAbsolute(relative) || relative.startsWith('..' + path.sep) || !existsSync(path.join(directory, relative))) {
    throw new Error('视频壁纸的源文件未下载或不可用。');
  }
  return path.join(directory, relative);
}
export function wallpaperSource(item) {
  if (item.type === 'scene') return item.project;
  const metadata = JSON.parse(readFileSync(item.project, 'utf8').replace(/^\uFEFF/, ''));
  return videoSource(item.project, metadata.file);
}
export function wallpaperPreview(item) {
  const directory = path.dirname(item.project);
  const metadata = JSON.parse(readFileSync(item.project, 'utf8').replace(/^\uFEFF/, ''));
  const mime = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.gif': 'gif', '.webp': 'webp' };
  for (const name of [metadata.preview, 'preview.jpg', 'preview.png', 'preview.gif', 'preview.webp']) {
    if (typeof name !== 'string' || path.basename(name) !== name) continue;
    const type = mime[path.extname(name).toLowerCase()];
    if (type && existsSync(path.join(directory, name))) return { file: path.join(directory, name), type };
  }
  return null;
}
export function engineCommand(engine, args) {
  execFileSync(engine, ['-control', ...args], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
}
export function sendEngineCommand(engine, args, signal) {
  return new Promise((resolve, reject) => {
    execFile(engine, ['-control', ...args], { windowsHide: true, timeout: 15000, signal }, (error) => {
      if (!error) { resolve(); return; }
      reject(new Error(error.killed && error.name !== 'AbortError'
        ? 'Wallpaper Engine 未在 15 秒内响应。请从托盘正常退出 Wallpaper Engine，再从 Steam 打开后重试。'
        : 'Wallpaper Engine 命令未完成：' + error.message, { cause: error }));
    });
  });
}
export function codexWindow() {
  const executable = path.join(ROOT, 'bin', 'diagnostics', 'Probe.exe');
  if (!existsSync(executable)) throw new Error('请先运行 scripts\\Inspect.cmd 构建窗口检查工具。');
  execFileSync(executable, ['inspect-auto', ROOT], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
  return JSON.parse(readFileSync(path.join(ROOT, 'outputs', 'latest-inspection.json'), 'utf8'));
}
