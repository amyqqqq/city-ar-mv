import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AutomaticPlayback,desktopDebug} from '../../web/runtime/automatic-playback.js';
import {MVPlayer} from '../../web/runtime/player.js';
import {AudioClock} from '../../web/runtime/audio-clock.js';

const manifest=JSON.parse(readFileSync(new URL('../../dist/manifest.json',import.meta.url)));
function fixture(state='running') {
  const prompts=[];
  const context={state,currentTime:0,destination:{},sources:[],resumes:0,
    async resume(){this.resumes++;this.state='running';},
    createBufferSource(){const node={connect(){},disconnect(){},stop(){},start(...args){this.args=args;}};this.sources.push(node);return node;}};
  const player=new MVPlayer(manifest,new AudioClock(context,{duration:15}));
  const session=new AutomaticPlayback(manifest,show=>prompts.push(show));
  return {session,player,context,prompts};
}
test('real target automatically starts allowed audio; no manual Start control',async()=>{
  const {session,player,context,prompts}=fixture();await session.bind(player);
  assert.equal(context.sources.length,0);await session.targetFound('city_painting');
  assert.equal(player.state,'playing');assert.equal(context.sources.length,1);assert.deepEqual(prompts,[]);
});
test('blocked audio never awaits a non-gesture resume; one minimal gate unlocks it',async()=>{
  const {session,player,context,prompts}=fixture('suspended');
  context.resume=()=>{context.resumes++;return new Promise(()=>{});};
  await session.bind(player);await session.targetFound('city_painting');await session.targetFound('city_painting');
  assert.equal(context.resumes,0);assert.deepEqual(prompts,[true]);assert.equal(context.sources.length,0);
  context.resume=async()=>{context.resumes++;context.state='running';};
  await session.activate(true);assert.equal(player.state,'playing');assert.deepEqual(prompts,[true,false]);
  session.targetLost('city_painting');await session.targetFound('city_painting');
  assert.deepEqual(prompts,[true,false]);
});
test('tracking received before media is decoded is retained, not fabricated',async()=>{
  const {session,player,context}=fixture();session.targetFound('other');assert.equal(session.tracked,false);
  session.targetFound('city_painting');assert.equal(session.tick().time,0);assert.equal(context.sources.length,0);
  await session.bind(player);assert.equal(player.state,'playing');assert.equal(context.sources.length,1);
});
test('target lost before media ready never starts an unanchored performance',async()=>{
  const {session,player,context}=fixture();session.targetFound('city_painting');session.targetLost('city_painting');
  await session.bind(player);assert.equal(context.sources.length,0);assert.equal(player.tracked,false);
});
test('lost/found preserves audio offset and never repeats the sound gate',async()=>{
  const {session,player,context,prompts}=fixture();await session.bind(player);await session.targetFound('city_painting');
  context.currentTime=4.2;session.targetLost('city_painting');context.currentTime=40;
  assert.equal(session.tick().time,4.2);await session.targetFound('city_painting');
  assert.equal(context.sources.at(-1).args[1],4.2);assert.deepEqual(prompts,[]);
});
test('after 15s a screen replay or a fresh scan starts at zero',async()=>{
  const {session,player,context}=fixture();await session.bind(player);await session.targetFound('city_painting');
  context.currentTime=16;assert.equal(session.tick().time,15);await session.replay();assert.equal(session.tick().time,0);
  context.currentTime=32;session.tick();session.targetLost('city_painting');await session.targetFound('city_painting');
  assert.equal(session.tick().time,0);assert.equal(player.state,'playing');
});
test('failed startup cannot start or display audio gate later',async()=>{
  const {session,player,context,prompts}=fixture('suspended');await session.bind(player);session.stop();
  await session.targetFound('city_painting');await session.activate(true);
  assert.equal(context.sources.length,0);assert.deepEqual(prompts,[true,false]);
});
test('debug requires explicit desktop mode and stays hidden on phones and iPad',()=>{
  assert.equal(desktopDebug({userAgent:'Desktop',search:''}),false);
  assert.equal(desktopDebug({userAgent:'Desktop',search:'?debug=1'}),true);
  for(const userAgent of ['iPhone','iPad','Android'])assert.equal(desktopDebug({userAgent,search:'?debug=1'}),false);
  assert.equal(desktopDebug({platform:'MacIntel',maxTouchPoints:5,search:'?debug=1'}),false);
  assert.equal(desktopDebug({mobile:true,search:'?debug=1'}),false);
});
test('production page has only hidden overlays and auto-init module, no old control panels',()=>{
  const html=readFileSync(new URL('../../web/ar.html',import.meta.url),'utf8');
  assert.ok(html.includes('viewport-fit=cover'));assert.ok(html.includes('src="ar-app.js"'));
  for(const id of ['sound-start','fatal','desktop-debug'])assert.match(html,new RegExp(`id="${id}"[^>]*hidden`));
  for(const old of ['enable-camera','ar-panel','id="tracking"','id="progress"','id="scene"'])assert.ok(!html.includes(old));
});
