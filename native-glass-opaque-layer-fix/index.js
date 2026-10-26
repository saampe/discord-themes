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

  // The installed IPA's native diagnostics serializer has no companion field.
  // Its existing pluginStatus.code is safe to use for a short, read-only
  // progress marker, without changing the native bridge or rebuilding the IPA.
  function report() {
    const builtIn = globalThis.__unboundGlassRuntimeStatus;
    if (builtIn?.phase === "attached" &&
        (!builtIn.code || String(builtIn.code).startsWith("OVERLAY_FIX_V2"))) {
      builtIn.code = "OVERLAY_FIX_V2:r" + status.renderMatches +
        ":u" + status.unmatchedResults +
        ":h" + status.clearedBackgrounds +
        ":k" + status.keptBackgrounds;
    }
  }

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
        if (!React.isValidElement(result) ||
            !React.isValidElement(result.props?.original) ||
            typeof result.type !== "function") {
          status.unmatchedResults++;
          report();
          return result;
        }
        // Do not replace the bundled native hook, attach lifecycle or marker.
        // Replace its original-background prop with a reversible wrapper.
        // When the bundled hook clones this wrapper with a transparent color
        // (after successful native attach), GlassAwareOriginal returns null.
        status.renderMatches++;
        report();
        return React.cloneElement(result, {
          original: React.createElement(GlassAwareOriginal, {
            source: result.props.original
          })
        });
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
      const nativeStatus = globalThis.__unboundGlassRuntimeStatus;
      if (String(nativeStatus?.code ?? "").startsWith("OVERLAY_FIX_V2"))
        nativeStatus.code = "";
    }
  };
})()
