(() => {
  let active = false;
  let previous = null;
  let hadPrevious = false;
  return {
    start() {
      if (active) return;
      active = true;
      const existing = globalThis.__unboundGlassPreferences;
      hadPrevious = !!existing && Object.prototype.hasOwnProperty.call(existing, "clearStyle");
      previous = hadPrevious ? existing.clearStyle : null;
      if (!existing || typeof existing !== "object")
        globalThis.__unboundGlassPreferences = {};
      globalThis.__unboundGlassPreferences.clearStyle = true;
    },
    stop() {
      if (!active) return;
      active = false;
      const preferences = globalThis.__unboundGlassPreferences;
      if (!preferences || typeof preferences !== "object") return;
      if (hadPrevious) preferences.clearStyle = previous;
      else delete preferences.clearStyle;
    }
  };
})()
