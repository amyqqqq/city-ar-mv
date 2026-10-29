// Supported ECS components and image target events; target transform stays engine-owned.
export function registerMVComponent(ecs, player, {onTracking = () => {}, onFrame = () => {}} = {}) {
  const apply = (world, eid, pose) => {
    ecs.Position.set(world, eid, {x: pose.x, y: pose.y, z: pose.z});
    ecs.Scale.set(world, eid, {x: pose.width, y: pose.height, z: 1});
    if (ecs.Material.has(world, eid)) {
      ecs.Material.mutate(world, eid, material => {
        material.opacity = pose.opacity;
        material.forceTransparent = true;
        material.depthWrite = false;
        const tint = Math.round(255 * (pose.gain ?? 1));
        material.r = tint; material.g = tint; material.b = tint;
        return false;
      });
    }
  };
  ecs.registerComponent({
    name: 'City MV Controller',
    schema: {background: ecs.eid, character: ecs.eid},
    tick: (world, component) => {
      const frame = player.tick();
      apply(world, component.schema.background, frame.background);
      apply(world, component.schema.character, frame.character);
      onFrame(frame);
    },
    stateMachine: ({world}) => {
      const state = ecs.defineState('ready').initial()
        .listen(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, event => {
          player.targetFound(event.data?.name);
          if (event.data?.name === player.manifest.target) onTracking('found');
        })
        .listen(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, event => {
          player.targetLost(event.data?.name);
          if (event.data?.name === player.manifest.target) onTracking('lost');
        });
      if (ecs.events.REALITY_IMAGE_UPDATED) state.listen(world.events.globalId, ecs.events.REALITY_IMAGE_UPDATED, event => {
        if (event.data?.name === player.manifest.target) onTracking('updated');
      });
    },
  });
}
