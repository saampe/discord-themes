({
  start() {
    const report = { probe: "discord-color-probe", version: 2 };
    const shape = (value) => {
      if (value === null) return { type: "null" };
      const type = typeof value;
      if (type !== "object" && type !== "function") return { type };
      let keys = [], prototypeKeys = [];
      try { keys = Object.keys(value).slice(0, 45); } catch (_) {}
      try { prototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(value)).slice(0, 45); } catch (_) {}
      return { type, keys, prototypeKeys };
    };
    try {
      const metro = globalThis.unbound?.metro;
      const theme = metro?.common?.Theme;
      report.theme = shape(theme);
      report.colors = shape(theme?.colors);
      report.internal = shape(theme?.internal);
      report.rawColors = shape(theme?.unsafe_rawColors);
      report.sample = {};
      const names = ["BACKGROUND_BASE_LOWEST", "BACKGROUND_BASE_LOWER", "BACKGROUND_BASE_LOW",
        "BACKGROUND_SURFACE_HIGH", "TEXT_DEFAULT", "TEXT_STRONG", "BACKGROUND_ACCENT", "CONTROL_PRIMARY_BACKGROUND_DEFAULT"];
      for (const name of names) {
        const v = theme?.colors?.[name];
        const info = shape(v);
        if (v && typeof v === "object") {
          info.fields = {};
          for (const key of info.keys.slice(0, 12)) {
            try {
              const item = v[key];
              if (typeof item === "string") info.fields[key] = /^#[0-9A-Fa-f]{3,8}$/.test(item) ? item : "string";
              else if (typeof item === "number" || typeof item === "boolean") info.fields[key] = item;
              else info.fields[key] = typeof item;
            } catch (_) { info.fields[key] = "error"; }
          }
        }
        report.sample[name] = info;
      }
      const clipboard = metro?.common?.Clipboard;
      if (typeof clipboard?.setString === "function") clipboard.setString(JSON.stringify(report, null, 2));
      console.log("[Discord Color Probe v2] Report copied:", !!clipboard?.setString);
    } catch (error) {
      console.error("[Discord Color Probe]", String(error));
    }
  },
  stop() {}
})
