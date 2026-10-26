const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync("native-liquid-glass-youbar/index.js", "utf8");
const marker = "unbound.glass.youbar.background";
const timers = [];
const setTimer = fn => { const t = {fn, cancelled:false, done:false}; timers.push(t); return t; };
const cancelTimer = timer => { timer.cancelled = true; };
async function tick() {
  const t = timers.find(x => !x.done && !x.cancelled);
  if (!t) return false;
  t.done = true;
  await t.fn();
  await Promise.resolve();
  return true;
}
let state = false, cleanup = null, effectActive = false;
const NativeView = {name:"View"};
const React = {
  isValidElement: e => e && typeof e === "object" && "type" in e,
  cloneElement: (e,props) => ({...e,props:{...e.props,...props}}),
  createElement: (type,props,children) => ({type,props:{...props,children}}),
  useState: () => [state, setter => {state = setter;}],
  useEffect: fn => {if (!effectActive) {effectActive=true;cleanup=fn();}}
};
const component = {type:() => ({type:"MaskedBackground",props:{backgroundColor:"#222",barWidth:270}})};
const originalType = component.type;
const resolver = {resolveSemanticColor: () => "#222"};
const patches = [];
const context = {
  console, Promise, setTimeout:setTimer, clearTimeout:cancelTimer,
  unbound: {
    metro: {
      findByFilePath(path) {
        assert.equal(path,"modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx");
        return {default:component};
      },
      common: {React,ReactNative:{View:NativeView},Theme:{internal:resolver}}
    },
    patcher:{createPatcher:() => ({
      after(parent,key,cb) {
        const original=parent[key];
        parent[key]=(...args)=>cb({args,result:original(...args)})??original(...args);
        patches.push(()=>{parent[key]=original;});
      },
      unpatchAll(){while(patches.length)patches.pop()();}
    })}
  },
  NativePlugin:{objc:{
    glassAttachById:async(id,clear,override)=>{
      assert.equal(id,marker);assert.equal(clear,true);assert.equal(override,true);return true;
    },
    glassDetachById:async id=>assert.equal(id,marker)
  }}
};
context.globalThis=context;
async function run(){
  const plugin=vm.runInNewContext(source,context);
  plugin.start();
  const wrapped=component.type();
  assert.equal(typeof wrapped.type,"function");
  const first=wrapped.type(wrapped.props);
  assert.equal(first.type,NativeView);
  assert.equal(first.props.testID,marker);
  assert.equal(first.props.collapsable,false);
  assert.equal(first.props.pointerEvents,"none");
  assert.equal(first.props.children.props.backgroundColor,"#222",
    "Original background must stay until native glass attachment succeeds");
  assert.equal(resolver.resolveSemanticColor(),"#222",
    "Native glass plugin must not modify Titanium Blue or any global theme tokens");
  assert.equal(await tick(),true);
  const second=wrapped.type(wrapped.props);
  assert.equal(second.props.children.props.backgroundColor,"transparent",
    "Only a confirmed UIKit attachment makes the bar transparent");
  if(cleanup)cleanup();
  plugin.stop();
  assert.equal(component.type,originalType);
  assert.equal(context.__unboundGlassRuntimeStatus.phase,"stopped");
  // The installed client previously lacked NativePlugin after core JS startup.
  // Verify the plugin can recover when the native bridge appears on a retry.
  const missingBridge = {...context, NativePlugin:undefined};
  missingBridge.globalThis = missingBridge;
  const recovering = vm.runInNewContext(source,missingBridge);
  recovering.start();
  assert.equal(missingBridge.__unboundGlassRuntimeStatus.code,"NATIVE_BRIDGE_MISSING");
  assert.equal(missingBridge.__unboundGlassRuntimeStatus.patchInstalled,false);
  missingBridge.NativePlugin = context.NativePlugin;
  assert.equal(await tick(),true);
  assert.equal(missingBridge.__unboundGlassRuntimeStatus.patchInstalled,true);
  recovering.stop();
  assert.equal(component.type,originalType);
  console.log("PASS: exact marker, opaque fallback, confirmed glass, scoped theme, missing-bridge recovery, rollback");
}
run().catch(error=>{console.error(error);process.exitCode=1;});
