(() => {
  const MARKER = "unbound.glass.youbar.background";
  const MODULE_PATH = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const FLOATING_COLORS = new Set([
    "MOBILE_FLOATINGBAR_BACKGROUND",
    "MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE"
  ]);

  let active = false;
  let patcher = null;
  let retryTimer = null;
  let attachTimer = null;
  let epoch = 0;
  let lastAttachAttempt = 0;
  let patched = false;

  function cancelTimers() {
    if (retryTimer != null) clearTimeout(retryTimer);
    if (attachTimer != null) clearTimeout(attachTimer);
    retryTimer = attachTimer = null;
  }

  function tryAttach(generation) {
    if (!active || generation !== epoch) return;
    const objc = globalThis.NativePlugin?.objc;
    if (typeof objc?.glassAttachById !== "function") return;
    const now = Date.now();
    if (now - lastAttachAttempt < 500) return;
    lastAttachAttempt = now;
    if (attachTimer != null) clearTimeout(attachTimer);
    attachTimer = setTimeout(async () => {
      attachTimer = null;
      if (!active || generation !== epoch) return;
      try {
        // The native side only accepts one uniquely identified, attached,
        // small UIView. It also restores the original color on detach.
        const attached = await objc.glassAttachById(MARKER, false, true);
        if (attached) {
          console.log("[Native Liquid Glass] Attached to floating YouBar");
        }
      } catch (error) {
        console.warn("[Native Liquid Glass] Native attachment rejected:", String(error));
      }
    }, 280);
  }

  function install(generation, attempts = 0) {
    if (!active || generation !== epoch || patched) return;
    const unbound = globalThis.unbound;
    const objc = globalThis.NativePlugin?.objc;
    const metro = unbound?.metro;
    const React = metro?.common?.React;
    const NativeView = metro?.common?.ReactNative?.View;
    const resolver = metro?.common?.Theme?.internal;
    const makePatcher = unbound?.patcher?.createPatcher;
    if (typeof objc?.glassAttachById !== "function" ||
        typeof metro?.findByFilePath !== "function" ||
        typeof React?.isValidElement !== "function" ||
        typeof React?.cloneElement !== "function" || !NativeView ||
        typeof resolver?.resolveSemanticColor !== "function" ||
        typeof makePatcher !== "function") {
      console.warn("[Native Liquid Glass] Required bridge / Metro API unavailable");
      return;
    }
    try {
      const exports = metro.findByFilePath(MODULE_PATH, { interop: false });
      const component = exports?.default ?? exports;
      if (!component || typeof component.type !== "function") {
        if (attempts < 12) retryTimer = setTimeout(() => install(generation, attempts + 1), 1250);
        else console.warn("[Native Liquid Glass] Could not locate memoized YouBarBackground");
        return;
      }
      const theme = metro.common.Theme;
      const tokens = new Set(Object.entries(theme?.colors ?? {})
        .filter(([name]) => FLOATING_COLORS.has(name))
        .map(([, token]) => token)
        .filter(Boolean));
      if (tokens.size !== 2) {
        console.warn("[Native Liquid Glass] Floating bar color tokens incomplete; no changes made");
        return;
      }
      patcher = makePatcher("native-liquid-glass-youbar");
      patcher.after(resolver, "resolveSemanticColor", ({ args }) => {
        if (args.some(arg => tokens.has(arg))) return "transparent";
      });
      patcher.after(component, "type", ({ result }) => {
        if (!active || !React.isValidElement(result)) return result;
        // This component is confirmed in Discord 350 Hermes, and its output is
        // YouBarMaskedBackground or YouBarAnimatedBackground. Preserve its
        // shape, animation, width, children and accessibility; adjust only
        // the background prop and supply a native accessibility marker.
        const clone = React.cloneElement(result, {
          ...result.props,
          backgroundColor: "transparent"
        });
        // The internal YouBarMaskedBackground / YouBarAnimatedBackground
        // functions do NOT forward testID (verified in Hermes bytecode).
        // A dedicated, non-interactive native View supplies our exact marker.
        // Absolute fill preserves the original background-only slot without
        // moving the neighboring icon and touch-target components.
        const host = React.createElement(NativeView, {
          testID: MARKER,
          collapsable: false,
          pointerEvents: "none",
          style: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }
        }, clone);
        tryAttach(generation);
        return host;
      });
      patched = true;
      console.log("[Native Liquid Glass] Scoped YouBarBackground hooks installed");
    } catch (error) {
      patcher?.unpatchAll?.();
      patcher = null;
      console.error("[Native Liquid Glass] Aborted safely:", String(error));
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      patched = false;
      const generation = ++epoch;
      install(generation);
    },
    stop() {
      active = false;
      ++epoch;
      cancelTimers();
      patcher?.unpatchAll?.();
      patcher = null;
      patched = false;
      const detach = globalThis.NativePlugin?.objc?.glassDetachById;
      if (typeof detach === "function") {
        try {
          Promise.resolve(detach(MARKER)).catch(error =>
            console.warn("[Native Liquid Glass] Detach:", String(error)));
        } catch (error) {
          console.warn("[Native Liquid Glass] Detach:", String(error));
        }
      }
    }
  };
})()
