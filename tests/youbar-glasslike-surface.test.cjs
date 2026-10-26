const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const bundle = fs.readFileSync("youbar-glasslike-surface/index.js","utf8");
const manifest = JSON.parse(fs.readFileSync("youbar-glasslike-surface/manifest.json","utf8"));
let nativeRemoved=0, afterHook=null, stopped=0;
const target={type:() => ({type:"OpaqueMaskedDiscordOriginal",props:{}})};
const View={name:"ReactNativeView"};
const React={
 isValidElement(x){return !!x&&typeof x==="object"&&"type" in x},
 createElement(type,props){return {type,props}}
};
const context={console,setTimeout(){throw Error("Unexpected API wait")},clearTimeout(){},
 __unboundGlassRuntimeStatus:{patchInstalled:true},
 unbound:{
  metro:{findByFilePath:()=>({default:target}),common:{React,ReactNative:{View}}},
  patcher:{
   unpatchAllByCaller(name){assert.equal(name,"native-liquid-glass-youbar");nativeRemoved++},
   createPatcher(name){
    assert.equal(name,"youbar-glasslike-surface");
    return {after(component,key,cb){assert.equal(component,target);assert.equal(key,"type");afterHook=cb},unpatchAll(){stopped++}}
   }
  }
 }};
context.globalThis=context;
const plugin=vm.runInNewContext(`((React) => { return ${bundle} })`,context)(React);
assert.equal(manifest.version,"1.0.0");
assert.equal(typeof plugin?.start,"function");
plugin.start();
assert.equal(nativeRemoved,1);
assert.equal(context.__youbarGlasslikeSurfaceStatus.phase,"ready");
let result=afterHook({result:target.type()});
assert.equal(result.type,View);
assert.match(result.props.style.backgroundColor,/rgba/);
assert.equal(result.props.pointerEvents,"none");
assert.equal(context.__youbarGlasslikeSurfaceStatus.renders,1);
plugin.stop();
assert.equal(stopped,1);
assert.match(context.__youbarGlasslikeSurfaceStatus.phase,/restart/);
console.log("PASS: plugin starts in Unbound, removes only black native YouBar patch, draws translucent background, safe stop");
