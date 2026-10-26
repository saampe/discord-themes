(() => {
  const MARKER = "unbound.glass.youbar.background";
  const MODULE_PATH = "modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx";
  const MAX_ATTACH_ATTEMPTS = 14;
  const ATTACH_RETRY_MS = 450;
  const INSTALL_RETRY_MS = 900;
  const MAX_INSTALL_ATTEMPTS = 24;
  let active = false;
  let epoch = 0;
  let patcher = null;
  let installTimer = null;
  let patched = false;

  function install(generation, attempt = 0) {
    if (!active || epoch !== generation || patched) return;
    const unbound = globalThis.unbound;
    const metro = unbound?.metro;
    const React = metro?.common?.React;
    const NativeView = metro?.common?.ReactNative?.View;
    const makePatcher = unbound?.patcher?.createPatcher;
    const objc = globalThis.NativePlugin?.objc;
    const ready = typeof objc?.glassAttachById === 'function' &&
      typeof objc?.glassDetachById === 'function' &&
      typeof metro?.findByFilePath === 'function' &&
      typeof React?.isValidElement === 'function' &&
      typeof React?.cloneElement === 'function' &&
      typeof React?.createElement === 'function' &&
      typeof React?.useEffect === 'function' &&
      typeof React?.useState === 'function' &&
      !!NativeView && typeof makePatcher === 'function';

    if (!ready) {
      if (attempt < MAX_INSTALL_ATTEMPTS)
        installTimer = setTimeout(() => install(generation, attempt + 1), INSTALL_RETRY_MS);
      else
        console.warn('[Native Liquid Glass] Required plugin/Metro APIs unavailable; original YouBar preserved');
      return;
    }
    const exports = metro.findByFilePath(MODULE_PATH, { interop: false });
    const component = exports?.default ?? exports;
    if (!component || typeof component.type !== 'function') {
      if (attempt < MAX_INSTALL_ATTEMPTS)
        installTimer = setTimeout(() => install(generation, attempt + 1), INSTALL_RETRY_MS);
      else
        console.warn('[Native Liquid Glass] Discord YouBarBackground not found; no changes made');
      return;
    }

    // Keep the masked/animated bar opaque until UIKit confirms attachment.
    function NativeGlassYouBarLayer({ original }) {
      const [glassReady, setGlassReady] = React.useState(false);
      React.useEffect(() => {
        let mounted = true;
        let timer = null;
        let hasAttached = false;
        let tries = 0;
        const attach = async () => {
          if (!mounted || !active || epoch !== generation) return;
          tries++;
          try {
            const ok = await objc.glassAttachById(MARKER, true, true);
            if (!mounted || !active || epoch !== generation) return;
            if (ok) {
              hasAttached = true;
              setGlassReady(true);
              console.log('[Native Liquid Glass] Real UIKit glass attached to YouBar');
              return;
            }
          } catch (error) {
            if (tries === MAX_ATTACH_ATTEMPTS)
              console.warn('[Native Liquid Glass] Native attachment failed:', String(error));
          }
          if (tries < MAX_ATTACH_ATTEMPTS)
            timer = setTimeout(attach, ATTACH_RETRY_MS);
          else
            console.warn('[Native Liquid Glass] YouBar kept opaque; native marker not found');
        };
        timer = setTimeout(attach, 180);
        return () => {
          mounted = false;
          if (timer !== null) clearTimeout(timer);
          if (hasAttached) {
            try { Promise.resolve(objc.glassDetachById(MARKER))
              .catch(error => console.warn('[Native Liquid Glass] Detach:', String(error))); }
            catch (error) { console.warn('[Native Liquid Glass] Detach:', String(error)); }
          }
        };
      }, []);
      const background = glassReady ? React.cloneElement(original, {
        ...original.props, backgroundColor: 'transparent'
      }) : original;
      return React.createElement(NativeView, {
        testID: MARKER,
        collapsable: false,
        pointerEvents: 'none',
        style: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }
      }, background);
    }

    try {
      patcher = makePatcher('native-liquid-glass-youbar');
      patcher.after(component, 'type', ({ result }) => {
        if (!active || !React.isValidElement(result)) return result;
        return React.createElement(NativeGlassYouBarLayer, { original: result });
      });
      patched = true;
      console.log('[Native Liquid Glass] Exact YouBar React hook ready');
    } catch (error) {
      patcher?.unpatchAll?.();
      patcher = null;
      console.warn('[Native Liquid Glass] Plugin not installed:', String(error));
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      patched = false;
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
      const detach = globalThis.NativePlugin?.objc?.glassDetachById;
      if (typeof detach === 'function') {
        try { Promise.resolve(detach(MARKER))
          .catch(error => console.warn('[Native Liquid Glass] Detach:', String(error))); }
        catch (error) { console.warn('[Native Liquid Glass] Detach:', String(error)); }
      }
    }
  };
})()
