const dashboardMessage = document.querySelector("#dashboardMessage");
const promoForm = document.querySelector("#promoForm");
const unlockForm = document.querySelector("#unlockForm");
const promoList = document.querySelector("#promoList");
const unlockList = document.querySelector("#unlockList");
const paymentList = document.querySelector("#paymentList");
const pieceSettingsList = document.querySelector("#pieceSettingsList");
const pieceControlFilters = document.querySelector("#pieceControlFilters");
const pieceControlSearchInput = document.querySelector("#pieceControlSearchInput");
const pieceControlSearchSummary = document.querySelector("#pieceControlSearchSummary");
const promoRequestList = document.querySelector("#promoRequestList");
const pieceAnalyticsList = document.querySelector("#pieceAnalyticsList");
const analyticsTotalViews = document.querySelector("#analyticsTotalViews");
const analyticsTotalUnlocks = document.querySelector("#analyticsTotalUnlocks");
const analyticsTopUnlockRate = document.querySelector("#analyticsTopUnlockRate");
const pieceAnalyticsRefreshBtn = document.querySelector("#pieceAnalyticsRefreshBtn");
const pieceAnalyticsToggleBtn = document.querySelector("#pieceAnalyticsToggleBtn");



// V2.0Q.7 piece control image fallback
if (!window.__safePieceControlCoverFallbackBound) {
  window.__safePieceControlCoverFallbackBound = true;

  document.addEventListener("error", event => {
    const target = event.target;

    if (
      target instanceof HTMLImageElement &&
      target.classList.contains("piece-control-cover")
    ) {
      target.hidden = true;
      target.setAttribute("aria-hidden", "true");
    }
  }, true);
}


function syncAdminControlBarVisibility() {
  const controlBar = document.querySelector(".admin-control-bar");
  const dashboard = document.querySelector("#dashboardView");

  if (!controlBar || !dashboard) return;

  const isDashboardVisible = !dashboard.classList.contains("hidden");

  controlBar.classList.toggle("hidden", !isDashboardVisible);
  controlBar.setAttribute("aria-hidden", isDashboardVisible ? "false" : "true");
}

