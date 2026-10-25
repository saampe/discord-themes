(() => {
  const palette = {
    BACKGROUND_BASE_LOWEST: "#050506",
    BACKGROUND_BASE_LOWER: "#090A0C",
    BACKGROUND_BASE_LOW: "#111216",
    BACKGROUND_SURFACE_HIGH: "#1C1D22",
    BACKGROUND_SURFACE_HIGHEST: "#27282D",
    BACKGROUND_SECONDARY_ALT: "#15161A",
    BACKGROUND_ACCENT: "#5865F2",
    BACKGROUND_CODE: "#17181C",
    BACKGROUND_MOD_MUTED: "#FFFFFF0A",
    BACKGROUND_MOD_NORMAL: "#FFFFFF12",
    BACKGROUND_MOD_STRONG: "#FFFFFF24",
    BACKGROUND_MOD_SUBTLE: "#FFFFFF06",
    BACKGROUND_SCRIM: "#000000B8",
    BACKGROUND_SCRIM_LIGHTBOX: "#000000D9",
    BG_SURFACE_RAISED: "#1C1D22",
    CHANNEL_BACKGROUND_DEFAULT: "#111216",
    CHANNELTEXTAREA_BACKGROUND: "#1B1C21",
    CHAT_INPUT_BACKGROUND: "#1B1C21",
    CARD_BACKGROUND_DEFAULT: "#1C1D22",
    CARD_SECONDARY_BACKGROUND_DEFAULT: "#17181C",
    CARD_SECONDARY_BG: "#17181C",
    CARD_MUTED_BG: "#15161A",
    CHAT_BANNER_BG: "#15161A",
    BORDER_SUBTLE: "#FFFFFF10",
    BORDER_MUTED: "#FFFFFF18",
    BORDER_NORMAL: "#FFFFFF24",
    BORDER_STRONG: "#FFFFFF36",
    TEXT_DEFAULT: "#EDEEF1",
    TEXT_STRONG: "#FFFFFF",
    TEXT_MUTED: "#9799A2",
    TEXT_SUBTLE: "#777984",
    TEXT_LINK: "#92A7FF",
    TEXT_BRAND: "#929BFF",
    INTERACTIVE_TEXT_DEFAULT: "#D7D8DE",
    INTERACTIVE_TEXT_ACTIVE: "#FFFFFF",
    INTERACTIVE_ICON_DEFAULT: "#BEC0C8",
    INTERACTIVE_ICON_ACTIVE: "#FFFFFF",
    INTERACTIVE_BACKGROUND_DEFAULT: "#1B1C21",
    INTERACTIVE_BACKGROUND_HOVER: "#282930",
    INTERACTIVE_BACKGROUND_SELECTED: "#31323A",
    CONTROL_PRIMARY_BACKGROUND_DEFAULT: "#5865F2",
    CONTROL_PRIMARY_BACKGROUND_ACTIVE: "#4552D8",
    CONTROL_PRIMARY_TEXT_DEFAULT: "#FFFFFF",
    CONTROL_SECONDARY_BACKGROUND_DEFAULT: "#292A30",
    CONTROL_SECONDARY_BACKGROUND_ACTIVE: "#35363D"
  };
  // Coverage first: keep separate tones so every container is visible during testing.
  // Override only neutral surface tokens; retain semantic alerts, brands, images and text.
  function inferredBackground(name) {
    if (/(GRADIENT|BRAND|ACCENT|CRITICAL|DANGER|WARNING|POSITIVE|SUCCESS|INFO|NOTIFICATION|FEEDBACK|PINK|VOICE|SCRIM|ICON|TEXT|TINT|FOREGROUND|FOCUS|TRANSPARENT|BLUR)/.test(name)) return null;
    if (/(BORDER|OUTLINE|DIVIDER|SEPARATOR|STROKE)/.test(name)) return "#36383F";
    if (/(PRESSED|HOVER|ACTIVE|SELECTED)/.test(name) && /BACKGROUND|_BG$|SURFACE/.test(name)) return "#303139";
    if (/(^|_)(PROFILE|USER_PANEL|ACCOUNT|MEMBER|POPOUT|MODAL|MENU|SHEET|DRAWER|FLOATING|TOOLTIP)(_|$)/.test(name) && /(BACKGROUND|_BG$|SURFACE|CONTAINER|CARD)/.test(name)) return "#292A32";
    if (/(^|_)(CARD|TILE|PANEL|WIDGET|BOX|CONTAINER|INPUT|TEXTAREA|BUTTON|CONTROL)(_|$)/.test(name) && /(BACKGROUND|_BG$|SURFACE|CONTAINER|CARD)/.test(name)) return "#202127";
    if (/(^|_)(SURFACE|BACKGROUND|BG|CHANNELS|SIDEBAR|CHAT|APP_FRAME)(_|$)/.test(name) || /BACKGROUND|_BG$/.test(name)) {
      if (/(MUTED|MOD_|OVERLAY)/.test(name)) return null;
      if (/(HIGHEST|RAISED|ELEVATED|FLOATING)/.test(name)) return "#292A32";
      if (/(HIGH|SECONDARY|TERTIARY|INPUT)/.test(name)) return "#1A1B20";
      return "#101115";
    }
    return null;
  }
  let patch = null;
  return {
    start() {
      const unbound = globalThis.unbound;
      const theme = unbound?.metro?.common?.Theme;
      const resolver = theme?.internal;
      const createPatcher = unbound?.patcher?.createPatcher;
      if (typeof resolver?.resolveSemanticColor !== "function" || typeof createPatcher !== "function") {
        console.error("[Midnight Glass JS] Discord theme APIs unavailable");
        return;
      }
      const replacements = new Map();
      for (const [name, token] of Object.entries(theme?.colors ?? {})) {
        if (!token || typeof token !== "object") continue;
        const value = Object.prototype.hasOwnProperty.call(palette, name) ? palette[name] : inferredBackground(name);
        if (value) replacements.set(token, value);
      }
      if (!replacements.size) {
        console.error("[Midnight Glass JS] No semantic tokens found");
        return;
      }
      try {
        patch = createPatcher("midnight-glass-js");
        patch.after(resolver, "resolveSemanticColor", ({ args }) => {
          for (const arg of args) {
            if (replacements.has(arg)) return replacements.get(arg);
          }
        });
        console.log("[Midnight Glass JS] Enabled", replacements.size, "tokens");
      } catch (e) {
        patch?.unpatchAll();
        patch = null;
        console.error("[Midnight Glass JS] Error:", String(e));
      }
    },
    stop() {
      patch?.unpatchAll();
      patch = null;
    }
  };
})()
