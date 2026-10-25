({
  start() {
    const report = { probe: "discord-color-probe", version: 1 };
    const inspect = (value) => {
      if (!value || (typeof value !== "object" && typeof value !== "function")) {
        return { type: typeof value, keys: [] };
      }
      let keys = [];
      try { keys = Object.keys(value).slice(0, 120); } catch (_) {}
      return { type: typeof value, keys };
    };
    try {
      const metro = globalThis.unbound?.metro;
      report.metro = !!metro;
      const theme = metro?.common?.Theme;
      report.theme = inspect(theme);
      report.colors = inspect(theme?.colors);
      report.internal = inspect(theme?.internal);
      const stores = metro?.stores;
      report.themeStore = inspect(stores?.Theme);
      const colorNames = report.colors.keys;
      report.colorSample = {};
      for (const key of colorNames.slice(0, 30)) {
        try {
          const value = theme.colors[key];
          report.colorSample[key] = typeof value === "function"
            ? "function"
            : typeof value === "string"
              ? (value.match(/^#[0-9A-Fa-f]{3,8}$/) ? value : "string")
              : typeof value;
        } catch (_) { report.colorSample[key] = "getter-error"; }
      }
      const clipboard = metro?.common?.Clipboard;
      if (clipboard && typeof clipboard.setString === "function") {
        clipboard.setString(JSON.stringify(report, null, 2));
        console.log("[Discord Color Probe] Report copied to clipboard.");
      } else {
        console.log("[Discord Color Probe] Clipboard unavailable.", JSON.stringify(report));
      }
    } catch (error) {
      console.error("[Discord Color Probe]", String(error));
    }
  },
  stop() {}
})
