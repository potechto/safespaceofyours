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

function setupUnlockForm(poem, fullText) {
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

    savePieceUnlock(poem.slug, code);
    poemText.innerHTML = buildUnlockedNotice() + formatPoem(fullText);
    window.scrollTo({ top: poemText.offsetTop - 120, behavior: "smooth" });
  });
}

function getPreviewText(text, limit) {
  const cleanText = String(text || "").trim();
  const safeLimit = Number(limit) || 700;

  if (cleanText.length <= safeLimit) return cleanText;

  return `${cleanText.slice(0, safeLimit).trim()}...`;
}

function buildPaidPreview(poem, fullText) {
  const price = Number(poem.price) || 49;
  const previewText = getPreviewText(fullText, poem.preview_char_limit);

  return `
    <div class="paid-reader-shell">
      <div class="paid-preview-text">
        ${formatPoem(previewText)}
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
          data-piece-price="${escapeHTML(price)}"
          data-piece-slug="${escapeHTML(poem.slug || "")}">
          <span>Manual payment</span>
          <strong>Open payment options</strong>
        </button>

        <div class="paid-reader-note">
          <p><strong>After paying:</strong> send the screenshot/proof through the contact option in the payment panel.</p>
          <p><strong>After confirmation:</strong> you'll receive an unlock code for this piece.</p>
        </div>
      </div>

      <div class="reader-unlock-panel">
        <div class="reader-unlock-copy">
          <p class="eyebrow">Already have a code?</p>
          <h3>Enter unlock code</h3>
          <p>Use the code sent after confirmation. It unlocks the full piece on this browser/device.</p>
        </div>

        <form class="unlock-code-form" data-unlock-form>
          <input data-unlock-code-input type="text" autocomplete="off" placeholder="Unlock code" />
          <button class="reader-action-btn" type="submit">
            <span>Code</span>
            <strong>Unlock piece</strong>
          </button>
          <p class="unlock-message" data-unlock-message aria-live="polite"></p>
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
    scrollTopBtn.classList.toggle("visible", window.scrollY > 420);
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

  try {
    const response = await fetch(poem.file);

    if (!response.ok) {
      throw new Error("Text file not found.");
    }

    const text = await response.text();
    const access = getPoemAccess(poem);

    if (access === "paid" && !isPieceUnlocked(poem.slug)) {
      poemText.innerHTML = buildPaidPreview(poem, text);
      setupUnlockForm(poem, text);
      return;
    }

    poemText.innerHTML = access === "paid"
      ? buildUnlockedNotice() + formatPoem(text)
      : formatPoem(text);
  } catch (error) {
    poemText.innerHTML = `
      <p class="reserved-piece">
        The text file for this piece could not be loaded. Check if this file exists:
        <strong>${escapeHTML(poem.file)}</strong>
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

      return visible.map(item => ({
        name: item.name || item.method_name || item.title || "Payment method",
        details:
          item.details ||
          item.account_details ||
          item.account ||
          item.account_number ||
          item.number ||
          item.description ||
          "",
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
      }));
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

      return `
        <article class="payment-method-card">
          ${image ? `
            <button class="payment-qr-button" type="button" data-paid-reader-qr="${esc(image)}" data-paid-reader-qr-name="${esc(method.name)}">
              <img src="${esc(image)}" alt="${esc(method.name)} QR code" loading="lazy" onerror="this.closest('.payment-qr-button')?.remove();" />
            </button>
            <p class="qr-hint">Click QR to enlarge</p>
          ` : ""}
          <h3>${esc(method.name)}</h3>
          ${method.details ? `<p>${esc(method.details)}</p>` : ""}
          ${method.note ? `<p>${esc(method.note)}</p>` : ""}
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

