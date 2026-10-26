// Companion plugin for the already-installed Discord 350 Unbound IPA.
// The bundled native Liquid Glass plugin owns UIKit attachment; this plugin
// removes only the *original YouBar background* after native attach succeeds.
// It never invokes NativePlugin or competes for the native glass marker.
(() => {
  const MODULE_PATH = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const RETRY_MS = 500;
  const MAX_RETRIES = 30;
  let active = false;
  let generation = 0;
  let patcher = null;
  let timer = null;
  let patched = false;
  const status = {
    phase: "idle", patchInstalled: false,
    renderMatches: 0, unmatchedResults: 0,
    clearedBackgrounds: 0, keptBackgrounds: 0
  };

  // The IPA exports a snapshot of __unboundGlassRuntimeStatus.code, not
  // companion plugin globals. Keep a reversible live diagnostic accessor on
  // that object. The bundled plugin repeatedly sets code="" while attaching;
  // an accessor survives those writes without suppressing genuine failures.
  let restoreCode = null;
  let restoreInspection = null;
  let mirroredStatus = null;
  function telemetry() {
    return "OVERLAY_FIX_V3:p" + Number(status.patchInstalled) +
      ":r" + status.renderMatches +
      ":u" + status.unmatchedResults +
      ":h" + status.clearedBackgrounds +
      ":k" + status.keptBackgrounds;
  }
  function mirrorStatus() {
    const host = globalThis.__unboundGlassRuntimeStatus;
    if (!active || !host || typeof host !== "object") return;
    if (host === mirroredStatus) return;
    if (restoreCode) { restoreCode(); restoreCode = null; }
    if (restoreInspection) { restoreInspection(); restoreInspection = null; }
    const oldDescriptor = Object.getOwnPropertyDescriptor(host, "code");
    if (oldDescriptor && (!oldDescriptor.configurable ||
        !Object.prototype.hasOwnProperty.call(oldDescriptor, "value")))
      return; // Do not replace another plugin's accessor.
    let baseCode = String(host.code ?? "");
    const getter = () => {
      if (active && host.phase === "attached" && !baseCode)
        return telemetry();
      return baseCode;
    };
    try {
      Object.defineProperty(host, "code", {
        configurable: true, enumerable: true, get: getter,
        set: value => { baseCode = String(value ?? ""); }
      });
      mirroredStatus = host;
      restoreCode = () => {
        if (Object.getOwnPropertyDescriptor(host, "code")?.get === getter)
          Object.defineProperty(host, "code", {
            configurable: true, enumerable: true, writable: true, value: baseCode
          });
        mirroredStatus = null;
      };
      // Independent confirmation in the already-exported native inspection
      // object, rather than relying on the mutable "code" diagnostic alone.
      const inspectionDescriptor = Object.getOwnPropertyDescriptor(host, "inspection");
      if (!inspectionDescriptor || (inspectionDescriptor.configurable &&
          Object.prototype.hasOwnProperty.call(inspectionDescriptor, "value"))) {
        let nativeInspection = host.inspection;
        const getInspection = () => {
          if (!nativeInspection || typeof nativeInspection !== "object")
            return nativeInspection;
          return {
            ...nativeInspection,
            overlayFix: {
              version: 4,
              phase: status.phase,
              patchInstalled: status.patchInstalled,
              wrapped: status.renderMatches,
              unmatched: status.unmatchedResults,
              hidden: status.clearedBackgrounds,
              kept: status.keptBackgrounds
            }
          };
        };
        try {
          Object.defineProperty(host, "inspection", {
            configurable: true, enumerable: true,
            get: getInspection, set: value => { nativeInspection = value; }
          });
          restoreInspection = () => {
            if (Object.getOwnPropertyDescriptor(host, "inspection")?.get === getInspection)
              Object.defineProperty(host, "inspection", {
                configurable: true, enumerable: true, writable: true,
                value: nativeInspection
              });
          };
        } catch { /* Native inspection stays unchanged on restricted hosts. */ }
      }
    } catch {
      mirroredStatus = null;
    }
  }
  function report() { mirrorStatus(); }

  function GlassAwareOriginal({source, backgroundColor}) {
    // Bundled NativeGlassYouBarLayer applies backgroundColor="transparent"
    // only once its UIKit glassAttachById succeeds. The original element
    // may render a dark masked view despite that prop; omit the whole
    // background-only subtree while keeping the native glass host alive.
    if (backgroundColor === "transparent") {
      status.clearedBackgrounds++;
      report();
      return null;
    }
    status.keptBackgrounds++;
    report();
    return source; // Safe, unchanged Discord fallback before attachment.
  }

  function install(epoch, attempt = 0) {
    if (!active || epoch !== generation || patched) return;
    const metro = globalThis.unbound?.metro;
    const React = metro?.common?.React;
    const createPatcher = globalThis.unbound?.patcher?.createPatcher;
    const builtIn = globalThis.__unboundGlassRuntimeStatus;
    mirrorStatus(); // Even before hook installation, expose waiting state.
    if (!builtIn?.patchInstalled || typeof metro?.findByFilePath !== "function" ||
        typeof React?.createElement !== "function" ||
        typeof React?.cloneElement !== "function" ||
        typeof React?.isValidElement !== "function" ||
        typeof createPatcher !== "function") {
      status.phase = "waiting-for-bundled-glass";
      if (attempt < MAX_RETRIES) timer = setTimeout(() => install(epoch, attempt + 1), RETRY_MS);
      else status.phase = "unavailable";
      return;
    }

    let target;
    try {
      const found = metro.findByFilePath(MODULE_PATH, {interop:false});
      target = found?.default ?? found;
      if (!target || typeof target.type !== "function") throw Error("Component unavailable");
      patcher = createPatcher("native-glass-opaque-layer-fix");
      patcher.after(target, "type", ({result}) => {
        if (!active) return result;
        if (!React.isValidElement(result)) {
          status.unmatchedResults++;
          report();
          return result;
        }
        // Unbound's patcher can run multiple "after" callbacks in either
        // order. If native glass has wrapped YouBar already, replace only its
        // "original" prop. Otherwise wrap the ORIGINAL background now; the
        // built-in patch will later wrap our element and add the UIKit anchor.
        // Both paths keep original content before glass is attached.
        const isNativeWrapper = typeof result.type === "function" &&
          React.isValidElement(result.props?.original);
        const source = isNativeWrapper ? result.props.original : result;
        const wrappedBackground = React.createElement(GlassAwareOriginal, {source});
        status.renderMatches++;
        report();
        return isNativeWrapper
          ? React.cloneElement(result, {original:wrappedBackground})
          : wrappedBackground;
      });
      patched = true;
      status.patchInstalled = true;
      status.phase = "hook-installed";
      report();
    } catch {
      patcher?.unpatchAll?.();
      patcher = null;
      status.phase = "failed";
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      patched = false;
      status.patchInstalled = false;
      status.renderMatches = 0;
      status.unmatchedResults = 0;
      status.clearedBackgrounds = 0;
      status.keptBackgrounds = 0;
      status.phase = "starting";
      globalThis.__unboundGlassOverlayFixStatus = status;
      install(++generation);
    },
    stop() {
      active = false;
      ++generation;
      if (timer != null) clearTimeout(timer);
      timer = null;
      patcher?.unpatchAll?.();
      patcher = null;
      patched = false;
      status.patchInstalled = false;
      status.phase = "stopped";
      if (restoreCode) { restoreCode(); restoreCode = null; }
      if (restoreInspection) { restoreInspection(); restoreInspection = null; }
    }
  };
})()
