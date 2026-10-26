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
    wrappedBackgrounds: 0, clearedBackgrounds: 0
  };

  function GlassAwareOriginal({source, backgroundColor}) {
    // Bundled NativeGlassYouBarLayer applies backgroundColor="transparent"
    // only once its UIKit glassAttachById succeeds. The original element
    // may render a dark masked view despite that prop; omit the whole
    // background-only subtree while keeping the native glass host alive.
    if (backgroundColor === "transparent") {
      status.clearedBackgrounds++;
      return null;
    }
    return source; // Safe, unchanged Discord fallback before attachment.
  }

  function install(epoch, attempt = 0) {
    if (!active || epoch !== generation || patched) return;
    const metro = globalThis.unbound?.metro;
    const React = metro?.common?.React;
    const createPatcher = globalThis.unbound?.patcher?.createPatcher;
    const builtIn = globalThis.__unboundGlassRuntimeStatus;
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
        if (!active || !React.isValidElement(result) ||
            !React.isValidElement(result.props?.original) ||
            typeof result.type !== "function")
          return result;
        // Do not replace the bundled native hook, attach lifecycle or marker.
        // Replace its original-background prop with a reversible wrapper.
        // When the bundled hook clones this wrapper with a transparent color
        // (after successful native attach), GlassAwareOriginal returns null.
        status.wrappedBackgrounds++;
        return React.cloneElement(result, {
          original: React.createElement(GlassAwareOriginal, {
            source: result.props.original
          })
        });
      });
      patched = true;
      status.patchInstalled = true;
      status.phase = "hook-installed";
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
      status.wrappedBackgrounds = 0;
      status.clearedBackgrounds = 0;
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
    }
  };
})()
