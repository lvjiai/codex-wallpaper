import { SceneController } from './controller.mjs';
import { enumerateWallpapers } from './platform.mjs';
import { openLibrary } from './library.mjs';

const command = process.argv[2] || 'status';
if (command === 'status') console.log(JSON.stringify(await new SceneController().status(), null, 2));
else if (command === 'list') console.log(JSON.stringify(enumerateWallpapers(), null, 2));
else if (command === 'run' || command === 'select') {
  const controller = new SceneController();
  process.on('SIGINT', async () => { await controller.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await controller.stop(false); process.exit(0); });
  try {
    const playlist = process.argv.slice(3);
    const result = command === 'select' ? await openLibrary(controller) : await controller.start(playlist.length ? { playlist } : {});
    console.log(JSON.stringify(result, null, 2));
    if (command === 'run') await openLibrary(controller, { visible: false }).catch(error => console.error(error.message));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
} else throw new Error('用法：node src/cli.mjs status | list | select | run [project.json ...]');
