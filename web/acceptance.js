const preflight = document.querySelector('#preflight');
try {
  if (!isSecureContext) throw new Error('需要可信任 HTTPS');
  const response = await fetch('manifest.json');
  if (!response.ok) throw new Error('manifest 無法載入');
  const manifest = await response.json();
  const paths = ['external/runtime/runtime.js', 'external/xr/xr.js', 'external/xr/xr-slam.js',
    'image-targets/city_painting.json', 'image-targets/city_painting_luminance.jpg', 'scene.json', ...Object.values(manifest.assets)];
  await Promise.all(paths.map(async path => {
    const result = await fetch(path, {method:'HEAD'});
    if (!result.ok) throw new Error(`${path}: HTTP ${result.status}`);
  }));
  preflight.textContent = `HTTPS 與 ${paths.length} 個發布資源正常；實際相機與辨識仍待測。`;
} catch (error) { preflight.textContent = `前置檢查失敗：${error.message}`; }
document.querySelector('#camera-check').onclick = async () => {
  const output = document.querySelector('#camera-result');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    stream.getTracks().forEach(track => track.stop());
    output.textContent = '已取得相機權限並關閉測試串流；請進入 AR 頁驗證真正追蹤。';
  } catch (error) { output.textContent = `相機權限／設備測試失敗：${error.name} — ${error.message}`; }
};
