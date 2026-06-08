(function () {
  const DEFAULT_PREVIEW_CHARS = 700;

  function normalizeAccess(value) {
    const access = String(value || "free").toLowerCase();
    return access === "premium" || access === "paid" ? "paid" : "free";
  }

  function formatPeso(amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "";
    return `PHP ${numericAmount.toLocaleString("en-PH")}`;
  }

  function readSettingValue(setting, key, fallback) {
    if (!setting || setting[key] === undefined || setting[key] === null) return fallback;
    return setting[key];
  }

  function mergePoemsWithSettings(poems, settings, options = {}) {
    const includeDisabled = Boolean(options.includeDisabled);
    const sourcePoems = Array.isArray(poems) ? poems : [];
    const settingsMap = new Map((Array.isArray(settings) ? settings : []).map(item => [item.slug, item]));

    return sourcePoems
      .map(poem => {
        const setting = settingsMap.get(poem.slug) || null;
        const accessType = normalizeAccess(readSettingValue(setting, "access_type", poem.access));
        const rawPrice = readSettingValue(setting, "price", poem.price);
        const numericPrice = Number(rawPrice);
        const price = accessType === "paid" && Number.isFinite(numericPrice) && numericPrice > 0
          ? numericPrice
          : (accessType === "paid" ? 49 : null);

        return {
          ...poem,
          title: readSettingValue(setting, "title", poem.title),
          category: readSettingValue(setting, "category", poem.category),
          type: readSettingValue(setting, "type", poem.type || "spoken-poetry"),
          is_enabled: readSettingValue(setting, "is_enabled", true) !== false,
          access: accessType,
          access_type: accessType,
          price,
          preview_char_limit: Number(readSettingValue(setting, "preview_char_limit", DEFAULT_PREVIEW_CHARS)) || DEFAULT_PREVIEW_CHARS,
          preview_mode: readSettingValue(setting, "preview_mode", "chars")
        };
      })
      .filter(poem => includeDisabled || poem.is_enabled !== false);
  }

  async function loadSettings() {
    const client = window.safeAdminClient;

    if (!client) {
      return [];
    }

    try {
      const { data, error } = await client
        .from("piece_settings")
        .select("slug,title,category,type,is_enabled,access_type,price,preview_mode,preview_char_limit,updated_at,content_label");

      if (error) {
        console.warn("Piece settings unavailable:", error.message || error);
        return [];
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("Piece settings unavailable:", error.message || error);
      return [];
    }
  }

  window.SafePieceSettings = {
    DEFAULT_PREVIEW_CHARS,
    normalizeAccess,
    formatPeso,
    mergePoemsWithSettings,
    loadSettings
  };
}());


/* V18R content label support */
(function setupSafeContentLabelSupport() {
  function normalizeContentLabel(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (raw === "story") return "story";
    if (raw === "motivational") return "motivational";
    return "spoken-poetry";
  }

  function mapSettings(settings) {
    if (Array.isArray(settings)) {
      return new Map(settings.map(item => [item.slug, item]));
    }

    if (settings && typeof settings === "object") {
      return new Map(Object.values(settings).map(item => [item.slug, item]));
    }

    return new Map();
  }

  function enhance() {
    if (!window.SafePieceSettings || window.SafePieceSettings.__contentLabelSupport) return false;

    const originalMerge = window.SafePieceSettings.mergePoemsWithSettings;

    window.SafePieceSettings.normalizeContentLabel = normalizeContentLabel;

    window.SafePieceSettings.mergePoemsWithSettings = function mergePoemsWithContentLabels(poems, settings, options) {
      const merged = typeof originalMerge === "function"
        ? originalMerge.call(window.SafePieceSettings, poems, settings, options)
        : (Array.isArray(poems) ? poems : []);

      const settingsMap = mapSettings(settings);

      return merged.map(poem => {
        const setting = settingsMap.get(poem.slug) || {};
        const contentLabel = normalizeContentLabel(setting.content_label || setting.type || poem.type);

        return {
          ...poem,
          content_label: contentLabel,
          type: contentLabel
        };
      });
    };

    window.SafePieceSettings.__contentLabelSupport = true;
    return true;
  }

  if (!enhance()) {
    document.addEventListener("DOMContentLoaded", enhance, { once: true });
  }
})();

