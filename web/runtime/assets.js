import {validateManifest} from './timeline.js';
import {AudioClock} from './audio-clock.js';

async function fetchLocal(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`素材載入失敗 ${response.status}: ${url}`);
  return response;
}

function image(url) {
  return new Promise((resolve, reject) => {
    const value = new Image();
    const timer = setTimeout(() => reject(new Error(`圖片載入逾時: ${url}`)), 20000);
    value.onload = () => { clearTimeout(timer); resolve(value); };
    value.onerror = () => { clearTimeout(timer); reject(new Error(`圖片無法解碼: ${url}`)); };
    value.src = url;
  });
}

export async function loadAssets(manifestUrl = './manifest.json') {
  const manifest = validateManifest(await (await fetchLocal(manifestUrl)).json());
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw new Error('此瀏覽器不支援 WebAudio');
  const context = new Context();
  try {
    const [bytes, background, character] = await Promise.all([
      fetchLocal(manifest.assets.audio).then(r => r.arrayBuffer()),
      image(manifest.assets.background), image(manifest.assets.character),
    ]);
    const buffer = await context.decodeAudioData(bytes);
    if (buffer.duration < 14.95) throw new Error('音訊少於 15 秒');
    return {manifest, images: {background, character}, clock: new AudioClock(context, buffer, manifest.duration)};
  } catch (error) {
    await context.close();
    throw error;
  }
}
