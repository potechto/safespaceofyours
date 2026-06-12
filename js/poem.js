const year = document.querySelector("#year");
const readerCover = document.querySelector("#readerCover");
const readerCategory = document.querySelector("#readerCategory");
const readerTitle = document.querySelector("#readerTitle");
const readerExcerpt = document.querySelector("#readerExcerpt");
const poemText = document.querySelector("#poemText");

const prevPoem = document.querySelector("#prevPoem");
const nextPoem = document.querySelector("#nextPoem");
const randomPoem = document.querySelector("#randomPoem");

const UNLOCKED_PIECES_STORAGE_KEY = "@safespaceofyours.unlockedPieces.v1";
const PIECE_ANALYTICS_VISITOR_KEY = "@safespaceofyours.analyticsVisitor.v1";

if (year) {
  year.textContent = new Date().getFullYear();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPoem(text) {
  const cleanText = text.trim();

  if (!cleanText) {
    return `
      <p class="reserved-piece">
        This piece is reserved for now. Add the poem text inside its matching text file when ready.
      </p>
    `;
  }

  return cleanText
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      return trimmed ? `<p>${escapeHTML(trimmed)}</p>` : `<br />`;
    })
    .join("");
}


function formatPeso(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "";
  if (window.SafePieceSettings) return window.SafePieceSettings.formatPeso(numericAmount);
  return `PHP ${numericAmount.toLocaleString("en-PH")}`;
}

function getPoemAccess(poem) {
  if (window.SafePieceSettings) return window.SafePieceSettings.normalizeAccess(poem.access_type || poem.access);
  return poem.access || "free";
}


function readUnlockedPieces() {
  try {
    const stored = window.localStorage.getItem(UNLOCKED_PIECES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function isPieceUnlocked(slug) {
  const unlockedPieces = readUnlockedPieces();
  return Boolean(unlockedPieces[slug]);
}

function savePieceUnlock(slug, code) {
  const unlockedPieces = readUnlockedPieces();

  unlockedPieces[slug] = {
    code: String(code || "").trim().toUpperCase(),
    unlockedAt: new Date().toISOString()
  };

  window.localStorage.setItem(UNLOCKED_PIECES_STORAGE_KEY, JSON.stringify(unlockedPieces));
}

function getSavedUnlockCode(slug) {
  const unlockedPieces = readUnlockedPieces();
  const saved = unlockedPieces[String(slug || "")];

  if (!saved || typeof saved !== "object") return "";

  return String(saved.code || "").trim().toUpperCase();
}

function countReaderCharacters(value) {
  return Array.from(String(value || "")).length;
}

function getProtectedReaderClient() {
  return window.safeAdminClient
    || window.safeSupabase
    || window.safeSupabaseClient
    || window.supabaseClient
    || null;
}

async function waitForProtectedReaderClient(maxWaitMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maxWaitMs) {
    const client = getProtectedReaderClient();

    if (client && typeof client.rpc === "function") {
      return client;
    }

    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  return null;
}

async function fetchPublicPieceTextForPreview(poem) {
  const file = String(poem?.file || "").trim();

  if (!file || !/^Resources\/.+\.txt$/i.test(file)) return "";

  try {
    const response = await fetch(file, { cache: "no-store" });

    if (!response.ok) return "";

    return response.text();
  } catch (error) {
    console.warn("Public preview fallback failed:", error);
    return "";
  }
}

async function fetchProtectedPieceText(poem, code = "") {
  if (!poem || !poem.slug) {
    return {
      ok: false,
      requires_unlock: true,
      unlocked: false,
      preview_text: "",
      message: "Missing piece details."
    };
  }

  const client = await waitForProtectedReaderClient();

  if (!client) {
    return {
      ok: false,
      requires_unlock: true,
      unlocked: false,
      preview_text: "",
      message: "Protected reader is still loading. Please refresh and try again."
    };
  }

  try {
    const { data, error } = await client.rpc("get_public_piece_text", {
      input_piece_slug: poem.slug,
      input_unlock_code: code || null
    });

    if (error) {
      return {
        ok: false,
        requires_unlock: true,
        unlocked: false,
        preview_text: "",
        message: error.message || "Protected piece could not be loaded."
      };
    }

    const result = data || {
      ok: false,
      requires_unlock: true,
      unlocked: false,
      preview_text: "",
      message: "Protected piece could not be loaded."
    };

    if (result.preview_text) {
      result.preview_text = getPreviewText(result.preview_text, poem.preview_char_limit);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      requires_unlock: true,
      unlocked: false,
      preview_text: "",
      message: error.message || "Protected piece could not be loaded."
    };
  }
}

function makePieceAnalyticsVisitorKey() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getPieceAnalyticsVisitorKey() {
  try {
    const existingKey = window.localStorage.getItem(PIECE_ANALYTICS_VISITOR_KEY);
    if (existingKey) return existingKey;

    const nextKey = makePieceAnalyticsVisitorKey();
    window.localStorage.setItem(PIECE_ANALYTICS_VISITOR_KEY, nextKey);
    return nextKey;
  } catch (error) {
    return makePieceAnalyticsVisitorKey();
  }
}

async function recordPieceAnalyticsEvent(poem, eventType, details = {}) {
  if (!poem || !poem.slug || !window.safeAdminClient) return;

  const visitorKey = getPieceAnalyticsVisitorKey();
  if (!visitorKey) return;

  try {
    await window.safeAdminClient.rpc("record_piece_analytics_event", {
      p_event_type: eventType,
      p_piece_slug: poem.slug,
      p_visitor_key: visitorKey,
      p_unlock_code_id: details.unlockCodeId || null,
      p_unlock_code_snapshot: details.unlockCodeSnapshot || null
    });
  } catch (error) {
    console.warn("Piece analytics event could not be recorded:", error);
  }
}

function queuePieceAnalyticsEvent(poem, eventType, details = {}) {
  const sendEvent = () => recordPieceAnalyticsEvent(poem, eventType, details);

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(sendEvent, { timeout: 2000 });
    return;
  }

  window.setTimeout(sendEvent, 0);
}

function buildUnlockedNotice() {
  return `
    <div class="unlock-success-notice">
      <p class="eyebrow">Full piece unlocked</p>
      <p>You can read the full piece on this browser/device.</p>
    </div>
  `;
}

function setUnlockMessage(form, message, type = "") {
  const target = form.querySelector("[data-unlock-message]");
  if (!target) return;

  target.textContent = message || "";
  target.classList.remove("success", "error");
  if (type) target.classList.add(type);
}

async function claimUnlockCode(poem, code) {
  if (!window.safeAdminClient) {
    return {
      ok: false,
      message: "Unlock service is not ready. Please refresh the page and try again."
    };
  }

  const { data, error } = await window.safeAdminClient.rpc("claim_unlock_code", {
    input_code: code,
    input_piece_slug: poem.slug
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Unlock code could not be checked."
    };
  }

  return data || {
    ok: false,
    message: "Unlock code could not be checked."
  };
}

function setupUnlockForm(poem) {
  const form = poemText.querySelector("[data-unlock-form]");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const input = form.querySelector("[data-unlock-code-input]");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (!code) {
      setUnlockMessage(form, "Enter the unlock code first.", "error");
      return;
    }

    const button = form.querySelector("button[type='submit']");
    if (button) button.disabled = true;
    setUnlockMessage(form, "Checking unlock code...", "");

    const result = await claimUnlockCode(poem, code);

    if (!result.ok) {
      if (button) button.disabled = false;
      setUnlockMessage(form, result.message || "Invalid unlock code.", "error");
      return;
    }

    const protectedResult = await fetchProtectedPieceText(poem, code);

    if (!protectedResult.ok || !protectedResult.full_text) {
      if (button) button.disabled = false;
      setUnlockMessage(form, protectedResult.message || "Code accepted, but protected text could not be loaded yet.", "error");
      return;
    }

    savePieceUnlock(poem.slug, code);
    queuePieceAnalyticsEvent(poem, "unlock", {
      unlockCodeSnapshot: code
    });
    poemText.innerHTML = buildUnlockedNotice() + formatPoem(protectedResult.full_text);
    window.scrollTo({ top: poemText.offsetTop - 120, behavior: "smooth" });
  });
}

