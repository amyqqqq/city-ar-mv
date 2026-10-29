import {loadAssets} from './runtime/assets.js';
import {validateManifest} from './runtime/timeline.js';
import {MVPlayer} from './runtime/player.js';
import {registerMVComponent} from './runtime/ecs-bridge.js';
import {AutomaticPlayback, desktopDebug} from './runtime/automatic-playback.js';
import {ARDiagnostics} from './runtime/diagnostics.js';

const $ = selector => document.querySelector(selector);
const debug = desktopDebug({search:location.search,userAgent:navigator.userAgent,platform:navigator.platform,
  maxTouchPoints:navigator.maxTouchPoints,mobile:navigator.userAgentData?.mobile});
$('#desktop-debug').hidden = !debug;
let session;
let failed = false;
const evidence = new ARDiagnostics(data => {
  if (debug) $('#ar-evidence').textContent = JSON.stringify(data,null,2);
});
function fail(error, camera = false) {
  if (failed) return;
  failed = true;
  session?.stop();
  try { window.XR8?.stop?.(); } catch { /* Engine may already have stopped after the exception. */ }
  $('#sound-start').hidden = true;
  evidence.record('error',String(error?.message || error));
  $('#fatal-message').textContent = camera || /NotAllowed|permission|denied/i.test(String(error?.message || error))
    ? '無法使用相機，請允許相機權限後重試。' : '無法啟動 AR，請重試。';
  $('#fatal').hidden = false;
  console.error('AR initialization failed',error);
}
$('#retry').onclick = () => location.reload();
async function json(path) {
  const result = await fetch(path,{signal:AbortSignal.timeout(20000)});
  if (!result.ok) throw new Error(`${path}: HTTP ${result.status}`);
  return result.json();
}
function xrLoaded() {
  if (window.XR8?.XrController) return Promise.resolve();
  return new Promise((resolve,reject) => {
    const loaded = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { window.removeEventListener('xrloaded',loaded); reject(new Error('XR load timeout')); },20000);
    window.addEventListener('xrloaded',loaded,{once:true});
  });
}

// Begin XR/target requests now; camera initialization never waits for media decoding.
const sessionReady = json('./manifest.json').then(validateManifest).then(manifest => {
  session = new AutomaticPlayback(manifest,show => { $('#sound-start').hidden = failed || !show; });
  return session;
});
const sceneReady = Promise.all([json('./image-targets/city_painting.json'),json('./scene.json')]);

async function initializeXR() {
  if (!isSecureContext) throw new Error('HTTPS required');
  const [playback,[target,scene]] = await Promise.all([sessionReady,sceneReady,xrLoaded()]);
  if (!window.ecs) throw new Error('ECS runtime unavailable');
  if (failed) return;
  registerMVComponent(window.ecs,playback,{
    onTracking:type => { if (debug) evidence.record(type); },
    onFrame:() => { if (debug && playback.tracked && evidence.data.ecsFrames < 300) evidence.record('ecsFrames'); },
  });
  window.XR8.XrController.configure({imageTargetData: [target]});
  evidence.record('engine','LOADED_AND_TARGET_CONFIGURED');
  window.XR8.addCameraPipelineModule({
    name:'city-mv-fullscreen',
    onCameraStatusChange:({status}) => {
      evidence.record('camera',status);
      if (status === 'failed') fail(new Error('Camera unavailable'),true);
    },
    onException:error => fail(error),
  });
  await window.ecs.application.init(scene);
}
void initializeXR().catch(fail);

void sessionReady.then(async playback => {
  const {manifest,clock} = await loadAssets(playback.manifest);
  if (failed) { await clock.context.close(); return; }
  const player = new MVPlayer(manifest,clock,{lowPower:true});
  if (debug) window.cityMV = player;
  $('#sound-start').onclick = async () => {
    $('#sound-start').disabled = true;
    try { await playback.activate(true); }
    finally { $('#sound-start').disabled = false; }
  };
  $('#debug-pause').onclick = () => playback.pause();
  $('#debug-resume').onclick = () => playback.activate(true);
  $('#debug-restart').onclick = () => playback.replay();
  $('#export-evidence').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence.data,null,2)],{type:'application/json'}));
    const link = document.createElement('a');link.href=url;link.download='city-ar-debug.json';link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  document.addEventListener('visibilitychange',() => playback.setVisible(!document.hidden));
  clock.context.addEventListener('statechange',() => {
    if (clock.context.state !== 'running' && player.state === 'playing') playback.interrupt();
    if (clock.context.state === 'running' && !document.hidden && !playback.manuallyPaused && clock.now() < manifest.duration) void playback.activate();
  });
  document.addEventListener('pointerup',event => {
    if (!event.target.closest('button,a,section') && clock.now() >= manifest.duration && playback.tracked) void playback.replay();
  });
  await playback.bind(player);
  playback.setVisible(!document.hidden);
  let previous;
  const draw = () => {
    if (failed) return;
    const frame = playback.tick();
    if (debug) {
      $('#debug-time').textContent = `${frame.time.toFixed(2)} / 15.00 s`;
      if (previous !== player.state) { previous=player.state;evidence.record('audio',{state:player.state,time:frame.time,context:clock.context.state}); }
      if (player.state === 'ended' && !evidence.data.ended15) evidence.record('ended15');
    }
    requestAnimationFrame(draw);
  };
  draw();
}).catch(fail);
