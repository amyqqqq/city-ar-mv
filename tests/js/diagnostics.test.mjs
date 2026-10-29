import test from 'node:test';
import assert from 'node:assert/strict';
import {ARDiagnostics} from '../../web/runtime/diagnostics.js';

test('runtime loaded does not imply camera, recognition, audible sound or alignment', () => {
  const report = new ARDiagnostics(); report.record('engine','LOADED_AND_TARGET_CONFIGURED');
  assert.equal(report.data.camera,'PENDING'); assert.equal(report.data.found,0);
  assert.equal(report.data.manualHeardAudio,false); assert.equal(report.data.manualVisualAnchor,false);
});
test('actual XR events and manual checks are recorded independently', () => {
  const report = new ARDiagnostics();
  for (const event of ['found','updated','updated','lost','ecsFrames']) report.record(event);
  report.record('camera','hasVideo'); report.record('audio',{state:'playing',time:4});
  assert.equal(report.data.found,1); assert.equal(report.data.updated,2); assert.equal(report.data.lost,1);
  assert.equal(report.data.ended15,false); report.record('ended15'); assert.equal(report.data.ended15,true);
  assert.equal(report.data.manualHeardAudio,false);
});
test('diagnostic history remains bounded without fabricating successful checks', () => {
  const report = new ARDiagnostics(); for(let i=0;i<120;i++)report.record('camera','requesting');
  assert.equal(report.data.events.length,100); assert.equal(report.data.found,0);
  report.record('error','camera denied'); assert.deepEqual(report.data.errors,['camera denied']);
});
