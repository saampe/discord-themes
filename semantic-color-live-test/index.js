(() => {
  let patch = null;
  return {
    start() {
      const api = globalThis.unbound;
      const theme = api?.metro?.common?.Theme;
      const resolver = theme?.internal;
      const token = theme?.colors?.BACKGROUND_BASE_LOWEST;
      const factory = api?.patcher?.createPatcher;
      if (!resolver || typeof resolver.resolveSemanticColor !== "function" || !token || typeof factory !== "function") {
        console.error("[Semantic Color Live Test] Required APIs unavailable");
        return;
      }
      try {
        patch = factory("semantic-color-live-test");
        patch.after(resolver, "resolveSemanticColor", ({ args }) => {
          if (args.includes(token)) return "#FF00FF";
        });
        console.log("[Semantic Color Live Test] Reversible color patch enabled.");
      } catch (e) {
        patch?.unpatchAll();
        patch = null;
        console.error("[Semantic Color Live Test] Could not patch:", String(e));
      }
    },
    stop() {
      patch?.unpatchAll();
      patch = null;
    }
  };
})()