function getPreviewText(text, limit) {
  const cleanText = String(text || "").trim();
  const safeLimit = Math.max(120, Number(limit) || 700);
  const characters = Array.from(cleanText);

  if (characters.length <= safeLimit) return cleanText;

  return `${characters.slice(0, safeLimit).join("").trim()}...`;
}

function buildPaidPreview(poem, fullText, options = {}) {
  const price = Number(poem.price) || 49;
  const previewText = getPreviewText(fullText, poem.preview_char_limit);
  const previewCount = countReaderCharacters(previewText.replace(/\.\.\.$/, ""));
  const previewLimit = Math.max(120, Number(poem.preview_char_limit) || 700);
  const statusMessage = String(options.message || "").trim();
  const previewHtml = previewText
    ? formatPoem(previewText)
    : `
      <p class="reserved-piece">
        ${escapeHTML(statusMessage || "Protected preview is not ready yet. Please refresh or check this piece in admin control.")}
      </p>
    `;

  return `
    <div class="paid-reader-shell">
      <div class="paid-preview-text" data-paid-preview-chars="${previewCount}" data-paid-preview-limit="${previewLimit}">
        ${previewHtml}
      </div>

      <div class="paid-reader-hero">
        <div>
          <p class="eyebrow">Preview only</p>
          <h2>Continue reading the full piece</h2>
          <p>
            You've reached the end of the preview. The full piece can be unlocked after manual payment confirmation.
          </p>
        </div>

        <div class="paid-reader-price-card">
          <span>Full access</span>
          <strong>${escapeHTML(formatPeso(price))}</strong>
        </div>
      </div>

      <div class="paid-reader-actions">
        <button class="reader-action-btn pay-to-view-btn" type="button" data-open-payment
          data-piece-title="${escapeHTML(poem.title || "")}"
          data-piece-slug="${escapeHTML(poem.slug || "")}"
          data-piece-price="${escapeHTML(String(price))}">
          Pay to View
        </button>

        <form class="unlock-form unlock-code-form" data-unlock-form>
          <label>
            Already have an unlock code?
            <input type="text" name="unlockCode" placeholder="Enter code" autocomplete="off" />
          </label>
          <button class="reader-action-btn ghost" type="submit">Unlock</button>
          <p class="unlock-message" data-unlock-message></p>
        </form>
      </div>
    </div>
  `;
}

async function getMergedReaderPoems() {
  if (!window.SafePieceSettings) return Array.isArray(window.POEMS) ? window.POEMS : [];

  const settings = await window.SafePieceSettings.loadSettings();
  if (!settings.length) return Array.isArray(window.POEMS) ? window.POEMS : [];

  return window.SafePieceSettings.mergePoemsWithSettings(window.POEMS, settings, { includeDisabled: true });
}

