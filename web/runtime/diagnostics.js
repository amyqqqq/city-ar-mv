export class ARDiagnostics {
  constructor(render = () => {}) {
    this.render = render;
    this.data = {engine:'PENDING', camera:'PENDING', found:0, updated:0, lost:0, ecsFrames:0,
      audio:'PENDING', ended15:false, manualHeardAudio:false, manualVisualAnchor:false, errors:[], events:[]};
  }
  record(type, value) {
    const d = this.data;
    if (['engine','camera','audio','manualHeardAudio','manualVisualAnchor'].includes(type)) d[type] = value;
    else if (['found','updated','lost','ecsFrames'].includes(type)) d[type]++;
    else if (type === 'ended15') d.ended15 = true;
    else if (type === 'error') d.errors.push(String(value));
    if (!['updated','ecsFrames'].includes(type)) {
      d.events.push({time:new Date().toISOString(),type,value});
      d.events = d.events.slice(-100);
    }
    this.render(d);
  }
}
