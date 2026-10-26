(() => {
  const MARKER = "unbound.glass.youbar.background";
  const MODULE_PATH = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const MAX_ATTACH_ATTEMPTS = 14;
  const ATTACH_RETRY_MS = 450;
  const INSTALL_RETRY_MS = 900;
  const MAX_INSTALL_ATTEMPTS = 24;
  // Unbound can reconfigure its JS globals after our native bootstrap.
  // Preserve the bridge host functions from this exact Hermes runtime.
  const bootstrapObjc = globalThis.NativePlugin?.objc ?? null;
  let active = false;
  let epoch = 0;
  let patcher = null;
  let installTimer = null;
  let patched = false;
  let nextMountId = 0;
  let latestMountId = 0;

  // Explicit diagnostics for the installed client, no message/user content.
  const status = {
    phase: "idle", code: "", patchInstalled: false,
    renderObserved: false, attachAttempts: 0,
    attached: false, inspection: null
  };
  function phase(name, code = "") {
    status.phase = name;
    status.code = code;
  }

  function install(generation, attempt = 0) {
    if (!active || epoch !== generation || patched) return;
    const unbound = globalThis.unbound;
    const metro = unbound?.metro;
    const React = metro?.common?.React;
    const NativeView = metro?.common?.ReactNative?.View;
    const makePatcher = unbound?.patcher?.createPatcher;
    const objc = globalThis.NativePlugin?.objc ?? bootstrapObjc;
    const bridgeReady = typeof objc?.glassAttachById === "function" &&
      typeof objc?.glassDetachById === "function";
    const ready = bridgeReady &&
      typeof metro?.findByFilePath === "function" &&
      typeof React?.isValidElement === "function" &&
      typeof React?.cloneElement === "function" &&
      typeof React?.createElement === "function" &&
      typeof React?.useEffect === "function" &&
      typeof React?.useState === "function" &&
      !!NativeView && typeof makePatcher === "function";

    if (!ready) {
      phase("waiting-for-apis", bridgeReady ? "REACT_OR_METRO_API_MISSING" : "NATIVE_BRIDGE_MISSING");
      if (attempt < MAX_INSTALL_ATTEMPTS)
        installTimer = setTimeout(() => install(generation, attempt + 1), INSTALL_RETRY_MS);
      else {
        phase("failed", status.code);
        console.warn("[Native Liquid Glass] Required API unavailable; YouBar preserved:", status.code);
      }
      return;
    }

    let component;
    try {
      const exports = metro.findByFilePath(MODULE_PATH, {interop:false});
      component = exports?.default ?? exports;
    } catch (error) {
      phase("waiting-for-module", "MODULE_LOOKUP_EXCEPTION");
      if (attempt < MAX_INSTALL_ATTEMPTS)
        installTimer = setTimeout(() => install(generation, attempt + 1), INSTALL_RETRY_MS);
      else phase("failed", "MODULE_LOOKUP_EXCEPTION");
      return;
    }
    if (!component || typeof component.type !== "function") {
      phase("waiting-for-module", "YOUBAR_MEMO_EXPORT_UNAVAILABLE");
      if (attempt < MAX_INSTALL_ATTEMPTS)
        installTimer = setTimeout(() => install(generation, attempt + 1), INSTALL_RETRY_MS);
      else {
        phase("failed", "YOUBAR_MEMO_EXPORT_UNAVAILABLE");
        console.warn("[Native Liquid Glass] YouBarBackground unavailable, original view preserved");
      }
      return;
    }

    function NativeGlassYouBarLayer({original}) {
      const [glassReady, setGlassReady] = React.useState(false);
      React.useEffect(() => {
        let mounted = true;
        let timer = null;
        let hasAttached = false;
        let tries = 0;
        const mountId = ++nextMountId;
        latestMountId = mountId;

        // The native attach promise can complete after a component unmount.
        // Only the most recent marked host may be detached by identifier:
        // an older cleanup must never remove glass from its replacement.
        const detachIfCurrent = () => {
          if (mountId !== latestMountId) return;
          try {
            Promise.resolve(objc.glassDetachById(MARKER))
              .catch(() => console.warn("[Native Liquid Glass] Detach failed"));
          } catch {
            console.warn("[Native Liquid Glass] Detach failed");
          }
        };

        const inspect = async () => {
          if (typeof objc.glassInspectById !== "function") return;
          try {
            const json = await objc.glassInspectById(MARKER);
            if (mounted && epoch === generation)
              status.inspection = typeof json === "string" ? JSON.parse(json) : null;
          } catch {
            if (mounted && epoch === generation)
              status.inspection = {reason:"NATIVE_INSPECTION_FAILED"};
          }
        };

        const attach = async () => {
          if (!mounted || !active || epoch !== generation) return;
          tries++;
          status.attachAttempts++;
          phase("attaching");
          try {
            const ok = await objc.glassAttachById(MARKER, true, true);
            if (!mounted || !active || epoch !== generation) {
              // Stop/unmount may have happened while UIKit was attaching.
              // Release late success, but do not touch a newer mount's host.
              if (ok) detachIfCurrent();
              return;
            }
            if (ok) {
              hasAttached = true;
              status.attached = true;
              phase("attached");
              setGlassReady(true);
              void inspect();
              console.log("[Native Liquid Glass] UIKit material confirmed for YouBar");
              return;
            }
            phase("attaching", "NATIVE_ATTACH_RETURNED_FALSE");
          } catch {
            phase("attaching", "NATIVE_ATTACH_EXCEPTION");
          }
          if (tries < MAX_ATTACH_ATTEMPTS) {
            timer = setTimeout(attach, ATTACH_RETRY_MS);
          } else {
            await inspect();
            if (mounted && epoch === generation) {
              const reason = status.inspection?.reason;
              phase("failed", reason && reason !== "ANCHOR_FOUND"
                ? reason : (status.code || "NATIVE_ATTACH_FAILED"));
              console.warn("[Native Liquid Glass] UIKit attachment failed:", status.code);
            }
          }
        };
        timer = setTimeout(attach, 180);
        return () => {
          mounted = false;
          if (timer != null) clearTimeout(timer);
          if (hasAttached) {
            status.attached = false;
            phase("detached", "COMPONENT_UNMOUNTED");
            detachIfCurrent();
          }
        };
      }, []);
      const background = glassReady
        ? React.cloneElement(original, {...original.props, backgroundColor:"transparent"})
        : original;
      return React.createElement(NativeView, {
        testID: MARKER,
        collapsable: false,
        pointerEvents: "none",
        style: {position:"absolute", top:0, right:0, bottom:0, left:0}
      }, background);
    }

    try {
      patcher = makePatcher("native-liquid-glass-youbar");
      patcher.after(component, "type", ({result}) => {
        if (!active || !React.isValidElement(result)) return result;
        status.renderObserved = true;
        if (!status.attached) phase("render-observed");
        return React.createElement(NativeGlassYouBarLayer, {original:result});
      });
      patched = true;
      status.patchInstalled = true;
      phase("hook-installed");
      console.log("[Native Liquid Glass] YouBar React hook ready");
    } catch {
      patcher?.unpatchAll?.();
      patcher = null;
      phase("failed", "REACT_PATCH_INSTALL_FAILED");
      console.warn("[Native Liquid Glass] Safe fallback; YouBar hook failed");
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      patched = false;
      status.patchInstalled = false;
      status.renderObserved = false;
      status.attachAttempts = 0;
      status.attached = false;
      status.inspection = null;
      globalThis.__unboundGlassRuntimeStatus = status;
      phase("starting");
      install(++epoch);
    },
    stop() {
      active = false;
      ++epoch;
      if (installTimer !== null) clearTimeout(installTimer);
      installTimer = null;
      patcher?.unpatchAll?.();
      patcher = null;
      patched = false;
      status.patchInstalled = false;
      status.attached = false;
      phase("stopped");
      const detach = globalThis.NativePlugin?.objc?.glassDetachById ?? bootstrapObjc?.glassDetachById;
      if (typeof detach === "function") {
        try {
          Promise.resolve(detach(MARKER))
            .catch(() => console.warn("[Native Liquid Glass] Detach failed"));
        } catch {
          console.warn("[Native Liquid Glass] Detach failed");
        }
      }
    }
  };
})()
