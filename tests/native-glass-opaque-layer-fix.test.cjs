const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const bundled = fs.readFileSync("native-liquid-glass-youbar/index.js", "utf8");
const companion = fs.readFileSync("native-glass-opaque-layer-fix/index.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("native-glass-opaque-layer-fix/manifest.json", "utf8"));
assert.notEqual(manifest.id, "native-liquid-glass-youbar",
  "Companion must not trigger bundled-plugin suppression in this IPA");

async function test() {
  const timers = [];
  const setTimer = fn => {
    const t = {fn, cancelled:false, done:false};
    timers.push(t);
    return t;
  };
  const clearTimer = timer => {timer.cancelled = true;};
  async function tick() {
    const t = timers.find(x => !x.done && !x.cancelled);
    if (!t) return false;
    t.done = true;
    await t.fn();
    await Promise.resolve();
    return true;
  }

  let state = false, cleanup = null, effectUsed = false;
  const NativeView = {view:"native"};
  const React = {
    isValidElement: item => !!item && typeof item === "object" && "type" in item,
    createElement: (type, props, ...children) =>
      ({type, props:{...(props || {}), ...(
        children.length ? {children:children.length === 1 ? children[0] : children} : {}
      )}}),
    cloneElement: (item, props) => ({...item,props:{...item.props,...props}}),
    useState: () => [state, value => { state = value; }],
    useEffect(fn) {if (!effectUsed) {effectUsed = true;cleanup = fn();}}
  };
  const original = {type:"OriginalMaskedBackground",props:{backgroundColor:"#222",barWidth:345}};
  const target = {type:()=>original};
  const patchers = [];
  const ctx = {
    console, Promise, setTimeout:setTimer, clearTimeout:clearTimer,
    NativePlugin:{objc:{
      glassAttachById:async()=>true,
      glassDetachById:async()=>undefined,
      glassInspectById:async()=>JSON.stringify({materialAttached:1,coveringOpaqueChildren:1})
    }},
    unbound: {
      metro: {
        findByFilePath(p) {
          assert.equal(p,"modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx");
          return {default:target};
        },
        common:{React,ReactNative:{View:NativeView}}
      },
      patcher:{
        createPatcher(name) {
          const owned = [];
          return {
            after(object,key,callback) {
              const previous = object[key];
              object[key] = (...args) => {
                const result = previous(...args);
                return callback({result,args}) ?? result;
              };
              owned.push(()=>{ object[key] = previous; });
              patchers.push(name);
            },
            unpatchAll(){while(owned.length) owned.pop()();}
          };
        }
      }
    }
  };
  ctx.globalThis = ctx;

  const builtin = vm.runInNewContext(bundled,ctx);
  builtin.start();
  assert.equal(ctx.__unboundGlassRuntimeStatus.patchInstalled,true);
  // Real exported global is absent after Unbound JS loads in the phone.
  ctx.NativePlugin=undefined;
  const external = vm.runInNewContext(companion,ctx);
  external.start();
  assert.equal(ctx.__unboundGlassOverlayFixStatus.patchInstalled,true);
  assert.deepEqual(patchers,["native-liquid-glass-youbar","native-glass-opaque-layer-fix"]);

  const builtInLayer = target.type();
  assert.equal(typeof builtInLayer.type,"function");
  const safeOriginal = builtInLayer.props.original;
  assert.equal(typeof safeOriginal.type,"function");
  assert.equal(safeOriginal.type(safeOriginal.props), original,
    "Original opaque background must remain before verified glass attach");

  const initial = builtInLayer.type(builtInLayer.props);
  assert.equal(initial.type,NativeView);
  assert.equal(initial.props.children.type,safeOriginal.type);
  assert.equal(initial.props.children.type(initial.props.children.props),original,
    "Fallback remains unchanged while UIKit glass is not yet attached");

  assert.equal(await tick(),true);
  assert.equal(ctx.__unboundGlassRuntimeStatus.phase,"attached");
  const mounted = builtInLayer.type(builtInLayer.props);
  assert.equal(mounted.props.children.props.backgroundColor,"transparent");
  assert.equal(mounted.props.children.type(mounted.props.children.props),null,
    "Remove the covering opaque subtree only after verified native attachment");
  assert.ok(ctx.__unboundGlassOverlayFixStatus.clearedBackgrounds > 0);
  assert.match(ctx.__unboundGlassRuntimeStatus.code, /^OVERLAY_FIX_V3:p1:r\d+:u\d+:h[1-9]\d*:k\d+$/,
    "The current IPA diagnostics must expose proof that companion actually hid the background");
  // Bundled plugin uses phase(name, code="") during redraws and navigation.
  // Companion diagnostic must persist over that write, not vanish.
  ctx.__unboundGlassRuntimeStatus.code = "";
  assert.match(ctx.__unboundGlassRuntimeStatus.code, /^OVERLAY_FIX_V3:p1:/,
    "Native phase resets must not erase companion status");
  ctx.__unboundGlassRuntimeStatus.code = "REAL_NATIVE_ERROR";
  assert.equal(ctx.__unboundGlassRuntimeStatus.code,"REAL_NATIVE_ERROR",
    "Native errors take precedence over cosmetic diagnostics");
  ctx.__unboundGlassRuntimeStatus.code = "";
  cleanup();
  external.stop();
  assert.equal(String(ctx.__unboundGlassRuntimeStatus.code).startsWith("OVERLAY_FIX_V3"),false,
    "Disabling external plugin must remove its diagnostic accessor");
  builtin.stop();
  assert.equal(target.type(),original,"Stopping both plugins restores Discord original");

  // External plugin loading before bundled glass must not race or shadow it.
  state = false; cleanup = null; effectUsed = false;
  const externalFirst = vm.runInNewContext(companion,ctx);
  delete ctx.__unboundGlassRuntimeStatus;
  externalFirst.start();
  assert.equal(ctx.__unboundGlassOverlayFixStatus.phase,"waiting-for-bundled-glass");
  ctx.NativePlugin = {objc:{
    glassAttachById:async()=>true,glassDetachById:async()=>undefined
  }};
  const bundledLater = vm.runInNewContext(bundled,ctx);
  bundledLater.start();
  assert.equal(ctx.__unboundGlassRuntimeStatus.patchInstalled,true);
  assert.equal(await tick(),true,"Waiting companion should retry");
  assert.equal(ctx.__unboundGlassOverlayFixStatus.patchInstalled,true);
  externalFirst.stop();
  bundledLater.stop();
  // Real Unbound uses possess to chain "after" callbacks. Do not assume
  // the companion's callback necessarily sees the native wrapper already.
  // Verify reversed callback order preserves the native host element too.
  {
    const reverseCallbacks = [];
    const reverseBase = {type:"OpaqueBackground",props:{backgroundColor:"#181818"}};
    const reverseComponent = {type:() => reverseBase};
    const reversePatcher = {
      createPatcher: () => ({
        after(_,key,callback) {
          assert.equal(key,"type");
          reverseCallbacks.push(callback);
        },
        unpatchAll(){}
      })
    };
    const reverseNativeView = {view:"native-reversed"};
    const reverseReact = {
      ...React,
      useState:()=>[false,()=>{}],
      useEffect:()=>{},
    };
    const reverseContext = {
      console,Promise,setTimeout:setTimer,clearTimeout:clearTimer,
      NativePlugin:{objc:{glassAttachById:async()=>true,glassDetachById:async()=>{}}},
      unbound:{
        metro:{
          findByFilePath:()=>({default:reverseComponent}),
          common:{React:reverseReact,ReactNative:{View:reverseNativeView}}
        },
        patcher:reversePatcher
      },
    };
    reverseContext.globalThis=reverseContext;
    const reverseNative = vm.runInNewContext(bundled,reverseContext);
    reverseNative.start();
    const reverseCompanion = vm.runInNewContext(companion,reverseContext);
    reverseCompanion.start();
    assert.equal(reverseCallbacks.length,2);
    let value=reverseBase;
    // Companion receives original first; bundled native hook wraps afterwards.
    for (const callback of [...reverseCallbacks].reverse()) {
      value=callback({result:value});
    }
    assert.equal(typeof value.type,"function","Native wrapper must be outermost");
    assert.equal(typeof value.props.original.type,"function",
      "Companion must wrap the original background when called first");
    assert.equal(value.props.original.type({
      ...value.props.original.props,backgroundColor:"transparent"
    }),null,"Native glass transparency should remove the original child");
    reverseCompanion.stop();
    reverseNative.stop();
  }

  console.log("PASS companion: background fallback, bridge-independent overlay removal, late startup, safe restore");
}
test().catch(err => {console.error(err); process.exitCode = 1;});
