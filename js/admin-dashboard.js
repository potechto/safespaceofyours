const dashboardMessage = document.querySelector("#dashboardMessage");
const promoForm = document.querySelector("#promoForm");
const unlockForm = document.querySelector("#unlockForm");
const promoList = document.querySelector("#promoList");
const unlockList = document.querySelector("#unlockList");
const paymentList = document.querySelector("#paymentList");
const pieceSettingsList = document.querySelector("#pieceSettingsList");
const pieceControlFilters = document.querySelector("#pieceControlFilters");
const promoRequestList = document.querySelector("#promoRequestList");


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
const promoPiecePicker = document.querySelector("#promoPiecePicker");
const unlockPiecePicker = document.querySelector("#unlockPiecePicker");

let latestAdminPieces = [];
let activePieceControlFilter = "all";
let pieceCharacterCountCache = new Map();

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

function promptPromoDetails(pieceTitle) {
  const typeAnswer = window.prompt(
    `Generate promo for "${pieceTitle}"\n\nType P for percent discount or F for fixed peso discount.`,
    "P"
  );

  if (typeAnswer === null) return null;

  const normalizedType = typeAnswer.trim().toLowerCase();
  const discountType = normalizedType.startsWith("f") ? "fixed" : "percent";

  const valueAnswer = window.prompt(
    discountType === "percent"
      ? "Enter percent discount value. Example: 10 means 10% off."
      : "Enter fixed peso discount value. Example: 10 means PHP 10 off.",
    "10"
  );

  if (valueAnswer === null) return null;

  const discountValue = Number(valueAnswer);

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    setDashboardMessage("Promo discount value must be greater than 0.", "error");
    return null;
  }

  const maxUsesAnswer = window.prompt(
    "How many times can this promo code be used? Example: 1 for one buyer, 5 for five uses.",
    "1"
  );

  if (maxUsesAnswer === null) return null;

  const maxUses = Math.max(1, Math.floor(Number(maxUsesAnswer) || 1));

  const codeAnswer = window.prompt("Optional: type promo code, or leave blank to auto-generate.", "");

  if (codeAnswer === null) return null;

  return {
    code: codeAnswer.trim().toUpperCase(),
    discountType,
    discountValue,
    maxUses
  };
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

    return `
      <article class="list-item code-list-item admin-code-card">
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

    return `
      <article class="list-item code-list-item admin-code-card">
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

function getFilteredAdminPieces() {
  if (activePieceControlFilter === "paid") {
    return latestAdminPieces.filter(item => normalizeAdminAccess(item.access_type) === "paid");
  }

  if (activePieceControlFilter === "free") {
    return latestAdminPieces.filter(item => normalizeAdminAccess(item.access_type) === "free");
  }

  return latestAdminPieces;
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

  if (!piecesToRender.length) {
    const label = activePieceControlFilter === "paid"
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

window.loadAdminDashboard = async function loadAdminDashboard() {
  try {
    setDashboardMessage("Loading dashboard...", "");
    await Promise.all([loadPromos(), loadUnlocks(), loadPayments(), loadPieceSettings()]);
    setDashboardMessage("Dashboard loaded.", "success");
  } catch (error) {
    setDashboardMessage(error.message || "Could not load dashboard.", "error");
  }
};



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
      const { error } = await adminClient.from("promo_codes").delete().eq("id", promoDelete.dataset.deletePromo);
      if (error) throw error;
      await loadPromos();
      setDashboardMessage("Promo deleted.", "success");
    }

    if (unlockToggle) {
      const nextValue = unlockToggle.dataset.current !== "true";
      const { error } = await adminClient.from("unlock_codes").update({ is_active: nextValue }).eq("id", unlockToggle.dataset.toggleUnlock);
      if (error) throw error;
      await loadUnlocks();
      setDashboardMessage("Unlock updated.", "success");
    }

    if (unlockDelete) {
      const { error } = await adminClient.from("unlock_codes").delete().eq("id", unlockDelete.dataset.deleteUnlock);
      if (error) throw error;
      await loadUnlocks();
      setDashboardMessage("Unlock deleted.", "success");
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
      const confirmed = window.confirm("Delete this promo request?");

      if (!confirmed) return;

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
      const promoDetails = promptPromoDetails(piece.title || slug);

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
    }

    if (unlockGenerate) {
      const slug = unlockGenerate.dataset.generateUnlock;
      const code = makeUnlockCode(slug);

      const { error } = await adminClient
        .from("unlock_codes")
        .insert({
          code,
          piece_slug: slug,
          max_uses: 1,
          is_active: true
        });

      if (error) throw error;

      await loadUnlocks();
      setDashboardMessage(`Unlock code generated: ${code}`, "success");
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

if (closePromoRequestModalBtn) {
  closePromoRequestModalBtn.addEventListener("click", closePromoRequestModal);
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && promoRequestModal?.classList.contains("is-open")) {
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
