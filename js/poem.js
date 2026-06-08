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


/* V18S.8 standalone reader payment modal */
(function setupReaderPaymentModal() {
  if (window.__safeReaderPaymentModalBound) return;
  window.__safeReaderPaymentModalBound = true;

  const READER_PAYMENT_FALLBACK_METHODS = [
      {
            "name": "GCash",
            "details": "RA**H JO*N S. - 0976 *** 6958",
            "image": "Resources/gcash.jpg"
      },
      {
            "name": "PayPal",
            "details": "ralphjohnsantos5@gmail.com",
            "image": "Resources/paypal.jpg"
      },
      {
            "name": "Maribank",
            "details": "RALPH JOHN SANTOS - **** 4853",
            "image": "Resources/maribank.jpg"
      }
];

  function readerPaymentEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatReaderPeso(value) {
    const amount = Number(value) || 0;
    return `PHP ${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
  }

  function normalizeReaderImagePath(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    return raw.replace(/^\.\//, "");
  }

  function getReaderPaymentContext(trigger) {
    return {
      title: trigger.dataset.pieceTitle || "Premium piece unlock",
      price: Number(trigger.dataset.piecePrice || 49) || 49,
      slug: trigger.dataset.pieceSlug || ""
    };
  }

  function getReaderSupabaseClient() {
    return (
      window.safeSupabase ||
      window.safeSupabaseClient ||
      window.supabaseClient ||
      window.SAFE_SUPABASE_CLIENT ||
      null
    );
  }

  function closeReaderPaymentModal() {
    const modal = document.querySelector("#readerPaymentModal");
    if (!modal) return;
    modal.remove();
    document.body.classList.remove("modal-open");
  }

  async function loadReaderPaymentMethods() {
    const fallback = READER_PAYMENT_FALLBACK_METHODS;

    try {
      const client = getReaderSupabaseClient();

      if (!client || typeof client.from !== "function") {
        return fallback;
      }

      const { data, error } = await client
        .from("payment_methods")
        .select("*")
        .eq("is_visible", true)
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data) || !data.length) {
        return fallback;
      }

      return data.map(method => ({
        name: method.name || method.method_name || "Payment method",
        details:
          method.details ||
          method.account_details ||
          method.account ||
          method.number ||
          method.description ||
          "",
        image:
          method.image ||
          method.image_url ||
          method.qr_image ||
          method.qr_image_url ||
          method.qr_url ||
          ""
      }));
    } catch (error) {
      return fallback;
    }
  }

  async function checkReaderPromoCode(code, context) {
    const rawCode = String(code || "").trim();

    if (!rawCode) {
      return {
        ok: false,
        finalAmount: context.price,
        message: "Optional: enter a promo code if one was given to you."
      };
    }

    try {
      const client = getReaderSupabaseClient();

      if (!client || typeof client.from !== "function") {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Promo checking is unavailable here. Include the promo code in your proof if one was given."
        };
      }

      const normalizedCode = rawCode.toUpperCase();

      const { data: promo, error } = await client
        .from("promo_codes")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (error || !promo) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "Promo code not recognized. You can still pay the base amount."
        };
      }

      if (promo.is_active === false) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "This promo code is currently disabled."
        };
      }

      const limit = Number(promo.usage_limit ?? promo.max_uses ?? promo.total_uses ?? 0);
      const used = Number(promo.used_count ?? promo.uses_count ?? promo.times_used ?? promo.used ?? 0);

      if (limit > 0 && used >= limit) {
        return {
          ok: false,
          finalAmount: context.price,
          message: "This promo code has already reached its limit."
        };
      }

      if (promo.id && context.slug) {
        const { data: targets } = await client
          .from("promo_code_targets")
          .select("*")
          .eq("promo_code_id", promo.id);

        if (Array.isArray(targets) && targets.length) {
          const matchesTarget = targets.some(target => {
            const targetSlug =
              target.piece_slug ||
              target.slug ||
              target.target_slug ||
              target.piece ||
              "";

            return String(targetSlug) === String(context.slug);
          });

          if (!matchesTarget) {
            return {
              ok: false,
              finalAmount: context.price,
              message: "This promo code does not match this piece."
            };
          }
        }
      }

      const discountType = String(promo.discount_type || promo.type || "").toLowerCase();
      const discountValue = Number(promo.discount_value ?? promo.value ?? 0);
      let discount = 0;

      if (discountType.includes("percent")) {
        discount = context.price * (discountValue / 100);
      } else {
        discount = discountValue;
      }

      const finalAmount = Math.max(0, Math.round(context.price - discount));

      return {
        ok: true,
        finalAmount,
        message: `Promo applied. Final amount: ${formatReaderPeso(finalAmount)}.`
      };
    } catch (error) {
      return {
        ok: false,
        finalAmount: context.price,
        message: "Promo code could not be checked. You can still pay the base amount."
      };
    }
  }

  function renderReaderPaymentModalShell(context) {
    const existing = document.querySelector("#readerPaymentModal");
    if (existing) existing.remove();

    document.body.insertAdjacentHTML("beforeend", `
      <div id="readerPaymentModal" class="modal-overlay is-open open reader-payment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="readerPaymentTitle">
        <div class="social-modal reader-payment-modal">
          <button class="modal-close" type="button" data-reader-payment-close aria-label="Close payment options">
            <span aria-hidden="true">X</span>
          </button>

          <p class="eyebrow">Manual payment</p>
          <h2 id="readerPaymentTitle">Payment Options</h2>
          <p class="modal-lede">
            Use one of the payment options below. After paying, send the screenshot/proof through the contact option.
          </p>

          <div class="payment-selected-box">
            <span>Selected piece</span>
            <strong>${readerPaymentEscape(context.title)}</strong>
          </div>

          <div class="reader-payment-amount-grid">
            <label class="payment-mini-card reader-payment-input-card">
              <span>Amount in PHP</span>
              <input data-reader-payment-amount type="number" min="0" step="1" value="${readerPaymentEscape(context.price)}" />
            </label>

            <label class="payment-mini-card reader-payment-input-card">
              <span>Promo code</span>
              <input data-reader-promo-code type="text" autocomplete="off" placeholder="Optional" />
              <button class="tiny-btn" type="button" data-reader-apply-promo>Apply</button>
              <small data-reader-promo-status>Optional: enter a promo code if one was given to you.</small>
            </label>

            <div class="payment-mini-card reader-final-card">
              <span>Final amount</span>
              <strong data-reader-final-amount>${formatReaderPeso(context.price)}</strong>
              <small>Use this amount for your payment.</small>
            </div>
          </div>

          <div class="payment-mini-card reader-receipt-note">
            <span>Receipt note</span>
            <p>
              Please include this title in your screenshot/proof:
              <strong>${readerPaymentEscape(context.title)}</strong>
            </p>
          </div>

          <div id="readerPaymentMethods" class="payment-method-grid">
            <div class="promo-loading-card">Loading payment options...</div>
          </div>
        </div>
      </div>
    `);

    document.body.classList.add("modal-open");
  }

  function updateReaderFinalAmount(amount, message) {
    const finalAmount = document.querySelector("[data-reader-final-amount]");
    const status = document.querySelector("[data-reader-promo-status]");

    if (finalAmount) finalAmount.textContent = formatReaderPeso(amount);
    if (status && message) status.textContent = message;
  }

  async function applyReaderPromo() {
    const modal = document.querySelector("#readerPaymentModal");
    if (!modal || !modal.__readerPaymentContext) return;

    const context = modal.__readerPaymentContext;
    const amountInput = modal.querySelector("[data-reader-payment-amount]");
    const promoInput = modal.querySelector("[data-reader-promo-code]");
    const status = modal.querySelector("[data-reader-promo-status]");

    context.price = Number(amountInput?.value || context.price) || context.price;

    if (status) status.textContent = "Checking promo code...";

    const result = await checkReaderPromoCode(promoInput?.value || "", context);
    updateReaderFinalAmount(result.finalAmount, result.message);
  }

  function renderReaderPaymentMethods(methods) {
    const target = document.querySelector("#readerPaymentMethods");
    if (!target) return;

    if (!methods.length) {
      target.innerHTML = `<div class="promo-loading-card">No payment methods available right now.</div>`;
      return;
    }

    target.innerHTML = methods.map(method => {
      const image = normalizeReaderImagePath(method.image);

      return `
        <article class="payment-method-card">
          ${image ? `
            <button class="payment-qr-button" type="button" data-reader-qr="${readerPaymentEscape(image)}" data-reader-qr-name="${readerPaymentEscape(method.name)}">
              <img src="${readerPaymentEscape(image)}" alt="${readerPaymentEscape(method.name)} QR code" loading="lazy" onerror="this.closest('.payment-qr-button')?.classList.add('is-broken-qr'); this.remove();" />
              <span class="broken-qr-note">QR image unavailable</span>
            </button>
            <p class="qr-hint">Click QR to enlarge</p>
          ` : `<p class="qr-hint">QR image unavailable</p>`}
          <h3>${readerPaymentEscape(method.name)}</h3>
          ${method.details ? `<p>${readerPaymentEscape(method.details)}</p>` : ""}
        </article>
      `;
    }).join("");
  }

  async function openReaderPaymentModal(context) {
    renderReaderPaymentModalShell(context);
    const modal = document.querySelector("#readerPaymentModal");

    if (modal) {
      modal.__readerPaymentContext = { ...context };
    }

    const methods = await loadReaderPaymentMethods();
    renderReaderPaymentMethods(methods);
  }

  document.addEventListener("click", event => {
    const close = event.target.closest("[data-reader-payment-close]");
    if (close) {
      closeReaderPaymentModal();
      return;
    }

    const applyPromo = event.target.closest("[data-reader-apply-promo]");
    if (applyPromo) {
      event.preventDefault();
      applyReaderPromo();
      return;
    }

    const qrButton = event.target.closest("[data-reader-qr]");
    if (qrButton && !qrButton.classList.contains("is-broken-qr")) {
      const image = qrButton.dataset.readerQr || "";
      const name = qrButton.dataset.readerQrName || "Payment QR";
      if (!image) return;

      document.body.insertAdjacentHTML("beforeend", `
        <div class="reader-qr-preview" data-reader-qr-preview>
          <button class="modal-close reader-qr-close" type="button" data-reader-qr-close aria-label="Close enlarged QR">
            <span aria-hidden="true">X</span>
          </button>
          <img src="${readerPaymentEscape(image)}" alt="${readerPaymentEscape(name)} enlarged QR code" />
        </div>
      `);
      return;
    }

    const qrClose = event.target.closest("[data-reader-qr-close]");
    if (qrClose) {
      qrClose.closest("[data-reader-qr-preview]")?.remove();
      return;
    }

    const trigger = event.target.closest(".paid-reader-shell [data-open-payment]");
    if (!trigger) return;

    event.preventDefault();
    openReaderPaymentModal(getReaderPaymentContext(trigger));
  }, true);

  document.addEventListener("input", event => {
    if (event.target.matches("[data-reader-payment-amount]")) {
      const amount = Number(event.target.value || 0) || 0;
      updateReaderFinalAmount(amount, "Optional: enter a promo code if one was given to you.");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      const qrPreview = document.querySelector("[data-reader-qr-preview]");
      if (qrPreview) {
        qrPreview.remove();
        return;
      }

      closeReaderPaymentModal();
    }
  });
})();

