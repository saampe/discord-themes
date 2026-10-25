(() => {
  const palette = {
    BACKGROUND_BASE_LOWEST: "#111217",
    BACKGROUND_BASE_LOWER: "#15171D",
    BACKGROUND_BASE_LOW: "#1A1D24",
    BACKGROUND_SURFACE_HIGH: "#252A34",
    BACKGROUND_SURFACE_HIGHEST: "#343947",
    BACKGROUND_SECONDARY_ALT: "#20232B",
    BACKGROUND_ACCENT: "#5865F2",
    BACKGROUND_CODE: "#232733",
    BACKGROUND_MOD_MUTED: "#FFFFFF0C",
    BACKGROUND_MOD_NORMAL: "#FFFFFF16",
    BACKGROUND_MOD_STRONG: "#FFFFFF26",
    BACKGROUND_MOD_SUBTLE: "#FFFFFF08",
    BACKGROUND_SCRIM: "#080A0DC2",
    BACKGROUND_SCRIM_LIGHTBOX: "#080A0DE0",
    BG_SURFACE_RAISED: "#252A34",
    CHANNEL_BACKGROUND_DEFAULT: "#1A1D24",
    CHANNELTEXTAREA_BACKGROUND: "#292E38",
    CHAT_INPUT_BACKGROUND: "#292E38",
    CARD_BACKGROUND_DEFAULT: "#252A34",
    CARD_SECONDARY_BACKGROUND_DEFAULT: "#232733",
    CARD_SECONDARY_BG: "#232733",
    CARD_MUTED_BG: "#20232B",
    CHAT_BANNER_BG: "#20232B",
    BORDER_SUBTLE: "#AAB9D020",
    BORDER_MUTED: "#AAB9D030",
    BORDER_NORMAL: "#FFFFFF26",
    BORDER_STRONG: "#AAB9D050",
    TEXT_DEFAULT: "#F5F7FA",
    TEXT_STRONG: "#FFFFFF",
    TEXT_MUTED: "#A9B3C2",
    TEXT_SUBTLE: "#8491A3",
    TEXT_LINK: "#A6BCE5",
    TEXT_BRAND: "#91ABD8",
    INTERACTIVE_TEXT_DEFAULT: "#DFE6F0",
    INTERACTIVE_TEXT_ACTIVE: "#FFFFFF",
    INTERACTIVE_ICON_DEFAULT: "#B9C6D7",
    INTERACTIVE_ICON_ACTIVE: "#FFFFFF"
  };
  // Coverage first: keep separate tones so every container is visible during testing.
  // Override only neutral surface tokens; retain semantic alerts, brands, images and text.
  function inferredBackground(name) {
    // Never recolor functional controls, including unchecked/disabled states.
    if (/(^|_)(SWITCH|TOGGLE|RADIO|CHECKBOX|CONTROL|BUTTON|SLIDER|SELECT|INPUT_ACTION)(_|$)/.test(name)) return null;
    if (/(GRADIENT|BRAND|ACCENT|CRITICAL|DANGER|WARNING|POSITIVE|SUCCESS|INFO|NOTIFICATION|FEEDBACK|PINK|VOICE|SCRIM|ICON|TEXT|TINT|FOREGROUND|FOCUS|TRANSPARENT|BLUR)/.test(name)) return null;
    if (/(BORDER|OUTLINE|DIVIDER|SEPARATOR|STROKE)/.test(name)) return "#414958";
    if (/(PRESSED|HOVER|ACTIVE|SELECTED)/.test(name) && /BACKGROUND|_BG$|SURFACE/.test(name)) return "#384152";
    if (/(^|_)(PROFILE|USER_PANEL|ACCOUNT|MEMBER|POPOUT|MODAL|MENU|SHEET|DRAWER|FLOATING|TOOLTIP)(_|$)/.test(name) && /(BACKGROUND|_BG$|SURFACE|CONTAINER|CARD)/.test(name)) return "#343947";
    if (/(^|_)(CARD|TILE|PANEL|WIDGET|BOX|CONTAINER|INPUT|TEXTAREA|BUTTON|CONTROL)(_|$)/.test(name) && /(BACKGROUND|_BG$|SURFACE|CONTAINER|CARD)/.test(name)) return "#272C36";
    if (/(^|_)(SURFACE|BACKGROUND|BG|CHANNELS|SIDEBAR|CHAT|APP_FRAME)(_|$)/.test(name) || /BACKGROUND|_BG$/.test(name)) {
      if (/(MUTED|MOD_|OVERLAY)/.test(name)) return null;
      if (/(HIGHEST|RAISED|ELEVATED|FLOATING)/.test(name)) return "#343947";
      if (/(HIGH|SECONDARY|TERTIARY|INPUT)/.test(name)) return "#20242E";
      return "#14171D";
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
        console.error("[Titanium Blue Glass] Discord theme APIs unavailable");
        return;
      }
      const replacements = new Map();
      for (const [name, token] of Object.entries(theme?.colors ?? {})) {
        if (!token || typeof token !== "object") continue;
        const value = Object.prototype.hasOwnProperty.call(palette, name) ? palette[name] : inferredBackground(name);
        if (value) replacements.set(token, value);
      }
      if (!replacements.size) {
        console.error("[Titanium Blue Glass] No semantic tokens found");
        return;
      }
      try {
        patch = createPatcher("titanium-blue-glass");
        patch.after(resolver, "resolveSemanticColor", ({ args }) => {
          for (const arg of args) {
            if (replacements.has(arg)) return replacements.get(arg);
          }
        });
        console.log("[Titanium Blue Glass] Enabled", replacements.size, "tokens");
      } catch (e) {
        patch?.unpatchAll();
        patch = null;
        console.error("[Titanium Blue Glass] Error:", String(e));
      }
    },
    stop() {
      patch?.unpatchAll();
      patch = null;
    }
  };
})()
