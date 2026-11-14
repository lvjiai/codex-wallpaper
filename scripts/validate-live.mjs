import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ROOT, validateProject } from '../src/platform.mjs';
import { SceneController } from '../src/controller.mjs';

const playlist = process.argv.slice(2);
if (!playlist.length) throw new Error('用法：node scripts/validate-live.mjs <project.json> [...]');
const wallpapers = playlist.map(validateProject);
const directory = path.join(ROOT, 'outputs', 'live-validation', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(directory, { recursive: true });
const controller = new SceneController();
const appearance = { dim: 0.48, readingShade: 0.18 };
let finish;
const done = new Promise(resolve => { finish = resolve; });
process.once('SIGINT', finish); process.once('SIGTERM', finish);
try {
  const started = await controller.start({ playlist, persist: false, fps: 10, ...appearance, captureMode: 'system-picker', width: 1280, height: 800, frameDumpDirectory: directory });
  console.log(JSON.stringify({ started, directory, verificationWindowSeconds: 300 }));
  const timer = setTimeout(finish, 300000);
  let updating=false;
  const sample = setInterval(async () => {
    writeFileSync(path.join(directory, 'progress.json'), JSON.stringify({ captured: controller.frames, delivered: controller.delivered, lastError: controller.lastError }, null, 2));
    if(existsSync(path.join(directory,'stop')))finish();
    if (!updating && existsSync(path.join(directory, 'refresh'))) {
      updating = true;
      unlinkSync(path.join(directory, 'refresh'));
      try { await controller.refreshBackground(appearance); }
      catch (error) { console.error(error.message); }
      finally { updating = false; }
    }
  }, 1000);
  await done; clearTimeout(timer); clearInterval(sample);
  const result = { transportPassed: controller.delivered >= 10 && !controller.lastError, visualAcceptance:'pending', wallpapers, captured: controller.frames, delivered: controller.delivered, lastError: controller.lastError, durationLimitSeconds: 300 };
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ passed: false, error: error.message }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
} finally { await controller.stop(false); }
