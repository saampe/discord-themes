const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const src=fs.readFileSync("native-glass-diagnostic/index.js","utf8");
const events=[];
const tasks=[];
let visibleAlert=null;
let sharedReport=null;
const context={
  console:{log:(...x)=>events.push(x.join(" ")),warn:(...x)=>events.push(x.join(" "))},
  Date,JSON,Array,String,Promise,
  setTimeout:(fn)=>{tasks.push(fn);return tasks.length;},
  clearTimeout:()=>{},
  unbound:{
    patcher:{createPatcher:()=>{throw Error("Diagnostic must not patch UI")}},
    metro:{
      findByFilePath:()=>({default:{type:()=>null}}),
      common:{React:{},ReactNative:{View:{},Alert:{alert:(title,message,buttons)=>{visibleAlert={title,message,buttons};}},Share:{share:async args=>{sharedReport=args.message;return {action:"sharedAction"};}}}}
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
 assert.equal(visibleAlert.title,"Native Glass Diagnostic");
 assert.ok(visibleAlert.message.includes("Built-in glass plugin: YES"));
 const button=visibleAlert.buttons.find(x=>x.text==="Share Full Report");
 assert.ok(button,"share button must be available on iPhone");
 button.onPress();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(JSON.parse(sharedReport).phases.targetModule.memoizedFunction,true);
 diagnostic.stop();
 assert.equal(context.__unboundGlassDiagnostic,undefined);
 console.log("PASS: read-only installed-glass diagnostics exports report without UI mutation");
})().catch(e=>{console.error(e);process.exitCode=1});
