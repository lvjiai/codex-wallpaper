import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ROOT, resolveEngine, enumerateScenes, engineCommand, codexWindow } from '../src/platform.mjs';

const engine = resolveEngine();
const scene = enumerateScenes().find(item => item.title === 'Shimmering Particles');
if (!scene) throw new Error('未找到用于验证的 Shimmering Particles Scene。');
const name = 'CodexWallpaper-Validation-' + randomBytes(5).toString('hex');
const output = path.join(ROOT, 'outputs', 'scene-validation', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(output, { recursive: true });
const target = codexWindow();
writeFileSync(path.join(output, 'source.json'), JSON.stringify({ scene, engine, windowName: name, desktopWallpaperChangedByThisTest: false }, null, 2));
try {
  engineCommand(engine, ['openWallpaper', '-file', scene.project, '-playInWindow', name, '-width', '640', '-height', '360', '-x', '0', '-y', '0']);
  const child = spawn(path.join(ROOT, 'bin', 'capture', 'scene-capture.exe'), ['--title', name, '--behind', String(target.hwnd), '--fps', '10', '--seconds', '8', '--output', output, ...(process.argv.includes('--picker') ? ['--picker'] : [])], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = ''; child.stderr.on('data', chunk => { diagnostics += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  writeFileSync(path.join(output, 'diagnostics.txt'), diagnostics);
  if (code !== 0) throw new Error(`WGC 捕获失败：${diagnostics}`);
  const metrics = JSON.parse(readFileSync(path.join(output, 'result.json'), 'utf8'));
  if (metrics.frames < 10 || metrics.pixelChangedFrames < 5) throw new Error(`未验证出持续变化的场景画面：${JSON.stringify(metrics)}`);
  const validation = { passed: true, ...metrics, output };
  writeFileSync(path.join(output, 'validation.json'), JSON.stringify(validation, null, 2));
  console.log(JSON.stringify(validation, null, 2));
} catch (error) {
  writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ passed: false, error: error.message, output }, null, 2));
  throw error;
} finally {
  engineCommand(engine, ['closeWallpaper', '-location', name]);
}