function getPoemUrl(slug) {
  return `poem.html?slug=${encodeURIComponent(slug)}`;
}

function setupReaderNavigation(currentIndex, poems = window.POEMS) {
  if (!prevPoem || !nextPoem || !randomPoem || !Array.isArray(poems) || !poems.length) return;

  const prevIndex = currentIndex === 0 ? poems.length - 1 : currentIndex - 1;
  const nextIndex = currentIndex === poems.length - 1 ? 0 : currentIndex + 1;

  const previous = poems[prevIndex];
  const next = poems[nextIndex];

  prevPoem.href = getPoemUrl(previous.slug);
  nextPoem.href = getPoemUrl(next.slug);

  prevPoem.setAttribute("title", previous.title);
  nextPoem.setAttribute("title", next.title);

  prevPoem.innerHTML = `<span>&larr; Previous</span><strong>${escapeHTML(previous.title)}</strong>`;
  nextPoem.innerHTML = `<span>Next &rarr;</span><strong>${escapeHTML(next.title)}</strong>`;

  randomPoem.addEventListener("click", () => {
    if (poems.length <= 1) return;

    let randomIndex = currentIndex;

    while (randomIndex === currentIndex) {
      randomIndex = Math.floor(Math.random() * poems.length);
    }

    window.location.href = getPoemUrl(poems[randomIndex].slug);
  });
}

function setupScrollTopButton() {
  const scrollTopBtn = document.querySelector("#scrollTopBtn");

  if (!scrollTopBtn) return;

  function toggleScrollTopButton() {
    const isVisible = window.scrollY > 420;
    scrollTopBtn.classList.toggle("visible", isVisible);
    document.body.classList.toggle("scroll-top-visible", isVisible);
  }

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  window.addEventListener("scroll", toggleScrollTopButton);
  toggleScrollTopButton();
}

async function loadPoem() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");

  const readerPoems = await getMergedReaderPoems();
  const enabledPoems = readerPoems.filter(item => item.is_enabled !== false);

  const poem = readerPoems.find(item => item.slug === slug);
  const currentIndex = enabledPoems.findIndex(item => item.slug === slug);

  if (!poem) {
    document.title = "Piece not found | @safespaceofyours";
    poemText.innerHTML = `
      <p class="reserved-piece">
        Piece not found. Please return to the archive and choose another poem.
      </p>
    `;

    if (prevPoem && nextPoem && randomPoem) {
      prevPoem.style.display = "none";
      nextPoem.style.display = "none";
      randomPoem.style.display = "none";
    }

    return;
  }

  if (poem.is_enabled === false) {
    document.title = "Piece unavailable | @safespaceofyours";
    readerCover.src = poem.cover;
    readerCover.alt = `${poem.title} cover`;
    readerCategory.textContent = poem.category;
    readerTitle.textContent = poem.title;
    readerExcerpt.textContent = "This piece is currently unavailable.";

    poemText.innerHTML = `
      <p class="reserved-piece">
        This piece is currently hidden from public viewing. Please return to the archive.
      </p>
    `;

    if (prevPoem && nextPoem && randomPoem) {
      prevPoem.style.display = "none";
      nextPoem.style.display = "none";
      randomPoem.style.display = "none";
    }

    return;
  }

  document.title = `${poem.title} | @safespaceofyours`;

  readerCover.src = poem.cover;
  readerCover.alt = `${poem.title} cover`;
  readerCategory.textContent = poem.category;
  readerTitle.textContent = poem.title;
  readerExcerpt.textContent = poem.excerpt;

  setupReaderNavigation(Math.max(currentIndex, 0), enabledPoems);

  const access = getPoemAccess(poem);
  queuePieceAnalyticsEvent(poem, "view");

  try {
    if (access === "paid") {
      const savedCode = getSavedUnlockCode(poem.slug);
      const protectedResult = await fetchProtectedPieceText(poem, savedCode);

      if (protectedResult.ok && protectedResult.unlocked && protectedResult.full_text) {
        poemText.innerHTML = buildUnlockedNotice() + formatPoem(protectedResult.full_text);
        return;
      }

      let paidPreviewText = protectedResult.preview_text || "";

      if (!paidPreviewText) {
        paidPreviewText = await fetchPublicPieceTextForPreview(poem);
      }

      poemText.innerHTML = buildPaidPreview(poem, paidPreviewText, {
        message: protectedResult.message
      });
      setupUnlockForm(poem);
      return;
    }

    const response = await fetch(poem.file);

    if (!response.ok) {
      throw new Error("Text file not found.");
    }

    const text = await response.text();
    poemText.innerHTML = formatPoem(text);
  } catch (error) {
    poemText.innerHTML = `
      <p class="reserved-piece">
        ${access === "paid"
          ? "Protected reader could not be loaded. Please refresh and try again."
          : `The text file for this piece could not be loaded. Check if this file exists: <strong>${escapeHTML(poem.file)}</strong>`}
      </p>
    `;
  }
}

setupScrollTopButton();
loadPoem();

function setupSmartScrollbars() {
  let scrollTimer;

  function showScrollbarsTemporarily() {
    document.body.classList.add("is-scrolling");

    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      document.body.classList.remove("is-scrolling");
    }, 850);
  }

  window.addEventListener("scroll", showScrollbarsTemporarily, { passive: true });
  document.addEventListener("scroll", showScrollbarsTemporarily, true);
  window.addEventListener("wheel", showScrollbarsTemporarily, { passive: true });
  window.addEventListener("touchmove", showScrollbarsTemporarily, { passive: true });
}

