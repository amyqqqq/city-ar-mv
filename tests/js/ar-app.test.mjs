import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the real production bootstrap with mocked XR hardware and decoded media.
// These tests do not count as camera/phone acceptance.
let sequence=0;
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function bootstrap() {
  const previous=new Map();
  const set=(key,value)=>{previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{hidden:['#sound-start','#fatal','#desktop-debug'].includes(id),disabled:false,textContent:'',onclick:null});
    return elements.get(id);
  };
  const record={images:[],events:new Map(),tracking:new Map(),sources:[],init:0,stop:0,reloads:0};
  const context={state:'suspended',currentTime:0,destination:{},
    async resume(){this.state='running';},async close(){this.state='closed';},
    async decodeAudioData(){return {duration:15};},addEventListener(){},
    createBufferSource(){const node={connect(){},disconnect(){},stop(){},start(...args){this.args=args;}};record.sources.push(node);return node;}};
  const ecs={eid:'eid',events:{REALITY_IMAGE_FOUND:'found',REALITY_IMAGE_LOST:'lost',REALITY_IMAGE_UPDATED:'updated'},
    registerComponent(value){record.component=value;},
    defineState(){return {initial(){return this;},listen(id,event,callback){record.tracking.set(event,callback);return this;}};},
    application:{init(scene){assert.ok(Object.values(scene.objects).some(o=>o.imageTarget?.name==='city_painting'));record.init++;record.component.stateMachine({world:{events:{globalId:0}}});}}};
  set('window',{ecs,XR8:{XrController:{configure(value){record.target=value.imageTargetData[0];}},
    addCameraPipelineModule(value){record.module=value;},stop(){record.stop++;}}});
  set('document',{hidden:false,querySelector:element,addEventListener:(type,action)=>record.events.set(type,action)});
  set('navigator',{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5});
  set('location',{search:'',reload(){record.reloads++;}});
  set('isSecureContext',true);
  set('requestAnimationFrame',()=>{});
  set('AudioContext',function(){return context;});
  set('Image',class{set src(value){record.images.push(this);}});
  set('fetch',async url=>{
    const name=String(url).replace(/^\.\//,'');
    return {ok:true,status:200,json:async()=>JSON.parse(readFileSync(new URL('../../dist/'+name,import.meta.url))),arrayBuffer:async()=>new ArrayBuffer(8)};
  });
  const originalError=console.error;console.error=()=>{};
  const restore=()=>{
    for(const image of record.images)image.onload?.();
    console.error=originalError;
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  };
  try {
    await import(new URL(`../../web/ar-app.js?test=${++sequence}`,import.meta.url));
    await flush();
    return {record,context,element,restore,async mediaReady(){for(const image of record.images)image.onload?.();await flush();}};
  } catch(error){restore();throw error;}
}

test('production immediately initializes actual XR path before pictures/audio are ready',async()=>{
  const env=await bootstrap();try{
    assert.equal(env.record.init,1);assert.equal(env.record.target.name,'city_painting');
    assert.equal(env.element('#sound-start').hidden,true);assert.equal(env.element('#desktop-debug').hidden,true);
    assert.equal(env.record.sources.length,0);
    await env.mediaReady();assert.equal(env.element('#sound-start').hidden,false);
    assert.equal(env.element('#fatal').hidden,true);
  }finally{env.restore();}
});
test('real image event waits for gesture, hides the single gate, and camera tap replays after 15s',async()=>{
  const env=await bootstrap();try{
    env.record.tracking.get('found')({data:{name:'city_painting'}});await env.mediaReady();
    assert.equal(env.record.sources.length,0);
    await env.element('#sound-start').onclick();assert.equal(env.record.sources.length,1);
    assert.equal(env.element('#sound-start').hidden,true);
    env.record.sources[0].onended();
    env.record.events.get('pointerup')({target:{closest:()=>null}});await flush();
    assert.equal(env.record.sources.length,2);assert.equal(env.record.sources[1].args[1],0);
    assert.equal(env.element('#sound-start').hidden,true);
  }finally{env.restore();}
});
test('camera failure only reveals a short error and retry; late media cannot reveal extra controls',async()=>{
  const env=await bootstrap();try{
    env.record.module.onCameraStatusChange({status:'failed'});await env.mediaReady();
    assert.equal(env.element('#fatal').hidden,false);
    assert.equal(env.element('#fatal-message').textContent,'無法使用相機，請允許相機權限後重試。');
    assert.equal(env.element('#sound-start').hidden,true);assert.equal(env.element('#desktop-debug').hidden,true);
    assert.equal(env.record.stop,1);env.element('#retry').onclick();assert.equal(env.record.reloads,1);
  }finally{env.restore();}
});
