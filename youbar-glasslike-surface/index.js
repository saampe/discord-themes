(() => {
  const MODULE = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const NATIVE_CALLER = "native-liquid-glass-youbar";
  const RETRY_MS = 550;
  const MAX_ATTEMPTS = 32;
  let active = false;
  let patcher = null;
  let timer = null;
  let epoch = 0;
  let patched = false;
  const state = {phase:"idle", installed:false, nativeSuppressed:false, renders:0};

  function install(generation, attempt) {
    if (!active || generation !== epoch || patched) return;
    const u = globalThis.unbound;
    const metro = u?.metro;
    const React = metro?.common?.React;
    const View = metro?.common?.ReactNative?.View;
    const patchAPI = u?.patcher;
    if (typeof metro?.findByFilePath !== "function" ||
        typeof React?.createElement !== "function" ||
        typeof React?.isValidElement !== "function" ||
        !View || typeof patchAPI?.createPatcher !== "function" ||
        typeof patchAPI?.unpatchAllByCaller !== "function") {
      state.phase = "waiting-for-api";
      if (attempt < MAX_ATTEMPTS)
        timer = setTimeout(() => install(generation, attempt + 1), RETRY_MS);
      else state.phase = "api-unavailable";
      return;
    }
    try {
      const module = metro.findByFilePath(MODULE, {interop:false});
      const component = module?.default ?? module;
      const builtIn = globalThis.__unboundGlassRuntimeStatus;
      if (!component || typeof component.type !== "function" || !builtIn?.patchInstalled) {
        state.phase = "waiting-for-native-hook";
        if (attempt < MAX_ATTEMPTS)
          timer = setTimeout(() => install(generation, attempt + 1), RETRY_MS);
        else state.phase = "native-hook-unavailable";
        return;
      }

      // This plugin replaces ONLY the background-only YouBarBackground component.
      // Suppress the broken built-in native hook rather than letting it create
      // a second UIKit layer on top of this surface. Does not touch other addons.
      patchAPI.unpatchAllByCaller(NATIVE_CALLER);
      state.nativeSuppressed = true;
      patcher = patchAPI.createPatcher("youbar-glasslike-surface");
      patcher.after(component, "type", ({result}) => {
        if (!active) return result;
        if (!React.isValidElement(result)) return result;
        state.renders++;
        return React.createElement(View, {
          pointerEvents:"none",
          collapsable:false,
          style:{
            position:"absolute",top:0,bottom:0,left:0,right:0,
            borderRadius:999,
            overflow:"hidden",
            backgroundColor:"rgba(165,174,196,0.18)",
            borderWidth:0.7,
            borderColor:"rgba(236,242,255,0.19)"
          }
        });
      });
      state.installed = true;
      state.phase = "ready";
      patched = true;
    } catch (error) {
      state.phase = "failed";
      state.error = String(error?.message ?? error);
      patcher?.unpatchAll?.();
      patcher = null;
    }
  }
  return {
    start() {
      if (active) return;
      active = true;
      state.phase = "starting";
      state.installed = false;
      state.nativeSuppressed = false;
      state.renders = 0;
      globalThis.__youbarGlasslikeSurfaceStatus = state;
      install(++epoch, 0);
    },
    stop() {
      active = false;
      ++epoch;
      if (timer != null) clearTimeout(timer);
      timer = null;
      patcher?.unpatchAll?.();
      patcher = null;
      patched = false;
      state.installed = false;
      state.phase = "stopped-restart-to-restore-native";
      // Unbound's original built-in patcher instance isn't accessible after
      // unpatchAllByCaller; a full app restart restores its normal startup.
    }
  };
})()
