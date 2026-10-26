(() => {
  // Read-only diagnostics for the *installed* Discord application.
  // Never patches React, changes backgrounds, reads chat content or attaches glass.
  const MODULE = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const MARKER = "unbound.glass.youbar.background";
  let generation = 0, timer = null;

  function showReport(report) {
    const rn = globalThis.unbound?.metro?.common?.ReactNative;
    const Alert = rn?.Alert;
    const Share = rn?.Share;
    if (typeof Alert?.alert !== "function") {
      console.warn("[Native Glass Diagnostic] React Native Alert unavailable; report remains in __unboundGlassDiagnostic");
      return;
    }
    const detail = [
      "Status: " + (report.failure || "No obvious startup failure"),
      "Native glass bridge: " + (report.phases.loader?.glassAttachById ? "YES" : "NO"),
      "Built-in glass plugin: " + (report.phases.bundledPlugin?.present ? "YES" : "NO"),
      "YouBar module: " + (report.phases.targetModule?.found ? "YES" : "NO"),
      "YouBar function: " + (report.phases.targetModule?.memoizedFunction ? "YES" : "NO"),
      "Native root: " + (report.phases.nativeTree?.rootFound ? "YES" : "NO")
    ].join("\n");
    const buttons = [{text: "Close", style: "cancel"}];
    if (typeof Share?.share === "function") {
      buttons.unshift({text: "Share Full Report", onPress: () => {
        try {
          Promise.resolve(Share.share({message: JSON.stringify(report,null,2),title: "Native Glass Diagnostic"}))
            .catch(error => console.warn("[Native Glass Diagnostic] Sharing failed:", String(error)));
        } catch (error) {
          console.warn("[Native Glass Diagnostic] Sharing unavailable:", String(error));
        }
      }});
    }
    Alert.alert("Native Glass Diagnostic", detail, buttons);
  }

  function summarize(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return { count: value.length };
    return { available: true, type: typeof value };
  }

  async function diagnose(current) {
    const report = {
      diagnostic: "YouBar native glass (read-only)",
      version: 1,
      timestamp: new Date().toISOString(),
      phases: {},
      failure: null
    };
    const phases = report.phases;
    const fail = (code) => { if (!report.failure) report.failure = code; };
    const unbound = globalThis.unbound;
    const native = globalThis.NativePlugin;
    const objc = native?.objc;
    const metro = unbound?.metro;
    phases.loader = {
      unbound: !!unbound,
      bridge: !!native,
      glassAttachById: typeof objc?.glassAttachById === "function",
      glassDetachById: typeof objc?.glassDetachById === "function",
      findViews: typeof objc?.findViews === "function",
      invokeAsync: typeof objc?.invokeAsync === "function",
      capabilities: Array.isArray(native?.capabilities)
        ? native.capabilities.filter(x => /glass|snapshot|objc/i.test(x)).slice(0, 12)
        : null
    };
    if (!phases.loader.glassAttachById) fail("NATIVE_GLASS_BRIDGE_MISSING");
    const builtIn = globalThis.__unboundBuiltInGlass;
    phases.bundledPlugin = {
      present: !!builtIn,
      hasStart: typeof builtIn?.start === "function",
      hasStop: typeof builtIn?.stop === "function"
    };
    if (!builtIn) fail("BUNDLED_GLASS_PLUGIN_NOT_STARTED");
    phases.metro = {
      present: !!metro,
      findByFilePath: typeof metro?.findByFilePath === "function",
      patcher: typeof unbound?.patcher?.createPatcher === "function",
      react: !!metro?.common?.React,
      reactNativeView: !!metro?.common?.ReactNative?.View
    };
    if (!phases.metro.findByFilePath) fail("METRO_FILE_LOOKUP_MISSING");
    if (phases.metro.findByFilePath) {
      try {
        const exp = metro.findByFilePath(MODULE, {interop:false});
        const component = exp?.default ?? exp;
        phases.targetModule = {
          found: !!component,
          memoizedFunction: typeof component?.type === "function",
          exportKind: typeof component
        };
        if (!component) fail("YOUBAR_MODULE_NOT_FOUND");
        else if (typeof component.type !== "function") fail("YOUBAR_EXPORT_SHAPE_CHANGED");
      } catch(e) {
        phases.targetModule = {error: String(e?.message ?? e).slice(0,180)};
        fail("YOUBAR_MODULE_LOOKUP_THREW");
      }
    }
    if (objc?.findViews && objc?.invokeAsync) {
      try {
        const cls = objc.getClass?.("Utilities");
        const window = cls ? await objc.invokeAsync(cls, "keyWindow", []) : null;
        const controller = window ? await objc.invokeAsync(window, "rootViewController", []) : null;
        const root = controller ? await objc.invokeAsync(controller, "view", []) : null;
        if (!root) {
          phases.nativeTree = {rootFound:false};
          fail("NATIVE_ROOT_VIEW_UNAVAILABLE");
        } else {
          // Bounded discovery, no text/labels/messages are collected.
          const opts = {attachedOnly:true, maxDepth:45, maxVisited:8000, maxResults:10};
          const names = ["RCTViewComponentView", "RNSTabsHostComponentView", "UITabBar"];
          const found = {};
          for (const name of names) {
            try {
              const matches = await objc.findViews(root, name, opts);
              found[name] = summarize(matches);
            } catch(e) {found[name]={error:String(e?.message??e).slice(0,120)};}
          }
          phases.nativeTree = {rootFound:true, classes:found};
        }
      } catch(e) {
        phases.nativeTree = {error:String(e?.message??e).slice(0,180)};
        fail("NATIVE_HIERARCHY_QUERY_FAILED");
      }
    }
    if (current !== generation) return;
    const result = JSON.stringify(report,null,2);
    globalThis.__unboundGlassDiagnostic = report;
    console.log("[Native Glass Diagnostic] " + result);
    showReport(report);
    // Status only. Never output account identifiers or message contents.
  }
  return {
    start() {
      const current = ++generation;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {timer=null; void diagnose(current);},1800);
    },
    stop() {
      ++generation;
      if(timer!=null) clearTimeout(timer);
      timer=null;
      delete globalThis.__unboundGlassDiagnostic;
    }
  };
})()