function setupAdminControlBarGate() {
  const dashboard = document.querySelector("#dashboardView");
  const auth = document.querySelector("#authView");

  syncAdminControlBarVisibility();

  const observer = new MutationObserver(syncAdminControlBarVisibility);

  if (dashboard) {
    observer.observe(dashboard, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (auth) {
    observer.observe(auth, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  window.addEventListener("pageshow", syncAdminControlBarVisibility);
}




function syncPromoRequestBellBadge() {
  const badge = document.querySelector("#promoRequestBellCount");
  if (!badge) return;

  const raw = String(badge.textContent || "").trim();
  const count = Number.parseInt(raw, 10);

  if (!Number.isFinite(count) || count <= 0) {
    badge.textContent = "";
    badge.classList.remove("has-count");
    badge.setAttribute("aria-hidden", "true");
    return;
  }

  badge.textContent = String(count);
  badge.classList.add("has-count");
  badge.setAttribute("aria-hidden", "false");
}

function setupPromoRequestBellBadgeWatcher() {
  const badge = document.querySelector("#promoRequestBellCount");
  if (!badge) return;

  syncPromoRequestBellBadge();

  const observer = new MutationObserver(() => {
    syncPromoRequestBellBadge();
  });

  observer.observe(badge, {
    childList: true,
    characterData: true,
    subtree: true
  });
}


const promoRequestBell = document.querySelector("#promoRequestBell");
const promoRequestBellCount = document.querySelector("#promoRequestBellCount");
const promoRequestModal = document.querySelector("#promoRequestModal");
const closePromoRequestModalBtn = document.querySelector("#closePromoRequestModal");
const codeCreationModal = document.querySelector("#codeCreationModal");
const codeCreationForm = document.querySelector("#codeCreationForm");
const closeCodeCreationModalBtn = document.querySelector("#closeCodeCreationModal");
const cancelCodeCreationModalBtn = document.querySelector("#cancelCodeCreationModal");
const codeCreationKindInput = document.querySelector("#codeCreationKind");
const codeCreationTitle = document.querySelector("#codeCreationModalTitle");
const codeCreationHelp = document.querySelector("#codeCreationModalHelp");
const codeCreationPieceTitle = document.querySelector("#codeCreationPieceTitle");
const codeCreationPieceSlug = document.querySelector("#codeCreationPieceSlug");
const codeCreationDiscountTypeWrap = document.querySelector("#codeCreationDiscountTypeWrap");
const codeCreationDiscountValueWrap = document.querySelector("#codeCreationDiscountValueWrap");
const codeCreationDiscountTypeInput = document.querySelector("#codeCreationDiscountType");
const codeCreationDiscountValueInput = document.querySelector("#codeCreationDiscountValue");
const codeCreationMaxUsesInput = document.querySelector("#codeCreationMaxUses");
const codeCreationCustomCodeInput = document.querySelector("#codeCreationCustomCode");
const codeCreationSummary = document.querySelector("#codeCreationSummary");
const submitCodeCreationModalBtn = document.querySelector("#submitCodeCreationModal");
const promoPiecePicker = document.querySelector("#promoPiecePicker");
const unlockPiecePicker = document.querySelector("#unlockPiecePicker");

let latestAdminPieces = [];
let activePieceControlFilter = "all";
let activePieceControlSearch = "";
let pieceCharacterCountCache = new Map();
let latestPieceAnalytics = [];
const PIECE_ANALYTICS_COLLAPSED_KEY = "@safespaceofyours.privateAnalyticsCollapsed.v1";

function getAdminClientForAnalytics() {
  if (typeof adminClient !== "undefined" && adminClient) return adminClient;
  return window.safeAdminClient || null;
}

function getAnalyticsPieceTitle(slug) {
  const normalizedSlug = String(slug || "").trim();

  const adminPiece = latestAdminPieces.find(piece => piece.slug === normalizedSlug);
  if (adminPiece && adminPiece.title) return adminPiece.title;

  const sourcePiece = Array.isArray(window.POEMS)
    ? window.POEMS.find(piece => piece.slug === normalizedSlug)
    : null;

  return sourcePiece && sourcePiece.title ? sourcePiece.title : normalizedSlug;
}

function formatAnalyticsNumber(value) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-PH");
}

function formatAnalyticsRate(value) {
  const number = Number(value) || 0;
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function renderPieceAnalytics(data = []) {
  if (!pieceAnalyticsList) return;

  const rows = Array.isArray(data) ? data : [];
  latestPieceAnalytics = rows;

  const totalViews = rows.reduce((sum, item) => sum + (Number(item.view_count) || 0), 0);
  const totalUnlocks = rows.reduce((sum, item) => sum + (Number(item.unlock_count) || 0), 0);
  const topUnlockRate = rows.reduce((max, item) => Math.max(max, Number(item.unlock_rate) || 0), 0);

  if (analyticsTotalViews) analyticsTotalViews.textContent = formatAnalyticsNumber(totalViews);
  if (analyticsTotalUnlocks) analyticsTotalUnlocks.textContent = formatAnalyticsNumber(totalUnlocks);
  if (analyticsTopUnlockRate) analyticsTopUnlockRate.textContent = formatAnalyticsRate(topUnlockRate);

  if (!rows.length) {
    pieceAnalyticsList.innerHTML = `<div class="analytics-empty">No analytics yet. Open a public piece or unlock a paid piece, then refresh this card.</div>`;
    return;
  }

  const sortedRows = [...rows]
    .sort((a, b) => {
      const unlockDiff = (Number(b.unlock_count) || 0) - (Number(a.unlock_count) || 0);
      if (unlockDiff) return unlockDiff;

      const viewDiff = (Number(b.view_count) || 0) - (Number(a.view_count) || 0);
      if (viewDiff) return viewDiff;

      return String(a.piece_slug || "").localeCompare(String(b.piece_slug || ""));
    })
    .slice(0, 8);

  pieceAnalyticsList.innerHTML = sortedRows.map(item => {
    const slug = String(item.piece_slug || "");
    const title = getAnalyticsPieceTitle(slug);
    const views = Number(item.view_count) || 0;
    const unlocks = Number(item.unlock_count) || 0;
    const rate = Number(item.unlock_rate) || 0;

    return `
      <article class="analytics-piece-row">
        <div class="analytics-piece-main">
          <strong>${escapeAdminHTML(title)}</strong>
        </div>
        <div class="analytics-piece-metrics">
          <span><b>${formatAnalyticsNumber(views)}</b> views</span>
          <span><b>${formatAnalyticsNumber(unlocks)}</b> unlocks</span>
          <span><b>${formatAnalyticsRate(rate)}</b> rate</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadPieceAnalytics(options = {}) {
  if (!pieceAnalyticsList) return;

  const isSilentRefresh = options.silent === true;
  const shouldShowLoading = !isSilentRefresh && latestPieceAnalytics.length === 0;

  const client = getAdminClientForAnalytics();
  if (!client) {
    if (!isSilentRefresh) {
      pieceAnalyticsList.innerHTML = `<div class="analytics-empty">Analytics client is not ready yet. Refresh after logging in.</div>`;
    }
    return;
  }

  if (shouldShowLoading) {
    pieceAnalyticsList.innerHTML = `<div class="analytics-empty">Loading analytics...</div>`;
  }

  const { data, error } = await client.rpc("get_private_piece_analytics");

  if (error) {
    console.warn("Private analytics failed to load:", error);
    if (!isSilentRefresh) {
      pieceAnalyticsList.innerHTML = `<div class="analytics-empty">Analytics could not be loaded yet. Make sure V20 SQL is applied and you are logged in as admin.</div>`;
    }
    return;
  }

  renderPieceAnalytics(data || []);
}

function setPrivateAnalyticsCollapsed(isCollapsed) {
  const card = document.querySelector("#privateAnalyticsCard");
  const panel = document.querySelector("#pieceAnalyticsPanel");

  if (!card || !panel || !pieceAnalyticsToggleBtn) return;

  card.classList.toggle("is-collapsed", isCollapsed);
  panel.hidden = isCollapsed;
  pieceAnalyticsToggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  pieceAnalyticsToggleBtn.setAttribute("title", isCollapsed ? "Expand analytics" : "Collapse analytics");
  pieceAnalyticsToggleBtn.setAttribute("aria-label", isCollapsed ? "Expand analytics" : "Collapse analytics");

  const label = pieceAnalyticsToggleBtn.querySelector(".sr-only");

  if (label) label.textContent = isCollapsed ? "Expand analytics" : "Collapse analytics";

  try {
    window.localStorage.setItem(PIECE_ANALYTICS_COLLAPSED_KEY, isCollapsed ? "1" : "0");
  } catch (error) {
    // Local storage can be unavailable in some privacy modes.
  }
}

function getSavedPrivateAnalyticsCollapsed() {
  try {
    return window.localStorage.getItem(PIECE_ANALYTICS_COLLAPSED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function setupPrivateAnalyticsCard() {
  if (!pieceAnalyticsList) return;

  setPrivateAnalyticsCollapsed(getSavedPrivateAnalyticsCollapsed());

  if (pieceAnalyticsRefreshBtn) {
    pieceAnalyticsRefreshBtn.addEventListener("click", () => {
      loadPieceAnalytics({ silent: false }).catch(error => console.warn("Private analytics refresh failed:", error));
    });
  }

  if (pieceAnalyticsToggleBtn) {
    pieceAnalyticsToggleBtn.addEventListener("click", () => {
      const card = document.querySelector("#privateAnalyticsCard");
      setPrivateAnalyticsCollapsed(!card || !card.classList.contains("is-collapsed"));
    });
  }

  const dashboardView = document.querySelector("#dashboardView");

  function loadWhenVisible() {
    if (!dashboardView || !dashboardView.classList.contains("hidden")) {
      loadPieceAnalytics().catch(error => console.warn("Private analytics load failed:", error));
    }
  }

  if (dashboardView && "MutationObserver" in window) {
    const observer = new MutationObserver(loadWhenVisible);
    observer.observe(dashboardView, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function refreshWhenVisibleQuietly() {
    if (document.hidden) return;

    if (!dashboardView || !dashboardView.classList.contains("hidden")) {
      loadPieceAnalytics({ silent: true }).catch(error => console.warn("Private analytics auto refresh failed:", error));
    }
  }

  if (!window.__safePrivateAnalyticsAutoRefreshBound) {
    window.__safePrivateAnalyticsAutoRefreshBound = true;
    window.setInterval(refreshWhenVisibleQuietly, 45000);
    document.addEventListener("visibilitychange", refreshWhenVisibleQuietly);
  }

  loadWhenVisible();
}

function setDashboardMessage(message, type = "") {
  if (!dashboardMessage) return;
  dashboardMessage.textContent = message || "";
  dashboardMessage.classList.remove("success", "error");
  if (type) dashboardMessage.classList.add(type);
}

function escapeAdminHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}



const ADMIN_CONTENT_LABEL_OPTIONS = [
  { value: "spoken-poetry", label: "Spoken Poetry" },
  { value: "motivational", label: "Motivational" },
  { value: "story", label: "Story" }
];

function normalizeAdminContentLabel(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (raw === "story") return "story";
  if (raw === "motivational") return "motivational";
  return "spoken-poetry";
}

function formatAdminContentLabel(value) {
  const normalized = normalizeAdminContentLabel(value);
  const option = ADMIN_CONTENT_LABEL_OPTIONS.find(item => item.value === normalized);
  return option ? option.label : "Spoken Poetry";
}

function renderAdminContentLabelOptions(currentValue) {
  const current = normalizeAdminContentLabel(currentValue);

  return ADMIN_CONTENT_LABEL_OPTIONS.map(option => `
    <option value="${escapeAdminHTML(option.value)}" ${option.value === current ? "selected" : ""}>
      ${escapeAdminHTML(option.label)}
    </option>
  `).join("");
}


function normalizeAdminAccess(value) {
  if (window.SafePieceSettings) return window.SafePieceSettings.normalizeAccess(value);
  return String(value || "free").toLowerCase() === "paid" ? "paid" : "free";
}

function formatAdminPeso(amount) {
  if (window.SafePieceSettings) return window.SafePieceSettings.formatPeso(amount);
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "";
  return `PHP ${numericAmount.toLocaleString("en-PH")}`;
}

function makeUnlockCode(slug) {
  const prefix = String(slug || "piece")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 5)
    .toUpperCase() || "PIECE";
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${randomPart}`;
}

function getPoemSourceMap() {
  return new Map((Array.isArray(window.POEMS) ? window.POEMS : []).map(poem => [poem.slug, poem]));
}

function formatDiscount(type, value) {
  const numericValue = Number(value) || 0;
  if (type === "percent") return `${numericValue}% off`;
  return `${formatAdminPeso(numericValue)} off`;
}

function formatTargetSummary(slugs) {
  const list = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
  if (!list.length) return "No piece targets selected";
  if (list.length === 1) return `For: ${list[0]}`;
  return `For ${list.length} pieces: ${list.slice(0, 3).join(", ")}${list.length > 3 ? "..." : ""}`;
}

function getSelectedPickerSlugs(picker) {
  if (!picker) return [];
  return Array.from(picker.querySelectorAll("[data-piece-target]:checked"))
    .map(input => input.value)
    .filter(Boolean)
    .slice(0, 5);
}

function enforcePickerLimit(picker) {
  if (!picker) return;

  const checked = Array.from(picker.querySelectorAll("[data-piece-target]:checked"));
  const unchecked = Array.from(picker.querySelectorAll("[data-piece-target]:not(:checked)"));
  const atLimit = checked.length >= 5;

  unchecked.forEach(input => {
    input.disabled = atLimit;
  });
}

function renderPiecePickers() {
  const paidPieces = latestAdminPieces.filter(piece => normalizeAdminAccess(piece.access_type) === "paid");

  const renderPicker = picker => {
    if (!picker) return;

    if (!paidPieces.length) {
      picker.innerHTML = `<div class="picker-empty">No paid pieces yet. Set a piece to Paid in Pieces control first.</div>`;
      return;
    }

    picker.innerHTML = paidPieces.map(piece => `
      <label class="piece-target-card">
        <input data-piece-target type="checkbox" value="${escapeAdminHTML(piece.slug)}" />
        <img src="${escapeAdminHTML(piece.cover || "")}" alt="" loading="lazy" />
        <span>
          <strong>${escapeAdminHTML(piece.title)}</strong>
          <small>${escapeAdminHTML(piece.category)} &bull; ${escapeAdminHTML(formatAdminPeso(piece.price || 49))}</small>
        </span>
      </label>
    `).join("");

    enforcePickerLimit(picker);
  };

  renderPicker(promoPiecePicker);
  renderPicker(unlockPiecePicker);
}

async function loadTargets(tableName, codeIdKey, ids) {
  if (!ids.length) return new Map();

  const { data, error } = await adminClient
    .from(tableName)
    .select(`${codeIdKey},piece_slug`)
    .in(codeIdKey, ids.map(String));

  if (error) return new Map();

  return (data || []).reduce((map, row) => {
    const key = String(row[codeIdKey]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.piece_slug);
    return map;
  }, new Map());
}



function getInlinePieceTextValue(piece) {
  const value = piece.fullText || piece.text || piece.content || piece.body || piece.poem || "";
  if (Array.isArray(value)) return value.join("\n");
  return String(value || "");
}

async function loadPieceCharacterCount(piece) {
  const inlineText = getInlinePieceTextValue(piece);
  if (inlineText) return inlineText.length;

  if (!piece.file) return 0;

  if (pieceCharacterCountCache.has(piece.file)) {
    return pieceCharacterCountCache.get(piece.file);
  }

  try {
    const response = await fetch(piece.file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${piece.file}`);
    const text = await response.text();
    const count = text.length;
    pieceCharacterCountCache.set(piece.file, count);
    return count;
  } catch (error) {
    console.warn("Character count failed:", error);
    pieceCharacterCountCache.set(piece.file, 0);
    return 0;
  }
}

async function enrichPiecesWithCharacterCounts(pieces) {
  return Promise.all(
    pieces.map(async piece => ({
      ...piece,
      total_characters: await loadPieceCharacterCount(piece)
    }))
  );
}

function formatCharacterCount(count) {
  const numericCount = Number(count) || 0;
  return numericCount.toLocaleString("en-PH");
}

function formatUseStatus(item) {
  const usedCount = Number(item.used_count) || 0;
  const maxUses = Number(item.max_uses) || 0;

  if (!maxUses) {
    return usedCount > 0 ? `Used ${usedCount} time/s` : "Not used";
  }

  const left = Math.max(maxUses - usedCount, 0);

  if (usedCount <= 0) return `Not used - ${left} left`;
  if (left <= 0) return `Used - 0 left`;
  return `Partly used - ${left} left`;
}

let pendingCodeCreationResolver = null;

function normalizeCodeCreationKind(value) {
  return String(value || "").toLowerCase() === "unlock" ? "unlock" : "promo";
}

function sanitizeCodeCreationCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .toUpperCase();
}

function parseCodeCreationMoney(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "").trim();
  return Number(cleaned);
}

function parseCodeCreationUses(value) {
  return Math.floor(Number(String(value || "").replace(/,/g, "").trim()));
}

function updateCodeCreationModalSummary() {
  if (!codeCreationSummary) return;

  const kind = normalizeCodeCreationKind(codeCreationKindInput?.value);
  const maxUses = parseCodeCreationUses(codeCreationMaxUsesInput?.value);
  const code = sanitizeCodeCreationCode(codeCreationCustomCodeInput?.value);
  const codeLabel = code || "Auto-generate";
  const usesLabel = Number.isFinite(maxUses) && maxUses > 0 ? `${maxUses} use/s` : "Enter max uses";

  if (kind === "unlock") {
    codeCreationSummary.textContent = `Unlock code - ${usesLabel} - ${codeLabel}`;
    return;
  }

  const discountType = codeCreationDiscountTypeInput?.value === "fixed" ? "fixed" : "percent";
  const discountValue = parseCodeCreationMoney(codeCreationDiscountValueInput?.value);
  const discountLabel = Number.isFinite(discountValue) && discountValue > 0
    ? formatDiscount(discountType, discountValue)
    : "Enter discount value";

  codeCreationSummary.textContent = `Promo code - ${discountLabel} - ${usesLabel} - ${codeLabel}`;
}

function configureCodeCreationModal(kind, piece) {
  const normalizedKind = normalizeCodeCreationKind(kind);
  const slug = piece?.slug || "";
  const title = piece?.title || slug || "Selected piece";
  const isPromo = normalizedKind === "promo";

  if (codeCreationKindInput) codeCreationKindInput.value = normalizedKind;
  if (codeCreationTitle) codeCreationTitle.textContent = isPromo ? "Create promo code" : "Create unlock code";
  if (codeCreationHelp) {
    codeCreationHelp.textContent = isPromo
      ? "Set discount, max uses, and optional custom code for the selected piece only."
      : "Set max uses and optional custom unlock code for the selected piece only.";
  }
  if (codeCreationPieceTitle) codeCreationPieceTitle.textContent = title;
  if (codeCreationPieceSlug) codeCreationPieceSlug.textContent = slug;

  if (codeCreationDiscountTypeWrap) codeCreationDiscountTypeWrap.hidden = !isPromo;
  if (codeCreationDiscountValueWrap) codeCreationDiscountValueWrap.hidden = !isPromo;
  if (codeCreationDiscountTypeInput) codeCreationDiscountTypeInput.value = "percent";
  if (codeCreationDiscountValueInput) codeCreationDiscountValueInput.value = isPromo ? "10" : "";
  if (codeCreationMaxUsesInput) codeCreationMaxUsesInput.value = "1";
  if (codeCreationCustomCodeInput) codeCreationCustomCodeInput.value = "";
  if (submitCodeCreationModalBtn) submitCodeCreationModalBtn.textContent = isPromo ? "Create promo code" : "Create unlock code";

  updateCodeCreationModalSummary();
}

function closeCodeCreationModal(result = null) {
  if (codeCreationModal) {
    codeCreationModal.classList.remove("is-open");
    codeCreationModal.setAttribute("aria-hidden", "true");
  }

  if (pendingCodeCreationResolver) {
    const resolve = pendingCodeCreationResolver;
    pendingCodeCreationResolver = null;
    resolve(result);
  }
}

function openCodeCreationModal(kind, piece) {
  if (!codeCreationModal || !codeCreationForm) {
    setDashboardMessage("Code creation modal is unavailable on this page.", "error");
    return Promise.resolve(null);
  }

  if (pendingCodeCreationResolver) closeCodeCreationModal(null);

  configureCodeCreationModal(kind, piece);
  codeCreationModal.classList.add("is-open");
  codeCreationModal.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    const focusTarget = normalizeCodeCreationKind(kind) === "promo"
      ? codeCreationDiscountValueInput
      : codeCreationMaxUsesInput;
    focusTarget?.focus();
  }, 0);

  return new Promise(resolve => {
    pendingCodeCreationResolver = resolve;
  });
}

function getCodeCreationSubmission() {
  const kind = normalizeCodeCreationKind(codeCreationKindInput?.value);
  const maxUses = parseCodeCreationUses(codeCreationMaxUsesInput?.value);

  if (!Number.isFinite(maxUses) || maxUses <= 0) {
    setDashboardMessage("Max uses must be a whole number greater than 0.", "error");
    codeCreationMaxUsesInput?.focus();
    return null;
  }

  const rawCode = String(codeCreationCustomCodeInput?.value || "").trim();
  const code = sanitizeCodeCreationCode(rawCode);

  if (rawCode && !code) {
    setDashboardMessage("Custom code must contain letters, numbers, or dash only.", "error");
    codeCreationCustomCodeInput?.focus();
    return null;
  }

  if (codeCreationCustomCodeInput) codeCreationCustomCodeInput.value = code;

  if (kind === "unlock") return { kind, code, maxUses };

  const discountType = codeCreationDiscountTypeInput?.value === "fixed" ? "fixed" : "percent";
  const discountValue = parseCodeCreationMoney(codeCreationDiscountValueInput?.value);

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    setDashboardMessage(
      discountType === "percent"
        ? "Percent discount must be a number greater than 0."
        : "Fixed PHP discount must be a number greater than 0.",
      "error"
    );
    codeCreationDiscountValueInput?.focus();
    return null;
  }

  if (discountType === "percent" && discountValue > 100) {
    setDashboardMessage("Percent discount cannot be higher than 100.", "error");
    codeCreationDiscountValueInput?.focus();
    return null;
  }

  return { kind, code, discountType, discountValue, maxUses };
}

function submitCodeCreationModal(event) {
  event.preventDefault();
  const submission = getCodeCreationSubmission();
  if (!submission) return;
  closeCodeCreationModal(submission);
}

function makePromoCode(slug) {
  const prefix = String(slug || "PROMO")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toUpperCase() || "PROMO";
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-P${randomPart}`;
}



function formatCodeUsesLeft(item) {
  const maxUses = Number(item.max_uses);
  const usedCount = Number(item.used_count) || 0;

  if (!Number.isFinite(maxUses) || maxUses <= 0) {
    return "Unlimited";
  }

  return `${Math.max(maxUses - usedCount, 0)} left`;
}

function getCodeUseBadge(item) {
  const usedCount = Number(item.used_count) || 0;
  const maxUses = Number(item.max_uses);

  if (Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses) {
    return { label: "Used up", className: "used-up" };
  }

  if (usedCount > 0) {
    return { label: "Used", className: "used" };
  }

  return { label: "Not used", className: "not-used" };
}

function isCodeDepleted(item) {
  const usedCount = Number(item.used_count) || 0;
  const maxUses = Number(item.max_uses);

  return Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses;
}

function renderCodeBadges(item) {
  const activeLabel = item.is_active ? "Active" : "Disabled";
  const activeClass = item.is_active ? "active" : "disabled";
  const useBadge = getCodeUseBadge(item);

  return `
    <div class="code-status-row" aria-label="Code status">
      <span class="code-badge ${activeClass}">${escapeAdminHTML(activeLabel)}</span>
      <span class="code-badge ${useBadge.className}">${escapeAdminHTML(useBadge.label)}</span>
    </div>
  `;
}

async function copyAdminText(value) {
  const text = String(value || "").trim();

  if (!text) {
    throw new Error("Nothing to copy.");
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}


function renderEmpty(target, message) {
  target.innerHTML = `<div class="list-item"><div><small>${escapeAdminHTML(message)}</small></div></div>`;
}

function formatAdminDate(value) {
  if (!value) return "No date";

  try {
    return new Date(value).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch (error) {
    return "No date";
  }
}

function getUnreadPromoRequestCount(requests = []) {
  return requests.filter(item => {
    const status = item.status || "pending";
    return status === "pending" && item.is_read !== true;
  }).length;
}

function updatePromoRequestBell(requests = []) {
  if (!promoRequestBell || !promoRequestBellCount) return;

  const unreadCount = getUnreadPromoRequestCount(requests);

  promoRequestBellCount.textContent = String(unreadCount);
  promoRequestBell.classList.toggle("has-alert", unreadCount > 0);
  promoRequestBell.setAttribute(
    "aria-label",
    unreadCount > 0
      ? `${unreadCount} unread promo request${unreadCount === 1 ? "" : "s"}`
      : "No unread promo requests"
  );
}

function openPromoRequestModal() {
  if (!promoRequestModal) return;

  promoRequestModal.classList.add("is-open");
  promoRequestModal.setAttribute("aria-hidden", "false");
  loadPromoRequests().catch(error => console.warn("Promo request modal refresh failed:", error));
}

function closePromoRequestModal() {
  if (!promoRequestModal) return;

  promoRequestModal.classList.remove("is-open");
  promoRequestModal.setAttribute("aria-hidden", "true");
}

function renderPromoRequestItem(item) {
  const status = item.status || "pending";
  const isRead = item.is_read === true;
  const readLabel = isRead ? "Read" : "Unread";
  const statusLabel = status === "done" ? "Done" : "Pending";
  const contact = item.requester_contact || "No contact provided";
  const note = item.note || "No note provided";

  return `
    <article class="promo-request-card ${isRead ? "is-read" : "is-unread"} ${status === "done" ? "is-done" : "is-pending"}">
      <div class="promo-request-card-top">
        <div>
          <strong>${escapeAdminHTML(item.piece_title || item.piece_slug)}</strong>
          <small>${escapeAdminHTML(formatAdminDate(item.created_at))}</small>
        </div>

        <div class="promo-request-badges">
          <span class="request-badge ${status === "done" ? "done" : "pending"}">${escapeAdminHTML(statusLabel)}</span>
          <span class="request-badge ${isRead ? "read" : "unread"}">${escapeAdminHTML(readLabel)}</span>
        </div>
      </div>

      <div class="promo-request-details">
        <p><span>Slug</span>${escapeAdminHTML(item.piece_slug || "")}</p>
        <p><span>Contact</span>${escapeAdminHTML(contact)}</p>
        <p><span>Note</span>${escapeAdminHTML(note)}</p>
      </div>

      <div class="promo-request-actions">
        <button class="tiny-btn" type="button" data-toggle-promo-request-read="${escapeAdminHTML(item.id)}" data-current-read="${isRead ? "true" : "false"}">
          ${isRead ? "Mark unread" : "Mark read"}
        </button>
        ${status === "pending" ? `<button class="tiny-btn primary-tiny" type="button" data-complete-promo-request="${escapeAdminHTML(item.id)}">Mark done</button>` : ""}
        <button class="tiny-btn danger" type="button" data-delete-promo-request="${escapeAdminHTML(item.id)}">Delete</button>
      </div>
    </article>
  `;
}

async function loadPromoRequests() {
  if (!promoRequestList) return;

  const { data, error } = await adminClient
    .from("promo_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    promoRequestList.innerHTML = `<div class="promo-request-empty">Promo requests could not be loaded.</div>`;
    throw error;
  }

  updatePromoRequestBell(data || []);

  promoRequestList.innerHTML = data && data.length
    ? data.map(renderPromoRequestItem).join("")
    : `<div class="promo-request-empty">No promo requests yet.</div>`;
}


async function loadPromos() {
  const { data, error } = await adminClient
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!data.length) {
    renderEmpty(promoList, "No promo codes yet.");
    return;
  }

  const targetMap = await loadTargets("promo_code_targets", "promo_code_id", data.map(item => item.id));

  promoList.innerHTML = data.map(item => {
    const targets = targetMap.get(String(item.id)) || [];
    const discountLabel = formatDiscount(item.discount_type, item.discount_value);
    const targetLabel = formatTargetSummary(targets);
    const depletedClass = isCodeDepleted(item) ? " is-depleted" : "";

    return `
      <article class="list-item code-list-item admin-code-card${depletedClass}">
        <div class="admin-code-top">
          <div class="admin-code-identity">
            <strong class="admin-code-title">${escapeAdminHTML(item.code)}</strong>
            <button class="tiny-btn copy-code-btn" type="button" data-copy-admin-code="${escapeAdminHTML(item.code)}">Copy</button>
          </div>

          <div class="admin-code-info-wrap">
            <button class="admin-code-info-btn" type="button" data-code-info-touch aria-expanded="false" aria-label="View promo details">i</button>
            <div class="admin-code-popover" role="note">
              <p><span>Discount</span><strong>${escapeAdminHTML(discountLabel)}</strong></p>
              <p><span>Applies to</span><strong>${escapeAdminHTML(targetLabel)}</strong></p>
              <p><span>Usage</span><strong>${escapeAdminHTML(formatUseStatus(item))}</strong></p>
            </div>
          </div>
        </div>

        ${renderCodeBadges(item)}

        <div class="item-actions code-actions admin-code-actions">
          <button class="tiny-btn" type="button" data-toggle-promo="${item.id}" data-current="${item.is_active}">
            ${item.is_active ? "Disable" : "Enable"}
          </button>
          <button class="tiny-btn danger" type="button" data-delete-promo="${item.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

async function loadUnlocks() {
  const { data, error } = await adminClient
    .from("unlock_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!data.length) {
    renderEmpty(unlockList, "No unlock codes yet.");
    return;
  }

  const targetMap = await loadTargets("unlock_code_targets", "unlock_code_id", data.map(item => item.id));

  unlockList.innerHTML = data.map(item => {
    const targetSlugs = item.piece_slug ? [item.piece_slug] : (targetMap.get(String(item.id)) || []);
    const targetLabel = formatTargetSummary(targetSlugs);
    const depletedClass = isCodeDepleted(item) ? " is-depleted" : "";

    return `
      <article class="list-item code-list-item admin-code-card${depletedClass}">
        <div class="admin-code-top">
          <div class="admin-code-identity">
            <strong class="admin-code-title">${escapeAdminHTML(item.code)}</strong>
            <button class="tiny-btn copy-code-btn" type="button" data-copy-admin-code="${escapeAdminHTML(item.code)}">Copy</button>
          </div>

          <div class="admin-code-info-wrap">
            <button class="admin-code-info-btn" type="button" data-code-info-touch aria-expanded="false" aria-label="View unlock details">i</button>
            <div class="admin-code-popover" role="note">
              <p><span>Unlocks</span><strong>${escapeAdminHTML(targetLabel)}</strong></p>
              <p><span>Usage</span><strong>${escapeAdminHTML(formatUseStatus(item))}</strong></p>
            </div>
          </div>
        </div>

        ${renderCodeBadges(item)}

        <div class="item-actions code-actions admin-code-actions">
          <button class="tiny-btn" type="button" data-toggle-unlock="${item.id}" data-current="${item.is_active}">
            ${item.is_active ? "Disable" : "Enable"}
          </button>
          <button class="tiny-btn danger" type="button" data-delete-unlock="${item.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}


function getPieceControlCounts() {
  return latestAdminPieces.reduce(
    (counts, item) => {
      const accessType = normalizeAdminAccess(item.access_type);
    const contentLabel = normalizeAdminContentLabel(item.content_label || item.type);
      counts.all += 1;
      counts[accessType] += 1;
      return counts;
    },
    { all: 0, paid: 0, free: 0 }
  );
}

function getPieceControlSearchText(item) {
  return [
    item.title,
    item.slug,
    item.category,
    item.type,
    item.content_label,
    formatAdminContentLabel(item.content_label || item.type),
    normalizeAdminAccess(item.access_type),
    item.is_enabled ? "visible enabled shown" : "hidden disabled"
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getPieceControlBaseFilteredPieces() {
  if (activePieceControlFilter === "paid") {
    return latestAdminPieces.filter(item => normalizeAdminAccess(item.access_type) === "paid");
  }

  if (activePieceControlFilter === "free") {
    return latestAdminPieces.filter(item => normalizeAdminAccess(item.access_type) === "free");
  }

  return latestAdminPieces;
}

function getFilteredAdminPieces() {
  const basePieces = getPieceControlBaseFilteredPieces();
  const searchTerm = String(activePieceControlSearch || "").trim().toLowerCase();

  if (!searchTerm) return basePieces;

  return basePieces.filter(item => getPieceControlSearchText(item).includes(searchTerm));
}

function updatePieceControlSearchSummary(visibleCount) {
  if (!pieceControlSearchSummary) return;

  const baseCount = getPieceControlBaseFilteredPieces().length;
  const searchTerm = String(activePieceControlSearch || "").trim();

  if (!baseCount) {
    pieceControlSearchSummary.textContent = "";
    return;
  }

  if (!searchTerm) {
    pieceControlSearchSummary.textContent = `Showing ${baseCount} piece${baseCount === 1 ? "" : "s"}.`;
    return;
  }

  pieceControlSearchSummary.textContent = `Showing ${visibleCount} of ${baseCount} piece${baseCount === 1 ? "" : "s"} for "${searchTerm}".`;
}

function updatePieceControlFilters() {
  if (!pieceControlFilters) return;

  const counts = getPieceControlCounts();

  pieceControlFilters.querySelectorAll("[data-piece-filter]").forEach(button => {
    const filter = button.dataset.pieceFilter || "all";
    const isActive = filter === activePieceControlFilter;

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  pieceControlFilters.querySelectorAll("[data-piece-count]").forEach(counter => {
    const key = counter.dataset.pieceCount || "all";
    counter.textContent = String(counts[key] || 0);
  });
}

function renderPieceSettingsList() {
  if (!pieceSettingsList) return;

  updatePieceControlFilters();

  const piecesToRender = getFilteredAdminPieces();
  updatePieceControlSearchSummary(piecesToRender.length);

  if (!piecesToRender.length) {
    const searchTerm = String(activePieceControlSearch || "").trim();
    const label = searchTerm
      ? `No pieces matched "${searchTerm}".`
      : activePieceControlFilter === "paid"
        ? "No paid pieces yet."
        : activePieceControlFilter === "free"
          ? "No free pieces yet."
          : "No pieces found.";

    renderEmpty(pieceSettingsList, label);
    return;
  }

  pieceSettingsList.innerHTML = piecesToRender.map(item => {
    const accessType = normalizeAdminAccess(item.access_type);
    const price = Number(item.price) || 49;
    const previewLimit = Number(item.preview_char_limit) || 700;
    const totalCharacters = Number(item.total_characters) || 0;

    return `
      <article class="list-item piece-control-item" data-piece-row="${escapeAdminHTML(item.slug)}">
        <div class="piece-control-main">
          <img class="piece-control-cover" src="${escapeAdminHTML(item.cover || "")}" alt="" loading="lazy" />

          <div class="piece-control-copy">
            <div class="piece-title-row">
              <strong>${escapeAdminHTML(item.title)}</strong>
              <span class="piece-status-pill ${item.is_enabled ? "is-visible" : "is-hidden"}">${item.is_enabled ? "Visible" : "Hidden"}</span>
            </div>

            <div class="piece-meta">
              <span>${escapeAdminHTML(item.category)}</span>
<span>${accessType === "paid" ? escapeAdminHTML(formatAdminPeso(price)) : "Free access"}</span>
              <span>Preview ${escapeAdminHTML(previewLimit)} chars</span>
              <span>Total ${escapeAdminHTML(formatCharacterCount(totalCharacters))} chars</span>
            </div>
          </div>
        </div>

        <div class="piece-control-fields">
          <label class="piece-field inline-check">
            <span>Status</span>
            <span class="switch-line">
              <input type="checkbox" data-piece-enabled ${item.is_enabled ? "checked" : ""} />
              Enabled
            </span>
          </label>            <label class="piece-field">
              <span>Label</span>
              <select data-piece-label>
                ${renderAdminContentLabelOptions(item.content_label || item.type)}
              </select>
            </label>



          <label class="piece-field">
            <span>Access</span>
            <select data-piece-access>
              <option value="free" ${accessType === "free" ? "selected" : ""}>Free</option>
              <option value="paid" ${accessType === "paid" ? "selected" : ""}>Paid</option>
            </select>
          </label>

          <label class="piece-field">
            <span>Price</span>
            <input
              data-piece-price
              type="number"
              min="0"
              step="1"
              value="${escapeAdminHTML(price)}"
              ${accessType === "free" ? "disabled" : ""}
            />
          </label>

          <label class="piece-field">
            <span>Preview chars</span>
            <input data-piece-preview type="number" min="120" step="10" value="${escapeAdminHTML(previewLimit)}" />
          </label>

          <div class="item-actions piece-actions">
            <button class="tiny-btn primary-tiny" type="button" data-save-piece="${escapeAdminHTML(item.slug)}">Save changes</button>
            <button class="tiny-btn" type="button" data-generate-promo="${escapeAdminHTML(item.slug)}">Promo code</button>
            <button class="tiny-btn" type="button" data-generate-unlock="${escapeAdminHTML(item.slug)}">Unlock code</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadPieceSettings() {
  if (!pieceSettingsList) return;

  const { data, error } = await adminClient
    .from("piece_settings")
    .select("slug,title,category,type,is_enabled,access_type,price,preview_mode,preview_char_limit,updated_at,content_label")
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    renderEmpty(pieceSettingsList, "Piece settings are not ready yet. Run supabase/v16_piece_control.sql in Supabase SQL Editor, then refresh this dashboard.");
    return;
  }

  if (!data.length) {
    renderEmpty(pieceSettingsList, "No piece settings found. Run the V16 SQL seed first.");
    return;
  }

  const sourceMap = getPoemSourceMap();
  latestAdminPieces = data.map(item => ({
    ...item,
    ...(sourceMap.get(item.slug) || {}),
    ...item
  }));

  latestAdminPieces = await enrichPiecesWithCharacterCounts(latestAdminPieces);

  renderPiecePickers();

  renderPieceSettingsList();
}


async function loadPayments() {
  const { data, error } = await adminClient
    .from("payment_methods")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;

  if (!data.length) {
    renderEmpty(paymentList, "No payment methods yet.");
    return;
  }

  paymentList.innerHTML = data.map(item => `
    <article class="list-item">
      <div>
        <strong>${escapeAdminHTML(item.name)}</strong>
        <small>${escapeAdminHTML(item.display_detail)} &bull; ${item.is_active ? "Visible" : "Hidden"}</small>
      </div>
      <div class="item-actions">
        <button class="tiny-btn" type="button" data-toggle-payment="${item.id}" data-current="${item.is_active}">
          ${item.is_active ? "Hide" : "Show"}
        </button>
      </div>
    </article>
  `).join("");
}

/* V2.0Q.1 admin standalone dashboard loading */
function getAdminDashboardLoadTasks() {
  const tasks = [];

  if (promoList) {
    tasks.push(loadPromos());
  }

  if (unlockList) {
    tasks.push(loadUnlocks());
  }

  if (paymentList) {
    tasks.push(loadPayments());
  }

  if (pieceSettingsList) {
    tasks.push(loadPieceSettings());
  }

  return tasks;
}

window.loadAdminDashboard = async function loadAdminDashboard() {
  try {
    const pageType = document.body?.dataset?.adminPage || "dashboard";
    const tasks = getAdminDashboardLoadTasks();

    setDashboardMessage("Loading dashboard...", "");

    if (!tasks.length) {
      setDashboardMessage("Private space ready.", "success");
      return;
    }

    await Promise.all(tasks);

    if (pageType === "piece-control") {
      setDashboardMessage("Piece control loaded.", "success");
      return;
    }

    if (pageType === "payment-methods") {
      setDashboardMessage("Payment methods loaded.", "success");
      return;
    }

    setDashboardMessage("Dashboard loaded.", "success");
  } catch (error) {
    setDashboardMessage(error.message || "Could not load dashboard.", "error");
  }
};




/* V2.0B Pieces Control search */
if (pieceControlSearchInput) {
  pieceControlSearchInput.addEventListener("input", () => {
    activePieceControlSearch = pieceControlSearchInput.value || "";
    renderPieceSettingsList();
  });
}

document.addEventListener("change", event => {
  const pieceTarget = event.target.closest("[data-piece-target]");
  if (pieceTarget) {
    const picker = pieceTarget.closest("[data-picker]");
    enforcePickerLimit(picker);
    return;
  }

  const accessSelect = event.target.closest("[data-piece-access]");
  if (!accessSelect) return;

  const row = accessSelect.closest("[data-piece-row]");
  if (!row) return;

  const priceInput = row.querySelector("[data-piece-price]");
  if (!priceInput) return;

  const isFree = normalizeAdminAccess(accessSelect.value) === "free";
  priceInput.disabled = isFree;

  if (!isFree && (!Number(priceInput.value) || Number(priceInput.value) <= 0)) {
    priceInput.value = "49";
  }

  row.dataset.pieceAccessChangeBound = "true";
});


function getAdminCodeLabelFromButton(button, fallbackLabel = "selected code") {
  const card = button ? button.closest(".admin-code-card") : null;
  const title = card ? card.querySelector(".admin-code-title") : null;
  const codeLabel = title ? String(title.textContent || "").trim() : "";

  return codeLabel || fallbackLabel;
}

const DELETE_CONFIRMATION_WORD = "DELETE";
let dangerousDeleteModalElements = null;
let dangerousDeleteModalState = null;
let pendingDangerousDeleteResolver = null;

function ensureDangerousDeleteModalElements() {
  if (dangerousDeleteModalElements) return dangerousDeleteModalElements;

  let modal = document.querySelector("#dangerousDeleteModal");

  if (!modal && document.body) {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="admin-modal-overlay dangerous-delete-modal" id="dangerousDeleteModal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="dangerousDeleteModalTitle">
        <section class="admin-modal-card dangerous-delete-modal-card" role="document">
          <button class="admin-modal-close" id="closeDangerousDeleteModal" type="button" aria-label="Close delete confirmation">×</button>
          <div class="admin-modal-header dangerous-delete-header">
            <span class="dangerous-delete-kicker">Careful action</span>
            <h2 id="dangerousDeleteModalTitle">Confirm delete</h2>
            <p class="modal-help" id="dangerousDeleteModalMessage">This action cannot be undone.</p>
          </div>
          <div class="dangerous-delete-target">
            <span id="dangerousDeleteTargetLabel">Selected item</span>
            <strong id="dangerousDeleteTargetValue">—</strong>
          </div>
          <label class="dangerous-delete-confirm-label" id="dangerousDeleteConfirmWrap">
            <span>Type DELETE to confirm</span>
            <input id="dangerousDeleteConfirmInput" type="text" autocomplete="off" spellcheck="false" inputmode="text">
          </label>
          <p class="dangerous-delete-error" id="dangerousDeleteError" role="alert"></p>
          <div class="dangerous-delete-actions">
            <button class="tiny-btn" id="cancelDangerousDeleteModal" type="button">Cancel</button>
            <button class="tiny-btn danger" id="confirmDangerousDeleteModal" type="button">Delete</button>
          </div>
        </section>
      </div>
    `);
    modal = document.querySelector("#dangerousDeleteModal");
  }

  if (!modal) return null;

  dangerousDeleteModalElements = {
    modal,
    title: modal.querySelector("#dangerousDeleteModalTitle"),
    message: modal.querySelector("#dangerousDeleteModalMessage"),
    targetLabel: modal.querySelector("#dangerousDeleteTargetLabel"),
    targetValue: modal.querySelector("#dangerousDeleteTargetValue"),
    inputWrap: modal.querySelector("#dangerousDeleteConfirmWrap"),
    input: modal.querySelector("#dangerousDeleteConfirmInput"),
    error: modal.querySelector("#dangerousDeleteError"),
    cancelButton: modal.querySelector("#cancelDangerousDeleteModal"),
    closeButton: modal.querySelector("#closeDangerousDeleteModal"),
    confirmButton: modal.querySelector("#confirmDangerousDeleteModal")
  };

  const cancelDelete = () => closeDangerousDeleteModal(false);

  dangerousDeleteModalElements.cancelButton?.addEventListener("click", cancelDelete);
  dangerousDeleteModalElements.closeButton?.addEventListener("click", cancelDelete);
  dangerousDeleteModalElements.confirmButton?.addEventListener("click", submitDangerousDeleteModal);
  dangerousDeleteModalElements.input?.addEventListener("input", () => {
    if (dangerousDeleteModalElements?.error) dangerousDeleteModalElements.error.textContent = "";
  });

  modal.addEventListener("click", event => {
    if (event.target === modal) closeDangerousDeleteModal(false);
  });

  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeDangerousDeleteModal(false);
      return;
    }

    if (event.key === "Enter" && event.target === dangerousDeleteModalElements?.input) {
      event.preventDefault();
      submitDangerousDeleteModal();
    }
  });

  return dangerousDeleteModalElements;
}

function closeDangerousDeleteModal(result = false) {
  const elements = ensureDangerousDeleteModalElements();

  if (elements) {
    elements.modal.classList.remove("is-open");
    elements.modal.setAttribute("aria-hidden", "true");
    if (elements.error) elements.error.textContent = "";
    if (elements.input) elements.input.value = "";
  }

  dangerousDeleteModalState = null;

  if (pendingDangerousDeleteResolver) {
    const resolve = pendingDangerousDeleteResolver;
    pendingDangerousDeleteResolver = null;
    resolve(result === true);
  }
}

function submitDangerousDeleteModal() {
  const elements = ensureDangerousDeleteModalElements();
  if (!elements || !pendingDangerousDeleteResolver) return;

  if (dangerousDeleteModalState?.requireTypedDelete) {
    const typed = String(elements.input?.value || "").trim();

    if (typed !== DELETE_CONFIRMATION_WORD) {
      if (elements.error) elements.error.textContent = "Type DELETE exactly to continue.";
      elements.input?.focus();
      return;
    }
  }

  closeDangerousDeleteModal(true);
}

function openDangerousDeleteModal(options = {}) {
  const elements = ensureDangerousDeleteModalElements();

  if (!elements) {
    setDashboardMessage("Delete confirmation modal is unavailable.", "error");
    return Promise.resolve(false);
  }

  if (pendingDangerousDeleteResolver) closeDangerousDeleteModal(false);

  dangerousDeleteModalState = {
    requireTypedDelete: options.requireTypedDelete === true
  };

  if (elements.title) elements.title.textContent = options.title || "Confirm delete";
  if (elements.message) elements.message.textContent = options.message || "This action cannot be undone.";
  if (elements.targetLabel) elements.targetLabel.textContent = options.targetLabel || "Selected item";
  if (elements.targetValue) elements.targetValue.textContent = options.targetValue || "—";
  if (elements.confirmButton) elements.confirmButton.textContent = options.confirmText || "Delete";
  if (elements.error) elements.error.textContent = "";

  if (elements.inputWrap) elements.inputWrap.hidden = !dangerousDeleteModalState.requireTypedDelete;

  if (elements.input) {
    elements.input.value = "";
    elements.input.required = dangerousDeleteModalState.requireTypedDelete;
  }

  elements.modal.classList.add("is-open");
  elements.modal.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    if (dangerousDeleteModalState?.requireTypedDelete) {
      elements.input?.focus();
      return;
    }

    elements.cancelButton?.focus();
  }, 0);

  return new Promise(resolve => {
    pendingDangerousDeleteResolver = resolve;
  });
}

function confirmDangerousCodeDelete(kind, codeLabel) {
  const isPromo = kind === "promo";
  const typeLabel = isPromo ? "promo code" : "unlock code";

  return openDangerousDeleteModal({
    title: `Delete this ${typeLabel}?`,
    message: "This cannot be undone. If this code was already used, deleting it may remove your admin reference for that code.",
    targetLabel: "Code",
    targetValue: codeLabel,
    requireTypedDelete: true,
    confirmText: isPromo ? "Delete promo" : "Delete unlock"
  });
}

function confirmPromoRequestDelete() {
  return openDangerousDeleteModal({
    title: "Delete this promo request?",
    message: "This removes the promo request from your admin list. This cannot be undone.",
    targetLabel: "Request",
    targetValue: "Selected promo request",
    requireTypedDelete: false,
    confirmText: "Delete request"
  });
}


document.addEventListener("click", async event => {
  const copyAdminCode = event.target.closest("[data-copy-admin-code]");
  const pieceFilter = event.target.closest("[data-piece-filter]");
  const promoToggle = event.target.closest("[data-toggle-promo]");
  const promoDelete = event.target.closest("[data-delete-promo]");
  const unlockToggle = event.target.closest("[data-toggle-unlock]");
  const unlockDelete = event.target.closest("[data-delete-unlock]");
  const paymentToggle = event.target.closest("[data-toggle-payment]");
  const pieceSave = event.target.closest("[data-save-piece]");
  const promoGenerate = event.target.closest("[data-generate-promo]");
  const unlockGenerate = event.target.closest("[data-generate-unlock]");
  const togglePromoRequestRead = event.target.closest("[data-toggle-promo-request-read]");
  const completePromoRequest = event.target.closest("[data-complete-promo-request]");
  const deletePromoRequest = event.target.closest("[data-delete-promo-request]");

  try {
    if (copyAdminCode) {
      await copyAdminText(copyAdminCode.dataset.copyAdminCode || "");
      setDashboardMessage("Code copied.", "success");
      return;
    }

    if (pieceFilter) {
      activePieceControlFilter = pieceFilter.dataset.pieceFilter || "all";
      renderPieceSettingsList();
      return;
    }

    if (promoToggle) {
      const nextValue = promoToggle.dataset.current !== "true";
      const { error } = await adminClient.from("promo_codes").update({ is_active: nextValue }).eq("id", promoToggle.dataset.togglePromo);
      if (error) throw error;
      await loadPromos();
      setDashboardMessage("Promo updated.", "success");
    }

    if (promoDelete) {
      const codeLabel = getAdminCodeLabelFromButton(promoDelete, "selected promo code");
      const confirmed = await confirmDangerousCodeDelete("promo", codeLabel);

      if (!confirmed) {
        setDashboardMessage("Promo delete cancelled.");
        return;
      }

      const { error } = await adminClient.from("promo_codes").delete().eq("id", promoDelete.dataset.deletePromo);
      if (error) throw error;
      await loadPromos();
      setDashboardMessage("Promo deleted.", "success");
      return;
    }

    if (unlockToggle) {
      const nextValue = unlockToggle.dataset.current !== "true";
      const { error } = await adminClient.from("unlock_codes").update({ is_active: nextValue }).eq("id", unlockToggle.dataset.toggleUnlock);
      if (error) throw error;
      await loadUnlocks();
      setDashboardMessage("Unlock updated.", "success");
    }

    if (unlockDelete) {
      const codeLabel = getAdminCodeLabelFromButton(unlockDelete, "selected unlock code");
      const confirmed = await confirmDangerousCodeDelete("unlock", codeLabel);

      if (!confirmed) {
        setDashboardMessage("Unlock delete cancelled.");
        return;
      }

      const { error } = await adminClient.from("unlock_codes").delete().eq("id", unlockDelete.dataset.deleteUnlock);
      if (error) throw error;
      await loadUnlocks();
      setDashboardMessage("Unlock deleted.", "success");
      return;
    }


    if (togglePromoRequestRead) {
      const requestId = togglePromoRequestRead.dataset.togglePromoRequestRead;
      const currentRead = togglePromoRequestRead.dataset.currentRead === "true";
      const nextRead = !currentRead;

      const { error } = await adminClient
        .from("promo_requests")
        .update({ is_read: nextRead })
        .eq("id", requestId);

      if (error) throw error;

      await loadPromoRequests();
      setDashboardMessage(nextRead ? "Promo request marked read." : "Promo request marked unread.", "success");
      return;
    }

    if (completePromoRequest) {
      const requestId = completePromoRequest.dataset.completePromoRequest;

      const { error } = await adminClient
        .from("promo_requests")
        .update({ status: "done", is_read: true })
        .eq("id", requestId);

      if (error) throw error;

      await loadPromoRequests();
      setDashboardMessage("Promo request marked done.", "success");
      return;
    }

    if (deletePromoRequest) {
      const requestId = deletePromoRequest.dataset.deletePromoRequest;
      const confirmed = await confirmPromoRequestDelete();

      if (!confirmed) {
        setDashboardMessage("Promo request delete cancelled.");
        return;
      }

      const { error } = await adminClient
        .from("promo_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;

      await loadPromoRequests();
      setDashboardMessage("Promo request deleted.", "success");
      return;
    }

    if (pieceSave) {
      const row = pieceSave.closest("[data-piece-row]");
      const slug = pieceSave.dataset.savePiece;
      const accessType = normalizeAdminAccess(row.querySelector("[data-piece-access]").value);
      const contentLabel = normalizeAdminContentLabel(row.querySelector("[data-piece-label]")?.value);
      const rawPrice = Number(row.querySelector("[data-piece-price]").value);
      const previewLimit = Number(row.querySelector("[data-piece-preview]").value) || 700;
      const isEnabled = row.querySelector("[data-piece-enabled]").checked;

      const payload = {
        is_enabled: isEnabled,
        content_label: contentLabel,
        access_type: accessType,
        price: accessType === "paid" ? (Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 49) : null,
        preview_char_limit: Math.max(120, previewLimit)
      };

      const { error } = await adminClient
        .from("piece_settings")
        .update(payload)
        .eq("slug", slug);

      if (error) throw error;

      await loadPieceSettings();
      setDashboardMessage("Piece settings saved.", "success");
    }


    if (promoGenerate) {
      const slug = promoGenerate.dataset.generatePromo;
      const piece = latestAdminPieces.find(item => item.slug === slug) || { slug, title: slug };
      const promoDetails = await openCodeCreationModal("promo", piece);

      if (!promoDetails) return;

      const code = promoDetails.code || makePromoCode(slug);

      const { data, error } = await adminClient
        .from("promo_codes")
        .insert({
          code,
          discount_type: promoDetails.discountType,
          discount_value: promoDetails.discountValue,
          max_uses: promoDetails.maxUses,
          used_count: 0,
          is_active: true,
          applies_to_all: false
        })
        .select("id,code")
        .single();

      if (error) throw error;

      const { error: targetError } = await adminClient
        .from("promo_code_targets")
        .insert({
          promo_code_id: String(data.id),
          piece_slug: slug
        });

      if (targetError) throw targetError;

      await loadPromos();
      loadPromoRequests();
      setDashboardMessage(`Promo code generated: ${code} - ${promoDetails.maxUses} use/s`, "success");
      return;
    }

    if (unlockGenerate) {
      const slug = unlockGenerate.dataset.generateUnlock;
      const piece = latestAdminPieces.find(item => item.slug === slug) || { slug, title: slug };
      const unlockDetails = await openCodeCreationModal("unlock", piece);

      if (!unlockDetails) return;

      const code = unlockDetails.code || makeUnlockCode(slug);

      const { error } = await adminClient
        .from("unlock_codes")
        .insert({
          code,
          piece_slug: slug,
          max_uses: unlockDetails.maxUses,
          is_active: true
        });

      if (error) throw error;

      await loadUnlocks();
      setDashboardMessage(`Unlock code generated: ${code} - ${unlockDetails.maxUses} use/s`, "success");
      return;
    }

    if (paymentToggle) {
      const nextValue = paymentToggle.dataset.current !== "true";
      const { error } = await adminClient.from("payment_methods").update({ is_active: nextValue }).eq("id", paymentToggle.dataset.togglePayment);
      if (error) throw error;
      await loadPayments();
      setDashboardMessage("Payment method updated.", "success");
    }
  } catch (error) {
    setDashboardMessage(error.message || "Action failed.", "error");
  }
});


if (promoRequestBell) {
  promoRequestBell.addEventListener("click", openPromoRequestModal);
}

if (!window.safePromoRequestPollStarted) {
  window.safePromoRequestPollStarted = true;

  window.setInterval(() => {
    if (document.visibilityState === "hidden") return;
    loadPromoRequests().catch(error => console.warn("Promo request poll failed:", error));
  }, 60000);
}

if (closeCodeCreationModalBtn) {
  closeCodeCreationModalBtn.addEventListener("click", () => closeCodeCreationModal(null));
}

if (cancelCodeCreationModalBtn) {
  cancelCodeCreationModalBtn.addEventListener("click", () => closeCodeCreationModal(null));
}

if (codeCreationForm) {
  codeCreationForm.addEventListener("submit", submitCodeCreationModal);
}

[codeCreationDiscountTypeInput, codeCreationDiscountValueInput, codeCreationMaxUsesInput, codeCreationCustomCodeInput]
  .filter(Boolean)
  .forEach(input => {
    input.addEventListener("input", updateCodeCreationModalSummary);
    input.addEventListener("change", updateCodeCreationModalSummary);
  });

if (closePromoRequestModalBtn) {
  closePromoRequestModalBtn.addEventListener("click", closePromoRequestModal);
}

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;

  if (dangerousDeleteModalElements?.modal?.classList.contains("is-open")) {
    closeDangerousDeleteModal(false);
    return;
  }

  if (codeCreationModal?.classList.contains("is-open")) {
    closeCodeCreationModal(null);
    return;
  }

  if (promoRequestModal?.classList.contains("is-open")) {
    closePromoRequestModal();
  }
});

setupPromoRequestBellBadgeWatcher();


function closeAdminCodeInfoPopovers() {
  document.querySelectorAll(".admin-code-card.is-touch-peeking").forEach(card => {
    card.classList.remove("is-touch-peeking");
  });
}

document.addEventListener("pointerdown", event => {
  const infoButton = event.target.closest("[data-code-info-touch]");
  if (!infoButton) return;

  if (event.pointerType === "mouse") return;

  const card = infoButton.closest(".admin-code-card");
  if (!card) return;

  closeAdminCodeInfoPopovers();
  card.classList.add("is-touch-peeking");
});

document.addEventListener("pointerup", closeAdminCodeInfoPopovers);
document.addEventListener("pointercancel", closeAdminCodeInfoPopovers);
document.addEventListener("scroll", closeAdminCodeInfoPopovers, true);

document.addEventListener("contextmenu", event => {
  if (event.target.closest("[data-code-info-touch]")) {
    event.preventDefault();
  }
});

setupAdminControlBarGate();


/* V18T copy button feedback */
(function setupSafeCopyButtonFeedback() {
  if (window.__safeCopyButtonFeedbackBound) return;
  window.__safeCopyButtonFeedbackBound = true;

  const timers = new WeakMap();

  function getCopyValue(button) {
    const dataKeys = [
      "copyAdminCode",
      "copyCode",
      "copyPromoCode",
      "copyUnlockCode",
      "copyValue",
      "copy"
    ];

    for (const key of dataKeys) {
      if (button.dataset && button.dataset[key]) {
        return button.dataset[key];
      }
    }

    const card = button.closest(".admin-code-card, .code-list-item, .promo-code-card, .promo-card, .public-promo-card");
    const codeText = card?.querySelector(".admin-code-title, [data-code-value], code, strong");

    return codeText?.textContent?.trim() || "";
  }

  async function copyValue(value) {
    if (!value) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    } catch (error) {
      // Feedback still appears even if the browser blocks clipboard access.
    }
  }

  function showCopied(button) {
    if (!button) return;

    const originalText = button.dataset.copyFeedbackOriginalText || button.textContent.trim() || "Copy";
    const originalAria = button.dataset.copyFeedbackOriginalAria || button.getAttribute("aria-label") || "";

    button.dataset.copyFeedbackOriginalText = originalText;
    button.dataset.copyFeedbackOriginalAria = originalAria;

    button.textContent = "Copied";
    button.classList.add("is-copied");
    button.setAttribute("aria-label", "Copied");

    const oldTimer = timers.get(button);
    if (oldTimer) clearTimeout(oldTimer);

    const timer = window.setTimeout(() => {
      button.textContent = button.dataset.copyFeedbackOriginalText || originalText;
      button.classList.remove("is-copied");

      const savedAria = button.dataset.copyFeedbackOriginalAria || "";
      if (savedAria) {
        button.setAttribute("aria-label", savedAria);
      } else {
        button.removeAttribute("aria-label");
      }

      timers.delete(button);
    }, 1200);

    timers.set(button, timer);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest(`
      [data-copy-admin-code],
      [data-copy-code],
      [data-copy-promo-code],
      [data-copy-unlock-code],
      [data-copy-value],
      [data-copy],
      .copy-code-btn
    `);

    if (!button) return;

    const value = getCopyValue(button);
    copyValue(value);

    window.setTimeout(() => {
      showCopied(button);
    }, 0);
  }, true);
})();


setupPrivateAnalyticsCard();

/* V2.0F.1 private floating controls */
(function setupPrivateFloatingControls() {
  if (window.__safePrivateFloatingControlsBound) return;
  window.__safePrivateFloatingControlsBound = true;

  function bindPrivateFloatingControls() {
    const scrollTopBtn = document.querySelector("#adminScrollTopBtn");
    const publicSpaceFloat = document.querySelector(".public-space-float");
    const dashboardView = document.querySelector("#dashboardView");

    if (!scrollTopBtn) return;

    function isDashboardVisible() {
      return !dashboardView || !dashboardView.classList.contains("hidden");
    }

    function togglePrivateFloatingControls() {
      const shouldShowScrollTop = isDashboardVisible() && window.scrollY > 420;

      scrollTopBtn.classList.toggle("visible", shouldShowScrollTop);
      scrollTopBtn.setAttribute("aria-hidden", shouldShowScrollTop ? "false" : "true");

      if (publicSpaceFloat) {
        publicSpaceFloat.classList.toggle("is-stacked-over-scroll", shouldShowScrollTop);
      }
    }

    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });

    window.addEventListener("scroll", togglePrivateFloatingControls, { passive: true });
    window.addEventListener("resize", togglePrivateFloatingControls);

    if (dashboardView && "MutationObserver" in window) {
      const observer = new MutationObserver(togglePrivateFloatingControls);
      observer.observe(dashboardView, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }

    togglePrivateFloatingControls();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindPrivateFloatingControls);
  } else {
    bindPrivateFloatingControls();
  }
})();
/* V2.0F.1 private floating controls END */


/* V2.0Q admin hamburger menu */
(function setupAdminHamburgerMenu() {
  if (window.__safeAdminHamburgerMenuBound) return;
  window.__safeAdminHamburgerMenuBound = true;

  const toggle = document.querySelector("#adminMenuToggle");
  const panel = document.querySelector("#adminMenuPanel");

  if (!toggle || !panel) return;

  function setMenuOpen(isOpen) {
    panel.hidden = !isOpen;
    toggle.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    toggle.setAttribute("aria-label", isOpen ? "Close admin menu" : "Open admin menu");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  toggle.addEventListener("click", event => {
    event.stopPropagation();
    setMenuOpen(panel.hidden);
  });

  panel.addEventListener("click", event => {
    const jumpButton = event.target.closest("[data-admin-menu-jump]");
    const siteLink = event.target.closest("a");
    const logoutButton = event.target.closest("#logoutBtn");

    if (jumpButton) {
      const selector = jumpButton.dataset.adminMenuJump || "";
      const target = document.querySelector(selector);

      closeMenu();

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        target.classList.add("admin-section-highlight");
        window.setTimeout(() => {
          target.classList.remove("admin-section-highlight");
        }, 1300);
      }
    }

    if (siteLink || logoutButton) {
      closeMenu();
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".admin-menu-wrap")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.addEventListener("resize", closeMenu);
})();
/* V2.0Q admin hamburger menu END */
