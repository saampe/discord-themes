const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const src=fs.readFileSync("native-glass-diagnostic/index.js","utf8");
const events=[];
const tasks=[];
const context={
  console:{log:(...x)=>events.push(x.join(" ")),warn:(...x)=>events.push(x.join(" "))},
  Date,JSON,Array,String,Promise,
  setTimeout:(fn)=>{tasks.push(fn);return tasks.length;},
  clearTimeout:()=>{},
  unbound:{
    patcher:{createPatcher:()=>{throw Error("Diagnostic must not patch UI")}},
    metro:{
      findByFilePath:()=>({default:{type:()=>null}}),
      common:{React:{},ReactNative:{View:{}}}
    }
  },
  NativePlugin:{
    capabilities:["native.objc.glassHost"],
    objc:{
      glassAttachById:()=>{throw Error("Diagnostic must not attach glass")},
      glassDetachById:()=>{throw Error("Diagnostic must not detach glass")},
      getClass:name=>name==="Utilities"?{}:null,
      invokeAsync:async(_,sel)=>({keyWindow:{},rootViewController:{},view:{}}[sel]),
      findViews:async()=>[]
    }
  },
  __unboundBuiltInGlass:{start(){},stop(){}}
};
context.globalThis=context;
const diagnostic=vm.runInNewContext(src,context);
diagnostic.start();
assert.equal(tasks.length,1);
(async()=>{
 await tasks[0]();
 await new Promise(resolve=>setImmediate(resolve));
 const report=context.__unboundGlassDiagnostic;
 assert.equal(report.failure,null);
 assert.equal(report.phases.bundledPlugin.present,true);
 assert.equal(report.phases.targetModule.memoizedFunction,true);
 assert.equal(report.phases.nativeTree.rootFound,true);
 assert.ok(events.some(x=>x.includes("[Native Glass Diagnostic]")));
 diagnostic.stop();
 assert.equal(context.__unboundGlassDiagnostic,undefined);
 console.log("PASS: read-only installed-glass diagnostics exports report without UI mutation");
})().catch(e=>{console.error(e);process.exitCode=1});