setupSmartScrollbars();


function syncReaderNavigationLayoutClasses() {
  const controls = Array.from(document.querySelectorAll("a, button"));
  const randomControl = controls.find(control => {
    return String(control.textContent || "").trim().toLowerCase().includes("random piece");
  });

  if (!randomControl || !randomControl.parentElement) return;

  const navWrap = randomControl.parentElement;
  navWrap.classList.add("reader-nav-mobile-row");
  randomControl.classList.add("reader-nav-random-control");

  Array.from(navWrap.children).forEach(child => {
    child.classList.add("reader-nav-mobile-item");
  });
}

function setupReaderNavigationLayoutWatcher() {
  syncReaderNavigationLayoutClasses();

  const observer = new MutationObserver(syncReaderNavigationLayoutClasses);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener("pageshow", syncReaderNavigationLayoutClasses);
  window.addEventListener("resize", syncReaderNavigationLayoutClasses);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupReaderNavigationLayoutWatcher);
} else {
  setupReaderNavigationLayoutWatcher();
}


/* V18S.10 clean paid reader payment modal */
(function setupCleanPaidReaderPaymentModal() {
  if (window.__safeCleanPaidReaderPaymentModalBound) return;
  window.__safeCleanPaidReaderPaymentModalBound = true;

  const FALLBACK_PAYMENT_METHODS = [
      {
            "name": "GCash",
            "details": "RA**H JO*N S. - 0976 *** 6958",
            "note": "Scan the QR first. Details are partially masked for privacy.",
            "image": "https://www.facebook.com/ralphjohn.santos.79"
      },
      {
            "name": "PayPal",
            "details": "ralphjohnsantos01@gmail.com",
            "note": "Use PHP when possible, then send proof after payment.",
            "image": "https://www.facebook.com/ralphjohn.santos.79"
      },
      {
            "name": "Maribank",
            "details": "RALPH JOHN SANTOS - **** 4853",
            "note": "Scan the QR first. Bank details are partially masked for privacy.",
            "image": "https://www.facebook.com/ralphjohn.santos.79"
      }
];

  let promoTimer = null;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    const amount = Number(value) || 0;
    return `PHP ${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
  }

  function getContext(trigger) {
    return {
      title: trigger.dataset.pieceTitle || "Premium piece unlock",
      price: Number(trigger.dataset.piecePrice || 49) || 49,
      slug: trigger.dataset.pieceSlug || ""
    };
  }

  function getClient() {
    const direct = [
      "safeSupabase",
      "safeSupabaseClient",
      "supabaseClient",
      "SAFE_SUPABASE_CLIENT",
      "safeSpaceSupabase"
    ];

    for (const key of direct) {
      if (window[key] && typeof window[key].from === "function") {
        return window[key];
      }
    }

    for (const key of Object.keys(window)) {
      try {
        if (window[key] && typeof window[key].from === "function") {
          return window[key];
        }
      } catch (error) {}
    }

    return null;
  }

  function cleanImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    return raw.replace(/^\.\//, "").replace(/^\//, "");
  }

  function closeModal() {
    document.querySelector("#paidReaderPaymentModal")?.remove();
    document.querySelector("[data-paid-reader-qr-preview]")?.remove();
    document.body.classList.remove("modal-open");
  }

  async function loadPaymentMethods() {
    try {
      const client = getClient();
      if (!client || typeof client.from !== "function") return FALLBACK_PAYMENT_METHODS;

      let response = await client
        .from("payment_methods")
        .select("*")
        .order("created_at", { ascending: true });

      if (response.error) {
        response = await client
          .from("payment_methods")
          .select("*");
      }

      const rows = Array.isArray(response.data) ? response.data : [];

      const visible = rows.filter(item =>
        item.is_visible !== false &&
        item.visible !== false &&
        item.is_active !== false
      );

      if (!visible.length) return FALLBACK_PAYMENT_METHODS;

      return visible.map(item => {
        const name =
          item.name ||
          item.method_name ||
          item.title ||
          item.bank_name ||
          item.bank ||
          item.wallet_name ||
          item.payment_method ||
          item.method_type ||
          "Payment method";

        const detailPairs = [
          ["Bank / Wallet", item.bank_name || item.bank || item.wallet_name || item.wallet],
          ["Account name", item.account_name || item.account_holder || item.account_owner || item.receiver_name],
          ["Account number", item.account_number || item.account_no || item.account || item.number],
          ["Email", item.email || item.account_email || item.paypal_email],
          ["Mobile number", item.mobile_number || item.phone_number || item.phone || item.contact_number],
          ["Username", item.username || item.handle],
          ["Details", item.details || item.account_details || item.description]
        ];

        const detailLines = [];
        const seenDetails = new Set();

        detailPairs.forEach(([label, value]) => {
          const rawValue = String(value ?? "").trim();
          if (!rawValue) return;

          const normalized = rawValue.toLowerCase();
          if (seenDetails.has(normalized)) return;
          seenDetails.add(normalized);

          const alreadyLabeled = /[:：]/.test(rawValue.slice(0, 30));
          detailLines.push(alreadyLabeled ? rawValue : `${label}: ${rawValue}`);
        });

        return {
          name,
          details: detailLines.join("\n"),
          note:
            item.note ||
            item.instructions ||
            "",
          image:
            item.qr_image_url ||
            item.qr_image ||
            item.qr_url ||
            item.image_url ||
            item.image ||
            item.qr ||
            item.qr_path ||
            ""
        };
      });
    } catch (error) {
      return FALLBACK_PAYMENT_METHODS;
    }
  }

  async function checkPromo(code, context) {
    const raw = String(code || "").trim();

    if (!raw) {
      return {
        ok: true,
        finalAmount: context.price,
        message: "Optional."
      };
    }

    try {
      const client = getClient();

      if (!client || typeof client.from !== "function") {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Code checking unavailable."
        };
      }

      const { data: promo, error } = await client
        .from("promo_codes")
        .select("*")
        .eq("code", raw.toUpperCase())
        .maybeSingle();

      if (error || !promo) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Invalid code."
        };
      }

      if (promo.is_active === false) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Code inactive."
        };
      }

      const limit = Number(promo.usage_limit ?? promo.max_uses ?? promo.total_uses ?? 0);
      const used = Number(promo.used_count ?? promo.uses_count ?? promo.times_used ?? promo.used ?? 0);

      if (limit > 0 && used >= limit) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Code already used up."
        };
      }

      if (promo.id && context.slug) {
        const { data: targets } = await client
          .from("promo_code_targets")
          .select("*")
          .eq("promo_code_id", promo.id);

        if (Array.isArray(targets) && targets.length) {
          const matched = targets.some(target => {
            const slug =
              target.piece_slug ||
              target.slug ||
              target.target_slug ||
              target.piece ||
              "";
            return String(slug) === String(context.slug);
          });

          if (!matched) {
            return {
              ok: false,
              finalAmount: context.price,
              message: "Code not for this piece."
            };
          }
        }
      }

      const type = String(promo.discount_type || promo.type || "").toLowerCase();
      const value = Number(promo.discount_value ?? promo.value ?? 0);
      const discount = type.includes("percent")
        ? context.price * (value / 100)
        : value;

      const finalAmount = Math.max(0, Math.round(context.price - discount));

      return {
        ok: true,
        finalAmount,
        message: "Code applied."
      };
    } catch (error) {
      return {
        ok: false,
        finalAmount: context.price,
        message: "Code check failed."
      };
    }
  }

  function updateFinal(amount, message, isError = false) {
    const output = document.querySelector("[data-paid-reader-final-amount]");
    const status = document.querySelector("[data-paid-reader-promo-status]");

    if (output) output.textContent = money(amount);

    if (status) {
      status.textContent = message || "";
      status.classList.toggle("is-error", Boolean(isError));
    }
  }

  async function autoCheckPromo() {
    const modal = document.querySelector("#paidReaderPaymentModal");
    if (!modal || !modal.__paidReaderContext) return;

    const context = modal.__paidReaderContext;
    const input = modal.querySelector("[data-paid-reader-promo-code]");
    const code = input?.value || "";

    updateFinal(context.price, code.trim() ? "Checking..." : "Optional.");

    const result = await checkPromo(code, context);
    updateFinal(result.finalAmount, result.message, !result.ok);
  }

  function renderShell(context) {
    document.querySelector("#paidReaderPaymentModal")?.remove();

    document.body.insertAdjacentHTML("beforeend", `
      <div id="paidReaderPaymentModal" class="modal-overlay is-open open paid-reader-payment-overlay" role="dialog" aria-modal="true" aria-labelledby="paidReaderPaymentTitle">
        <div class="social-modal paid-reader-payment-modal">
          <button class="modal-close" type="button" data-paid-reader-payment-close aria-label="Close payment options">
            <span aria-hidden="true">X</span>
          </button>

          <p class="eyebrow">Manual payment</p>
          <h2 id="paidReaderPaymentTitle">Payment Options</h2>
          <p class="modal-lede">
            Use these options for this paid piece. Payment is manually verified for now.
          </p>

          <div class="payment-selected-box">
            <span>Selected paid piece</span>
            <strong>${esc(context.title)}</strong>
          </div>

          <div class="paid-reader-payment-strip">
            <div class="payment-calculator-card">
              <span>Amount to pay</span>
              <strong>${money(context.price)}</strong>
            </div>

            <label class="payment-calculator-card paid-reader-promo-card">
              <span>Enter code</span>
              <input data-paid-reader-promo-code type="text" autocomplete="off" placeholder="Optional" />
              <small data-paid-reader-promo-status>Optional.</small>
            </label>

            <div class="payment-calculator-card">
              <span>Final amount</span>
              <strong data-paid-reader-final-amount>${money(context.price)}</strong>
            </div>
          </div>

          <div class="paid-reader-proof-note">
            Include the exact title <strong>${esc(context.title)}</strong> in your proof/receipt. If missing, the request will not be processed.
            <br />
            <strong>No refund policy:</strong> payments with incomplete proof/details are not refundable.
          </div>

          <div id="paidReaderPaymentMethods" class="payment-method-grid">
            <div class="promo-loading-card">Loading payment options...</div>
          </div>

          <p class="paid-reader-after-note">
            <strong>After paying:</strong> send the proof/screenshot through Email, Instagram, or TikTok so the request can be manually verified.
          </p>
        </div>
      </div>
    `);

    document.body.classList.add("modal-open");

    const modal = document.querySelector("#paidReaderPaymentModal");
    if (modal) modal.__paidReaderContext = { ...context };
  }

  function renderMethods(methods) {
    const target = document.querySelector("#paidReaderPaymentMethods");
    if (!target) return;

    if (!methods.length) {
      target.innerHTML = `<div class="promo-loading-card">No payment methods available right now.</div>`;
      return;
    }

    target.innerHTML = methods.map(method => {
      const image = cleanImage(method.image);

      const detailHtml = method.details
        ? `<p class="payment-method-detail-lines">${esc(method.details).replace(/\\n/g, "<br />")}</p>`
        : "";
      const noteHtml = method.note
        ? `<p class="payment-method-note">${esc(method.note)}</p>`
        : "";

      return `
        <article class="payment-method-card">
          ${image ? `
            <button class="payment-qr-button" type="button" data-paid-reader-qr="${esc(image)}" data-paid-reader-qr-name="${esc(method.name)}">
              <img src="${esc(image)}" alt="${esc(method.name)} QR code" loading="lazy" onerror="this.closest('.payment-qr-button')?.remove();" />
            </button>
            <p class="qr-hint">Click QR to enlarge</p>
          ` : ""}
          <h3>${esc(method.name)}</h3>
          ${detailHtml}
          ${noteHtml}
        </article>
      `;
    }).join("");
  }

  async function openPayment(context) {
    renderShell(context);
    const methods = await loadPaymentMethods();
    renderMethods(methods);
  }

  document.addEventListener("input", event => {
    if (!event.target.matches("[data-paid-reader-promo-code]")) return;

    clearTimeout(promoTimer);
    promoTimer = setTimeout(autoCheckPromo, 450);
  });

  document.addEventListener("click", event => {
    const close = event.target.closest("[data-paid-reader-payment-close]");
    if (close) {
      closeModal();
      return;
    }

    const qr = event.target.closest("[data-paid-reader-qr]");
    if (qr) {
      const image = qr.dataset.paidReaderQr || "";
      const name = qr.dataset.paidReaderQrName || "Payment QR";

      if (!image) return;

      document.body.insertAdjacentHTML("beforeend", `
        <div class="reader-qr-preview" data-paid-reader-qr-preview>
          <button class="modal-close reader-qr-close" type="button" data-paid-reader-qr-close aria-label="Close enlarged QR">
            <span aria-hidden="true">X</span>
          </button>
          <img src="${esc(image)}" alt="${esc(name)} enlarged QR code" />
        </div>
      `);
      return;
    }

    const qrClose = event.target.closest("[data-paid-reader-qr-close]");
    if (qrClose) {
      qrClose.closest("[data-paid-reader-qr-preview]")?.remove();
      return;
    }

    const trigger = event.target.closest(".paid-reader-shell [data-open-payment]");
    if (!trigger) return;

    event.preventDefault();
    openPayment(getContext(trigger));
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    const qr = document.querySelector("[data-paid-reader-qr-preview]");
    if (qr) {
      qr.remove();
      return;
    }

    closeModal();
  });
})();


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


/* V18T.3 paid reader proof social links */
(function setupPaidReaderProofSocialLinks() {
  if (window.__safePaidReaderProofSocialLinksBound) return;
  window.__safePaidReaderProofSocialLinksBound = true;

  const PAID_READER_PROOF_LINKS = [
      {
            "label": "Email",
            "href": "mailto:ralphjohnsantos01@gmail.com",
            "icon": "?"
      },
      {
            "label": "Instagram",
            "href": "https://www.instagram.com/live_xps/",
            "icon": "?"
      },
      {
            "label": "TikTok",
            "href": "https://www.tiktok.com/@patatas0111",
            "icon": "?"
      }
];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeHref(value) {
    return String(value || "").trim();
  }

  function ensurePaidReaderProofLinks() {
    const modal = document.querySelector("#paidReaderPaymentModal");
    if (!modal || modal.querySelector("[data-paid-reader-proof-links]")) return;

    const usableLinks = PAID_READER_PROOF_LINKS
      .map(item => ({ ...item, href: normalizeHref(item.href) }))
      .filter(item => item.href);

    if (!usableLinks.length) return;

    const html = `
      <section class="paid-reader-proof-links" data-paid-reader-proof-links>
        <p><strong>Send proof through:</strong></p>

        <div class="paid-reader-proof-link-grid">
          ${usableLinks.map(item => `
            <a class="paid-reader-proof-link-card" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">${esc(item.icon || "")}</span>
              <strong>${esc(item.label)}</strong>
            </a>
          `).join("")}
        </div>
      </section>
    `;

    const modalBody = modal.querySelector(".paid-reader-payment-modal");
    const afterNote = modal.querySelector(".paid-reader-after-note");
    const methods = modal.querySelector("#paidReaderPaymentMethods");

    if (afterNote) {
      afterNote.insertAdjacentHTML("afterend", html);
      return;
    }

    if (methods) {
      methods.insertAdjacentHTML("afterend", html);
      return;
    }

    modalBody?.insertAdjacentHTML("beforeend", html);
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".paid-reader-shell [data-open-payment]")) return;

    window.setTimeout(ensurePaidReaderProofLinks, 80);
    window.setTimeout(ensurePaidReaderProofLinks, 350);
    window.setTimeout(ensurePaidReaderProofLinks, 900);
  }, true);

  const observer = new MutationObserver(() => {
    ensurePaidReaderProofLinks();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();


/* V18U.2 paid reader proof SVG icons */
(function setupPaidReaderProofSvgIcons() {
  if (window.__safePaidReaderProofSvgIconsBound) return;
  window.__safePaidReaderProofSvgIconsBound = true;

  function proofIconMarkup(label = "") {
    const key = String(label || "").trim().toLowerCase();

    if (key.includes("email")) {
      return `
        <span class="social-platform-icon brand-email" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-.4 4.25-7.07 4.42a1 1 0 0 1-1.06 0L4.4 8.25V6.7l7.6 4.75 7.6-4.75v1.55Z"></path>
          </svg>
        </span>
      `;
    }

    if (key.includes("instagram")) {
      return `
        <span class="social-platform-icon brand-instagram" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm4.5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5Zm5.15-2.9a1.15 1.15 0 1 1-1.15 1.15 1.15 1.15 0 0 1 1.15-1.15Z"></path>
          </svg>
        </span>
      `;
    }

    if (key.includes("tiktok")) {
      return `
        <span class="social-platform-icon brand-tiktok" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M16.7 3c.32 2.16 1.55 3.63 3.73 3.77v3.1a7.56 7.56 0 0 1-3.71-1.08v5.86c0 3.02-2.1 5.35-5.3 5.35-3.04 0-5.18-2.04-5.18-4.92 0-3.26 2.86-5.36 6.24-4.74v3.25c-1.3-.42-2.85.17-2.85 1.46 0 .92.72 1.55 1.74 1.55 1.12 0 1.86-.68 1.86-2.15V3h3.47Z"></path>
          </svg>
        </span>
      `;
    }

    return `
      <span class="social-platform-icon brand-link" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M10.6 13.4a1 1 0 0 1 0-1.4l2.8-2.8a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0Zm-4.95 4.95a3.5 3.5 0 0 1 0-4.95l3.18-3.18a3.5 3.5 0 0 1 4.95 0 1 1 0 0 1-1.42 1.42 1.5 1.5 0 0 0-2.12 0l-3.18 3.18a1.5 1.5 0 0 0 2.12 2.12l1.08-1.08a1 1 0 0 1 1.42 1.42l-1.08 1.08a3.5 3.5 0 0 1-4.95 0Zm4.57-4.57a1 1 0 0 1 1.42-1.42 1.5 1.5 0 0 0 2.12 0l3.18-3.18a1.5 1.5 0 0 0-2.12-2.12l-1.08 1.08a1 1 0 0 1-1.42-1.42l1.08-1.08a3.5 3.5 0 0 1 4.95 4.95l-3.18 3.18a3.5 3.5 0 0 1-4.95 0Z"></path>
        </svg>
      </span>
    `;
  }

  function applyPaidReaderProofIcons() {
    document.querySelectorAll(".paid-reader-proof-link-card").forEach(card => {
      const label = card.querySelector("strong")?.textContent || "";
      const currentIcon = card.querySelector("span[aria-hidden='true']");

      if (!currentIcon) return;
      if (currentIcon.classList.contains("social-platform-icon")) return;

      currentIcon.outerHTML = proofIconMarkup(label);
    });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".paid-reader-shell [data-open-payment]")) return;

    window.setTimeout(applyPaidReaderProofIcons, 80);
    window.setTimeout(applyPaidReaderProofIcons, 350);
    window.setTimeout(applyPaidReaderProofIcons, 900);
  }, true);

  const observer = new MutationObserver(() => {
    applyPaidReaderProofIcons();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  applyPaidReaderProofIcons();
})();


/* V2.0K.1 mobile hamburger navigation */
(function setupMobileNavigationMenu() {
  if (window.__safeMobileNavigationMenuBound) return;
  window.__safeMobileNavigationMenuBound = true;

  const toggle = document.querySelector("[data-mobile-nav-toggle]");
  const nav = document.querySelector("#siteNavLinks, .nav-links");

  if (!toggle || !nav) return;

  function setOpen(isOpen) {
    document.body.classList.toggle("mobile-nav-open", isOpen);
    toggle.classList.toggle("is-open", isOpen);
    nav.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
  }

  toggle.addEventListener("click", event => {
    event.stopPropagation();
    setOpen(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", event => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("click", event => {
    if (!document.body.classList.contains("mobile-nav-open")) return;
    if (event.target.closest("[data-mobile-nav-toggle]") || event.target.closest(".nav-links")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 680) setOpen(false);
  });
})();
/* V2.0K.1 mobile hamburger navigation END */



/* V2.0Q.18 paid reader payment copy polish */
(function setupPaidReaderPaymentCopyPolish() {
  if (window.__safePaidReaderPaymentCopyPolishBound) return;
  window.__safePaidReaderPaymentCopyPolishBound = true;

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getPaymentModal() {
    return document.querySelector("#paidReaderPaymentModal");
  }

  function getSelectedTitle(modal) {
    return compactText(modal?.querySelector(".payment-selected-box strong")?.textContent) || "Premium piece unlock";
  }

  function getFinalAmount(modal) {
    return compactText(modal?.querySelector("[data-paid-reader-final-amount]")?.textContent) || "PHP 0";
  }

  function getPromoLine(modal) {
    const code = compactText(modal?.querySelector("[data-paid-reader-promo-code]")?.value);
    const status = compactText(modal?.querySelector("[data-paid-reader-promo-status]")?.textContent);

    if (!code) return "Promo code: none";
    return `Promo code: ${code}${status ? ` (${status})` : ""}`;
  }

  function buildPaymentSummary(modal) {
    return [
      "@safespaceofyours payment proof",
      `Piece: ${getSelectedTitle(modal)}`,
      `Final amount: ${getFinalAmount(modal)}`,
      getPromoLine(modal),
      "Note: Please attach the screenshot/receipt and keep the exact piece title visible."
    ].join("\n");
  }

  function ensureSummaryCopyButton(modal) {
    const note = modal?.querySelector(".paid-reader-proof-note");
    const strip = modal?.querySelector(".paid-reader-payment-strip");
    const anchor = note || strip;
    if (!anchor) return;

    let actions = modal.querySelector("[data-paid-reader-copy-actions]");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "paid-reader-copy-actions";
      actions.dataset.paidReaderCopyActions = "";
      anchor.insertAdjacentElement("afterend", actions);
    }

    let button = actions.querySelector("[data-paid-reader-copy-summary]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "paid-reader-copy-btn";
      button.dataset.paidReaderCopySummary = "";
      button.dataset.copyValue = "";
      button.textContent = "Copy payment summary";
      button.setAttribute("aria-label", "Copy payment summary");
      actions.appendChild(button);
    }

    button.dataset.copyValue = buildPaymentSummary(modal);
  }

  function readCopyLinesFrom(element) {
    if (!element) return [];

    const text = Array.from(element.childNodes)
      .map(node => node.nodeName === "BR" ? "\n" : (node.textContent || ""))
      .join("");

    return text
      .split(/\n+/)
      .map(compactText)
      .filter(Boolean);
  }

  function getMethodCopyValue(card) {
    const lines = [];
    const title = compactText(card.querySelector("h3")?.textContent);

    if (title) lines.push(`Payment method: ${title}`);

    card.querySelectorAll(".payment-method-detail-lines, .payment-method-note").forEach(block => {
      readCopyLinesFrom(block).forEach(line => lines.push(line));
    });

    if (!lines.length) {
      const clone = card.cloneNode(true);
      clone.querySelectorAll("button, img, .qr-hint, script, style").forEach(item => item.remove());

      const text = compactText(clone.textContent);
      if (text) lines.push(text);
    }

    return lines.length ? lines.join("\n") : "";
  }

  function ensureMethodCopyButtons(modal) {
    modal?.querySelectorAll("#paidReaderPaymentMethods .payment-method-card").forEach(card => {
      const value = getMethodCopyValue(card);
      if (!value) return;

      let button = card.querySelector("[data-paid-reader-copy-method]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "paid-reader-copy-btn paid-reader-copy-method-btn";
        button.dataset.paidReaderCopyMethod = "";
        button.dataset.copyValue = "";
        button.textContent = "Copy details";
        button.setAttribute("aria-label", "Copy payment method details");
        card.appendChild(button);
      }

      button.dataset.copyValue = value;
    });
  }

  function syncPaidReaderPaymentCopy() {
    const modal = getPaymentModal();
    if (!modal) return;

    ensureSummaryCopyButton(modal);
    ensureMethodCopyButtons(modal);
  }

  document.addEventListener("input", event => {
    if (!event.target.matches("[data-paid-reader-promo-code]")) return;
    window.setTimeout(syncPaidReaderPaymentCopy, 80);
    window.setTimeout(syncPaidReaderPaymentCopy, 650);
    window.setTimeout(syncPaidReaderPaymentCopy, 1100);
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".paid-reader-shell [data-open-payment]")) return;
    window.setTimeout(syncPaidReaderPaymentCopy, 80);
    window.setTimeout(syncPaidReaderPaymentCopy, 350);
    window.setTimeout(syncPaidReaderPaymentCopy, 900);
  }, true);

  const observer = new MutationObserver(syncPaidReaderPaymentCopy);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  syncPaidReaderPaymentCopy();
})();
/* V2.0Q.18 paid reader payment copy polish END */



/* V2.0Q.26 public modal mobile scroll guard */
(function setupPublicModalMobileScrollGuard() {
  if (window.__safePublicModalMobileScrollGuardBound) return;
  window.__safePublicModalMobileScrollGuardBound = true;

  function closePublicHamburger() {
    const nav = document.querySelector('#siteNavLinks');
    const toggle = document.querySelector('[data-mobile-nav-toggle][aria-controls="siteNavLinks"], [data-mobile-nav-toggle]');

    document.body.classList.remove('mobile-nav-open');

    if (nav) nav.classList.remove('is-open');

    if (toggle) {
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
    }
  }

  function resetModalScroll(modal) {
    if (!modal) return;
    const panel = modal.querySelector('.social-modal, [role="dialog"]');

    modal.scrollTop = 0;
    if (panel) panel.scrollTop = 0;

    window.requestAnimationFrame(() => {
      modal.scrollTop = 0;
      if (panel) panel.scrollTop = 0;
    });
  }

  let wasSocialModalOpen = false;

  function syncSocialModalState() {
    const modal = document.querySelector('#socialModal');
    const isOpen = Boolean(modal && modal.classList.contains('open'));

    if (isOpen && !wasSocialModalOpen) {
      closePublicHamburger();
      resetModalScroll(modal);
    }

    wasSocialModalOpen = isOpen;
  }

  document.addEventListener('click', event => {
    const selectedOption = event.target.closest('#siteNavLinks a, #siteNavLinks button');
    const opensPublicModal = event.target.closest('#openAboutModal, #openPromoCodesModal, #openSocialModal, a[href="#about"]');

    if (selectedOption || opensPublicModal) {
      window.setTimeout(() => {
        closePublicHamburger();
        syncSocialModalState();
      }, 0);
    }
  });

  const observer = new MutationObserver(syncSocialModalState);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] });

  syncSocialModalState();
})();
/* V2.0Q.26 public modal mobile scroll guard END */
