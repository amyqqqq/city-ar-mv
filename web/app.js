import {loadAssets} from './runtime/assets.js';
import {MVPlayer} from './runtime/player.js';
import {registerMVComponent} from './runtime/ecs-bridge.js';
import {ARDiagnostics} from './runtime/diagnostics.js';

const $ = selector => document.querySelector(selector);
const ar = document.body.dataset.mode === 'ar';
const status = $('#status');
const evidence = new ARDiagnostics(data => {
  if ($('#ar-evidence')) $('#ar-evidence').textContent = JSON.stringify(data, null, 2);
});
let lastAudioState;
const states = {ready: '就緒 · 點擊開始', playing: '播放中', paused: '已暫停',
  'waiting-target': '聲音已啟用 · 等待 city_painting', ended: '15 秒演出結束', error: '無法播放'};

function update(player, frame) {
  status.textContent = player.error || states[player.state];
  $('#tracking').textContent = `${ar ? 'AR' : '模擬辨識'} · ${player.tracked ? '已找到 city_painting' : '未找到目標'}`;
  $('#time').textContent = `${frame.time.toFixed(2)} / 15.00 s`;
  $('#progress').value = frame.time;
  $('#scene').textContent = `${String(frame.index + 1).padStart(2, '0')} · ${frame.scene}`;
  for (const item of document.querySelectorAll('[data-segment]')) item.classList.toggle('active', +item.dataset.segment === frame.index);
  $('#start').textContent = player.state === 'paused' ? '繼續播放' : player.state === 'ended' ? '再次播放' : '開始 / 啟用聲音';
  if (ar && player.state !== lastAudioState) {
    lastAudioState = player.state;
    evidence.record('audio', {state:player.state, time:frame.time, context:player.clock.context.state});
    if (player.state === 'ended') evidence.record('ended15');
  }
}

async function initAR(player) {
  if (!globalThis.isSecureContext) throw new Error('AR 相機需要可信任的 HTTPS；本機可使用 localhost');
  const [target, scene] = await Promise.all([
    fetch('./image-targets/city_painting.json').then(r => { if (!r.ok) throw new Error('target 載入失敗'); return r.json(); }),
    fetch('./scene.json').then(r => { if (!r.ok) throw new Error('scene 載入失敗'); return r.json(); }),
  ]);
  if (!window.ecs) throw new Error('8th Wall ECS runtime 未載入');
  registerMVComponent(window.ecs, player, {
    onTracking:type => evidence.record(type),
    onFrame:() => { if (player.tracked && evidence.data.ecsFrames < 300) evidence.record('ecsFrames'); },
  });
  const configure = () => {
    window.XR8.XrController.configure({imageTargetData: [target]});
    evidence.record('engine','LOADED_AND_TARGET_CONFIGURED');
    window.XR8.addCameraPipelineModule({
      name:'city-mv-acceptance',
      onCameraStatusChange:({status:cameraStatus}) => {
        evidence.record('camera', cameraStatus);
        $('#xr-status').textContent = `8th Wall 相機：${cameraStatus}`;
      },
      onException:error => {
        player.pause(); player.error = String(error?.message || error);
        evidence.record('error', player.error);
        $('#xr-status').textContent = `AR 啟動失敗：${player.error}`;
      },
    });
  };
  if (window.XR8) configure();
  else await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('8th Wall XR 引擎載入逾時')), 20000);
    window.addEventListener('xrloaded', () => { clearTimeout(timeout); configure(); resolve(); }, {once: true});
  });
  await window.ecs.application.init(scene);
}

try {
  const {manifest, images, clock} = await loadAssets();
  const player = new MVPlayer(manifest, clock, {lowPower: $('#low-power').checked});
  window.cityMV = player;
  if (ar) {
    evidence.render(evidence.data);
    $('#enable-camera').onclick = async () => {
      $('#enable-camera').disabled = true;
      $('#xr-status').textContent = '8th Wall 正在啟動，請允許相機權限…';
      try { await initAR(player); }
      catch (error) { player.error = error.message; evidence.record('error', error.message); $('#xr-status').textContent = `啟動失敗：${error.message}；請重新載入後再試。`; }
    };
    $('#heard-audio').onchange = event => evidence.record('manualHeardAudio', event.target.checked);
    $('#visual-anchor').onchange = event => evidence.record('manualVisualAnchor', event.target.checked);
    $('#export-evidence').onclick = () => {
      const result = {url:location.href, userAgent:navigator.userAgent, secure:isSecureContext, ...evidence.data};
      const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)], {type:'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = 'city-ar-phone-acceptance.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    };
  } else {
    $('#background').src = images.background.src;
    $('#character').src = images.character.src;
    player.targetFound(manifest.target);
    $('#found').onclick = () => player.targetFound(manifest.target);
    $('#lost').onclick = () => player.targetLost(manifest.target);
  }
  $('#mode').textContent = manifest.mode === 'original' ? '原有素材 · 回歸測試' : 'TRAP CITY · 新人物與霓虹舞台';
  $('#start').disabled = false;
  $('#pause').disabled = false;
  $('#restart').disabled = false;
  $('#start').onclick = () => player.start();
  $('#pause').onclick = () => player.pause();
  $('#restart').onclick = () => player.restart();
  $('#low-power').onchange = event => { player.lowPower = event.target.checked; };
  document.addEventListener('visibilitychange', () => player.setVisible(!document.hidden));
  clock.context.addEventListener('statechange', () => {
    if (clock.context.state === 'suspended' && player.state === 'playing') player.pause();
  });
  const draw = () => {
    const frame = player.tick();
    if (!ar) {
      for (const name of ['background', 'character']) {
        const pose = frame[name];
        const element = $(`#${name}`);
        element.style.left = `${(0.5 + pose.x) * 100}%`;
        element.style.top = `${(0.5 - pose.y) * 100}%`;
        element.style.width = `${pose.width * 100}%`;
        element.style.height = `${pose.height * 100}%`;
        element.style.transform = 'translate(-50%, -50%)';
        element.style.filter = `brightness(${pose.gain ?? 1})`;
        element.style.opacity = player.tracked ? pose.opacity : 0;
      }
      $('#stage').style.setProperty('--pulse', String(frame.beat));
    }
    update(player, frame);
    requestAnimationFrame(draw);
  };
  draw();
} catch (error) {
  status.textContent = `載入失敗：${error.message}`;
  status.setAttribute('role', 'alert');
  console.error(error);
}
