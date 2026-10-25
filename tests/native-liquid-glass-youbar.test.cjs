const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync("native-liquid-glass-youbar/index.js", "utf8");
const marker = "unbound.glass.youbar.background";
const events = [];

const NativeView = { displayName: "View" };
const React = {
  isValidElement: element => element != null && typeof element === "object" && "type" in element,
  cloneElement: (element, props) => ({
    ...element, props: { ...element.props, ...props }
  }),
  createElement: (type, props, children) => ({
    type, props: { ...props, children }
  })
};
const component = {
  type: props => ({
    type: "YouBarMaskedBackground",
    props: { ...props, backgroundColor: "#333333" }
  })
};
const paletteA = { id: "a" };
const paletteB = { id: "b" };
const resolver = {
  resolveSemanticColor: token => token === paletteA ? "#333333" : "#444444"
};
const patches = [];
function createPatcher() {
  return {
    after(parent, key, callback) {
      const original = parent[key];
      assert.equal(typeof original, "function");
      parent[key] = function (...args) {
        const result = original.apply(this, args);
        return callback({ args, result }) ?? result;
      };
      patches.push(() => { parent[key] = original; });
    },
    unpatchAll() {
      while (patches.length) patches.pop()();
    }
  };
}
const context = {
  console: {log:(...x)=>events.push(["log",...x]),warn:(...x)=>events.push(["warn",...x]),error:(...x)=>events.push(["error",...x])},
  setTimeout, clearTimeout, Date, Promise, Set, Object, String,
  unbound: {
    metro: {
      findByFilePath(path) {
        assert.equal(path, "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx");
        return {default:component};
      },
      common: {
        React, ReactNative:{View:NativeView},
        Theme:{colors:{
          MOBILE_FLOATINGBAR_BACKGROUND: paletteA,
          MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE: paletteB
        },internal:resolver}
      }
    },
    patcher:{createPatcher}
  },
  NativePlugin:{objc:{
    glassAttachById: async (...args)=>{events.push(["attach",...args]);return true;},
    glassDetachById: async (...args)=>{events.push(["detach",...args]);}
  }}
};
context.globalThis = context;

const plugin = vm.runInNewContext(source,context,{filename:"native-liquid-glass-youbar/index.js"});
assert.equal(typeof plugin.start,"function");
assert.equal(typeof plugin.stop,"function");

plugin.start();
assert.equal(resolver.resolveSemanticColor(paletteA),"transparent");
assert.equal(resolver.resolveSemanticColor(paletteB),"transparent");
assert.equal(component.type,component.type);
const host = component.type({barWidth:270,hasNameplate:false});
assert.equal(host.type,NativeView);
assert.equal(host.props.testID,marker);
assert.equal(host.props.pointerEvents,"none");
assert.equal(host.props.collapsable,false);
assert.equal(host.props.children.type,"YouBarMaskedBackground");
assert.equal(host.props.children.props.backgroundColor,"transparent");
plugin.stop();
assert.equal(resolver.resolveSemanticColor(paletteA),"#333333");
assert.ok(events.some(x=>x[0]==="detach"));
console.log("PASS: scoped real-glass React patch, semantic colors and rollback");
