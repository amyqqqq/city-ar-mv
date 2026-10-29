import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MVPlayer} from '../../web/runtime/player.js';
import {AudioClock} from '../../web/runtime/audio-clock.js';
import {sampleTimeline, validateManifest} from '../../web/runtime/timeline.js';
import {registerMVComponent} from '../../web/runtime/ecs-bridge.js';

const manifest = JSON.parse(readFileSync(new URL('../../dist/manifest.json', import.meta.url)));

function fixture(extra = {}) {
  const context = {currentTime: 0, destination: {}, resume: async () => {},
    sources: [], createBufferSource() {
      const node = {connect() {}, disconnect() {}, stop() {}, start(...args) { this.args = args; }};
      this.sources.push(node); return node;
    }};
  const clock = new AudioClock(context, {duration: 15});
  const player = new MVPlayer({...manifest, ...extra}, clock);
  return {context, clock, player};
}

test('no audio before user gesture even when city_painting is found', () => {
  const {context, player} = fixture(); player.targetFound('city_painting');
  assert.equal(player.state, 'ready'); assert.equal(context.sources.length, 0);
});
test('gesture without target waits; wrong target is ignored', async () => {
  const {context, player} = fixture(); await player.start();
  player.targetFound('other'); assert.equal(player.state, 'waiting-target');
  assert.equal(context.sources.length, 0);
  player.targetFound('city_painting'); assert.equal(player.state, 'playing');
});
test('audio master clock drives jumps without accumulating frame time', async () => {
  const {context, player} = fixture(); player.targetFound('city_painting'); await player.start();
  context.currentTime = 7.25; assert.equal(player.tick().time, 7.25); assert.equal(player.tick().index, 2);
  context.currentTime = 12.5; assert.equal(player.tick().index, 4);
});
test('tracking lost pauses and found resumes exactly from saved audio offset', async () => {
  const {context, clock, player} = fixture(); player.targetFound('city_painting'); await player.start();
  context.currentTime = 4.2; player.targetLost('city_painting');
  assert.equal(player.state, 'waiting-target'); context.currentTime = 100;
  assert.equal(clock.now(), 4.2); player.targetFound('city_painting');
  assert.equal(context.sources.at(-1).args[1], 4.2);
  context.currentTime = 100.5; assert.ok(Math.abs(clock.now() - 4.7) < 1e-10);
});
test('repeated found/start never duplicates audio sources', async () => {
  const {context, player} = fixture(); player.targetFound('city_painting'); await player.start();
  player.targetFound('city_painting'); await player.start(); assert.equal(context.sources.length, 1);
});
test('manual pause persists across target lost/found', async () => {
  const {player, clock} = fixture(); player.targetFound('city_painting'); await player.start();
  player.pause(); player.targetLost('city_painting'); player.targetFound('city_painting');
  assert.equal(clock.source, null); assert.equal(player.state, 'paused');
});
test('hidden tab pauses and resumes from saved offset', async () => {
  const {context, player, clock} = fixture(); player.targetFound('city_painting'); await player.start();
  context.currentTime = 2; player.setVisible(false); context.currentTime = 30;
  assert.equal(clock.now(), 2); player.setVisible(true); assert.equal(clock.now(), 2);
});
test('continue policy keeps audio playing while tracking is lost', async () => {
  const {context, player} = fixture({tracking_lost_policy: 'continue'});
  player.targetFound('city_painting'); await player.start(); player.targetLost('city_painting');
  context.currentTime = 5; assert.equal(player.tick().time, 5); assert.equal(player.state, 'playing');
});
test('15 second end stops and Restart rewinds to zero', async () => {
  const {context, player, clock} = fixture(); player.targetFound('city_painting'); await player.start();
  context.currentTime = 17; assert.equal(player.tick().time, 15); assert.equal(player.state, 'ended');
  assert.equal(clock.source, null); await player.restart(); assert.equal(player.tick().time, 0);
});
test('source naturally ends at 15s even without render frames', async () => {
  const {context, player, clock} = fixture(); player.targetFound('city_painting'); await player.start();
  assert.equal(context.sources[0].args[2], 15);
  context.sources[0].onended(); assert.equal(clock.now(), 15); assert.equal(player.state, 'ended');
});
test('rejected audio gesture exposes error and does not play', async () => {
  const {context, player} = fixture(); context.resume = async () => { throw new Error('denied'); };
  await player.start(); assert.equal(player.state, 'error'); assert.equal(player.error, 'denied');
  assert.equal(context.sources.length, 0);
});
test('tracking lost while unlock is pending cannot start audio', async () => {
  const {context, player} = fixture(); let unlock;
  context.resume = () => new Promise(resolve => { unlock = resolve; });
  player.targetFound('city_painting'); const task = player.start();
  player.targetLost('city_painting'); unlock(); await task;
  assert.equal(player.state, 'waiting-target'); assert.equal(context.sources.length, 0);
});
test('all scene boundaries and low power pose are deterministic', () => {
  assert.deepEqual([0, 3, 6, 9, 12, 15].map(t => sampleTimeline(manifest, t).index), [0, 1, 2, 3, 4, 4]);
  assert.equal(sampleTimeline(manifest, 0).character.opacity, 0);
  assert.equal(sampleTimeline(manifest, 15).character.opacity, 0);
  const displacement = lowPower => {
    const frame = sampleTimeline(manifest, 7.3, lowPower);
    return Math.abs(frame.character.x - frame.background.x - (manifest.layout?.character?.x || 0) * frame.background.scale);
  };
  assert.ok(displacement(true) < displacement(false));
});
test('reject changed target, duration, remote URLs and timeline gaps', () => {
  for (const overrides of [{target: 'changed'}, {duration: 16}, {assets: {...manifest.assets, audio: 'https://bad.test/a.mp3'}},
    {timeline: [{from: 0, to: 3}, {from: 4, to: 15}]}]) {
    assert.throws(() => validateManifest({...manifest, ...overrides}));
  }
});
test('ECS bridge routes real event names, ignores wrong targets, applies child poses', async () => {
  const {player} = fixture(); const listeners = new Map(); const writes = [];
  let definition;
  const ecs = {eid: 'eid', events: {REALITY_IMAGE_FOUND: 'reality.imagefound', REALITY_IMAGE_LOST: 'reality.imagelost'},
    registerComponent(value) { definition = value; },
    defineState() { const state = {initial() { return this; }, listen(id, event, callback) { listeners.set(event, callback); return this; }}; return state; },
    Position: {set: (w, id, pose) => writes.push(['position', id, pose])},
    Scale: {set: (w, id, pose) => writes.push(['scale', id, pose])},
    Material: {has: () => true, mutate(w, id, action) { const material = {}; action(material); writes.push(['material', id, material]); }}};
  registerMVComponent(ecs, player);
  const world = {events: {globalId: 0}}; definition.stateMachine({world});
  listeners.get('reality.imagefound')({data: {name: 'city_painting'}}); await player.start();
  definition.tick(world, {schema: {background: 2, character: 3}});
  assert.equal(writes.length, 6); assert.ok(writes.every(row => [2, 3].includes(row[1])));
  const material = writes.find(row => row[0] === 'material' && row[1] === 3)[2];
  assert.equal(material.forceTransparent, true);
  assert.equal(material.depthWrite, false);
  listeners.get('reality.imagelost')({data: {name: 'city_painting'}});
  assert.equal(player.state, 'waiting-target');
});

