(() => {
  let alive = false;
  let generation = 0;
  let timer = null;

  // Inspect only classes and bounds. Never read messages, labels, tokens or IDs.
  async function inspect(epoch) {
    if (!alive || epoch !== generation) return;
    const objc = globalThis.NativePlugin?.objc;
    const capabilities = globalThis.NativePlugin?.capabilities;
    if (!objc || typeof objc.findViews !== "function" || typeof objc.invokeAsync !== "function") {
      console.warn("[Native Glass Navigation] NativePlugin bridge unavailable");
      return;
    }
    try {
      const utilities = objc.getClass("Utilities");
      if (!utilities) throw new Error("Utilities native class unavailable");
      const window = await objc.invokeAsync(utilities, "keyWindow", []);
      if (!window) throw new Error("No active Discord UIWindow");
      const controller = await objc.invokeAsync(window, "rootViewController", []);
      if (!controller) throw new Error("No Discord root UIViewController");
      const root = await objc.invokeAsync(controller, "view", []);
      if (!root) throw new Error("No Discord root UIView");
      const options = { attachedOnly: true, maxDepth: 34, maxVisited: 1200, maxResults: 16 };
      const [bars, hosts, tabViews] = await Promise.all([
        objc.findViews(root, "UITabBar", options),
        objc.findViews(root, "RNSTabsHostComponentView", options),
        objc.findViews(root, "RNSTabsHost", options)
      ]);
      if (!alive || epoch !== generation) return;
      const safe = { hasNativeTabBar: bars.length > 0,
        nativeBarCount: bars.length, hostCount: hosts.length,
        fabricTabsHostCount: tabViews.length,
        supportsMaterialAttachment: !!capabilities?.includes?.("native.objc.glassHost"),
        inspectedAt: new Date().toISOString() };
      globalThis.__nativeGlassNavigationStatus = Object.freeze(safe);
      console.log("[Native Glass Navigation] Class-only diagnostics:", JSON.stringify(safe));
      // No UI edits from a diagnostic. UIKit's guarded RNSTabBarController
      // implementation is handled by NativeTabsGlass.x.
    } catch (error) {
      if (alive && epoch === generation)
        console.warn("[Native Glass Navigation] Inspection failed:", String(error?.message ?? error));
    }
  }

  return {
    start() {
      alive = true;
      const epoch = ++generation;
      timer = setTimeout(() => {
        timer = null;
        void inspect(epoch);
      }, 2500);
    },
    stop() {
      alive = false;
      ++generation;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      delete globalThis.__nativeGlassNavigationStatus;
    }
  };
})()
