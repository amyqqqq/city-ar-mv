export function validateManifest(value) {
  if (value.target !== 'city_painting' || value.duration !== 15 || value.engine !== '8th Wall') {
    throw new Error('Manifest 必須使用 8th Wall / city_painting / 15 秒');
  }
  let cursor = 0;
  for (const scene of value.timeline) {
    if (scene.from !== cursor || scene.to <= cursor) throw new Error('時間軸不連續');
    cursor = scene.to;
  }
  if (cursor !== 15 || !(value.bpm > 0)) throw new Error('時間軸長度或 BPM 錯誤');
  if (!['pause', 'continue'].includes(value.tracking_lost_policy)) throw new Error('未知 tracking lost 策略');
  for (const key of ['audio', 'background', 'character']) {
    const path = value.assets[key];
    if (typeof path !== 'string' || !/^assets\/[\w.-]+$/.test(path)) throw new Error('素材路徑必須是本地 assets 檔案');
  }
  return value;
}

const clamp = value => Math.max(0, Math.min(1, value));

// No delta-time accumulation: seeking, slow frames and resuming evaluate the same pose.
export function sampleTimeline(manifest, seconds, lowPower = false) {
  const time = Math.max(0, Math.min(manifest.duration, seconds));
  const index = Math.min(manifest.timeline.length - 1, manifest.timeline.findIndex(s => time < s.to) < 0
    ? manifest.timeline.length - 1 : manifest.timeline.findIndex(s => time < s.to));
  const beat = Math.exp(-((time * manifest.bpm / 60) % 1) * 8);
  const onset = (manifest.onsets || []).some(t => time >= t && time - t < .08) ? 1 : 0;
  const intensity = Math.max(beat, onset);
  const outro = clamp((15 - time) / .75);
  const characterOpacity = clamp((time - 3) / 1.1) * outro;
  const amplitude = (lowPower ? .25 : 1) * clamp(time) * clamp(15 - time);
  const energy = [0.25, 0.65, 1, 0.8, 1.15][index];
  const phase = time * manifest.bpm / 60 * Math.PI * 2;
  const layout = manifest.layout || {};
  const stageLayout = layout.background || {width: 1, height: 1, z: .02};
  const performer = layout.character || {width: 1, height: 1, x: 0, ground_y: -.5, foot_uv: 1, z: .04};
  const stageScale = 1 + Math.sin(time * .85) * .006 * amplitude;
  const stageY = Math.sin(time * 1.65) * .009 * amplitude;
  const stageX = Math.sin(time * .8) * .006 * amplitude;
  const sway = Math.sin(phase / 2) * .013 * amplitude * energy;
  const bounce = Math.abs(Math.sin(phase / 2)) * .006 * amplitude * energy;
  // Scale about the feet: vertical breathing never pushes soles below the platform.
  const bodyScale = 1 + Math.sin(phase) * .009 * amplitude * energy;
  const bodyHeight = performer.height * stageScale * bodyScale;
  const groundY = stageY + performer.ground_y * stageScale;
  const gain = 1 - amplitude * (.06 + .12 * (1 - intensity) * energy);
  const background = {
    x: stageX, y: stageY, z: stageLayout.z, scale: stageScale,
    width: stageLayout.width * stageScale, height: stageLayout.height * stageScale,
    opacity: .4 + .6 * clamp(time / 2), gain,
  };
  const character = {
    x: stageX + performer.x * stageScale + sway,
    y: groundY + (performer.foot_uv - .5) * bodyHeight + bounce,
    z: performer.z, scale: bodyScale, width: performer.width * stageScale * bodyScale,
    height: bodyHeight, opacity: characterOpacity, gain: 1,
  };
  return {time, index, scene: manifest.timeline[index].scene, beat: intensity, background, character};
}