test('new images retain aspect ratio and character stays in front of city', () => {
  const frame = sampleTimeline(manifest, 7);
  const layout = manifest.layout;
  assert.ok(Math.abs(frame.background.width / frame.background.height - 1448 / 1086) < 1e-10);
  assert.ok(Math.abs(frame.character.width / frame.character.height - 1086 / 1448) < 1e-10);
  assert.ok(frame.character.z > frame.background.z);
  assert.equal(layout.character.width, .39);
});

test('foot contact follows moving platform and bounce never penetrates the floor', () => {
  const {character} = manifest.layout;
  for (let time = 3; time <= 15; time += .03125) {
    const frame = sampleTimeline(manifest, time);
    const floor = frame.background.y + character.ground_y * frame.background.scale;
    const foot = frame.character.y - (character.foot_uv - .5) * frame.character.height;
    assert.ok(foot >= floor - 1e-10);
    assert.ok(foot - floor <= .007);
  }
});

test('neon gain and stage float vary across audio time, and pause freezes every effect', async () => {
  const at = [4, 4.1, 7.2, 10.6, 13].map(t => sampleTimeline(manifest, t));
  assert.ok(new Set(at.map(frame => frame.background.gain)).size > 1);
  assert.ok(new Set(at.map(frame => frame.background.y)).size > 1);
  assert.ok(at.every(frame => frame.background.gain >= .7 && frame.background.gain <= 1));
  const {context, player} = fixture(); player.targetFound('city_painting'); await player.start();
  context.currentTime = 7; player.pause(); const paused = player.tick();
  context.currentTime = 30; assert.deepEqual(player.tick(), paused);
  await player.start(); assert.deepEqual(player.tick(), paused);
});
