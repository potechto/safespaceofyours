const poemGrid = document.querySelector("#poemGrid");
const searchInput = document.querySelector("#searchInput");
const filterButtons = document.querySelector("#filterButtons");
const emptyState = document.querySelector("#emptyState");
const year = document.querySelector("#year");

let activeCategory = "All";
let visiblePoems = Array.isArray(window.POEMS) ? window.POEMS : [];

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

function getCategories() {
  return ["All", ...new Set(visiblePoems.map(poem => poem.category))];
}

function renderFilters() {
  if (!filterButtons || !Array.isArray(visiblePoems)) return;

  filterButtons.innerHTML = getCategories()
    .map(category => `
      <button class="filter-btn ${category === activeCategory ? "active" : ""}" data-category="${escapeHTML(category)}">
        ${escapeHTML(category)}
      </button>
    `)
    .join("");

  document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderPoems();
    });
  });
}

function poemMatchesSearch(poem, keyword) {
  const searchable = `${poem.title} ${poem.category} ${poem.excerpt}`.toLowerCase();
  return searchable.includes(keyword.toLowerCase());
}

function getPoemTypeLabel(poem) {
  const type = poem.type || "spoken-poetry";
  return type
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getPoemAccess(poem) {
  if (window.SafePieceSettings) return window.SafePieceSettings.normalizeAccess(poem.access_type || poem.access);
  return poem.access || "free";
}

function formatPeso(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "";
  if (window.SafePieceSettings) return window.SafePieceSettings.formatPeso(numericAmount);
  return `PHP ${numericAmount.toLocaleString("en-PH")}`;
}

function renderPoems() {
  if (!poemGrid || !searchInput || !emptyState) return;

  const keyword = searchInput.value.trim();

  const filtered = visiblePoems.filter(poem => {
    const categoryMatch = activeCategory === "All" || poem.category === activeCategory;
    const searchMatch = !keyword || poemMatchesSearch(poem, keyword);
    return categoryMatch && searchMatch;
  });

  emptyState.hidden = filtered.length !== 0;

  poemGrid.innerHTML = filtered.map(poem => {
    const access = getPoemAccess(poem);
    const isPremium = access === "paid";
    const price = Number(poem.price) || 49;
    const accessLabel = isPremium ? "Premium" : "Free";
    const typeLabel = getPoemTypeLabel(poem);
    const priceLabel = isPremium ? formatPeso(price) : "";
    const readText = isPremium ? "Read preview" : "Read full piece";

    return `
      <article class="poem-card ${isPremium ? "premium-piece" : "free-piece"}">
        <a href="poem.html?slug=${encodeURIComponent(poem.slug)}" class="poem-link">
          <div class="poem-cover">
            <img src="${escapeHTML(poem.cover)}" alt="${escapeHTML(poem.title)} cover" loading="lazy" />
            ${poem.draft ? `<span class="draft-badge">Draft</span>` : ""}
            <span class="access-badge ${isPremium ? "premium" : "free"}">${accessLabel}</span>
          </div>

          <div class="poem-info">
            <div class="poem-meta-row">
              <p class="poem-category">${escapeHTML(poem.category)}</p>
              <span class="type-pill">${escapeHTML(typeLabel)}</span>
            </div>
            <h3>${escapeHTML(poem.title)}</h3>
            <p>${escapeHTML(poem.excerpt)}</p>
            <span class="read-more">${readText}</span>
          </div>
        </a>

        ${isPremium ? `
          <button
            class="card-payment-btn"
            type="button"
            data-open-payment
            data-piece-title="${escapeHTML(poem.title)}"
            data-piece-price="${price}"
            data-piece-slug="${escapeHTML(poem.slug)}"
          >
            ${priceLabel ? `Support / unlock ${priceLabel}` : "Support / unlock"}
          </button>
        ` : ""}
      </article>
    `;
  }).join("");
}

function redirectOldArchiveHash() {
  if (window.location.hash === "#archive") {
    history.replaceState(null, "", "#pieces");

    const piecesSection = document.querySelector("#pieces");
    if (piecesSection) {
      piecesSection.scrollIntoView({ behavior: "smooth" });
    }
  }
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

function setupSocialModal() {
  const openConnectBtn = document.querySelector("#openSocialModal");
  const openInquiryBtn = document.querySelector("#openInquiryModal");
  const openAboutBtns = document.querySelectorAll("#openAboutModal, a[href='#about']");
  const modal = document.querySelector("#socialModal");
  const panel = modal ? modal.querySelector(".social-modal") : null;

  if (!modal || !panel) return;

  let paymentContext = {
    title: "General support / premium unlock",
    price: 49,
    slug: ""
  };

  let currentQrContext = {
    name: "",
    image: ""
  };

  const links = {
    email: {
      label: "Email",
      value: "ralphjohnsantos01@gmail.com",
      href: "mailto:ralphjohnsantos01@gmail.com?subject=Custom%20Poetry%20Inquiry"
    },
    facebook: {
      label: "Facebook",
      value: "John Santos",
      href: "https://www.facebook.com/ralphjohn.santos.79"
    },
    github: {
      label: "GitHub",
      value: "@potechto",
      href: "https://github.com/potechto"
    },
    instagram: {
      label: "Instagram",
      value: "@live_xps",
      href: "https://www.instagram.com/live_xps/"
    },
    tiktok: {
      label: "TikTok",
      value: "@patatas0111",
      href: "https://www.tiktok.com/@patatas0111"
    }
  };

  const paymentMethods = [
    {
      name: "GCash",
      image: "Resources/gcash.jpg",
      detail: "RA**H JO*N S. - 0976 *** 6958",
      note: "Scan the QR first. Details are partially masked for privacy."
    },
    {
      name: "PayPal",
      image: "Resources/paypal.jpg",
      detail: "ralphjohnsantos01@gmail.com",
      note: "Use PHP when possible, then send proof after payment."
    },
    {
      name: "Maribank",
      image: "Resources/maribank.jpg",
      detail: "RALPH JOHN SANTOS - **** 4853",
      note: "Scan the QR first. Bank details are partially masked for privacy."
    }
  ];

  const promoCodes = {
    SAFE10: { type: "percent", value: 10, label: "10% off" },
    POTATO15: { type: "percent", value: 15, label: "15% off" },
    FIRSTREAD20: { type: "percent", value: 20, label: "20% off" }
  };

  function getSocialIcon(label) {
    const key = String(label || "").toLowerCase();

    const icons = {
      email: `
        <span class="social-platform-icon brand-email" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-.4 4.25-7.07 4.42a1 1 0 0 1-1.06 0L4.4 8.25V6.7l7.6 4.75 7.6-4.75v1.55Z"></path>
          </svg>
        </span>
      `,
      facebook: `
        <span class="social-platform-icon brand-facebook" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M14.2 8.2V6.9c0-.63.42-.78.72-.78h1.84V3.1L14.2 3.08c-2.84 0-3.48 2.13-3.48 3.49V8.2H8.5v3.1h2.22V21h3.48v-9.7h2.58l.34-3.1H14.2Z"></path>
          </svg>
        </span>
      `,
      github: `
        <span class="social-platform-icon brand-github" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-1.9c-3.1.68-3.76-1.33-3.76-1.33-.5-1.28-1.23-1.62-1.23-1.62-1-.69.08-.68.08-.68 1.1.08 1.69 1.14 1.69 1.14.99 1.68 2.58 1.2 3.22.91.1-.72.39-1.2.7-1.48-2.48-.28-5.09-1.24-5.09-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.63 10.63 0 0 1 5.6 0c2.13-1.45 3.07-1.15 3.07-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.25-5.1 5.52.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"></path>
          </svg>
        </span>
      `,
      instagram: `
        <span class="social-platform-icon brand-instagram" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M7.8 2h8.4A5.81 5.81 0 0 1 22 7.8v8.4a5.81 5.81 0 0 1-5.8 5.8H7.8A5.81 5.81 0 0 1 2 16.2V7.8A5.81 5.81 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm4.2 3.35A4.65 4.65 0 1 1 7.35 12 4.65 4.65 0 0 1 12 7.35Zm0 2A2.65 2.65 0 1 0 14.65 12 2.65 2.65 0 0 0 12 9.35Zm4.9-2.25a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1Z"></path>
          </svg>
        </span>
      `,
      tiktok: `
        <span class="social-platform-icon brand-tiktok" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M16.6 3c.35 2.18 1.6 3.48 3.7 3.62v3.13a7.1 7.1 0 0 1-3.63-1.02v6.03c0 3.06-2.1 5.24-5.13 5.24-3.1 0-5.34-2.1-5.34-5.05 0-2.86 2.2-5.03 5.07-5.03.38 0 .75.04 1.12.13v3.23a2.9 2.9 0 0 0-1.04-.18 1.82 1.82 0 0 0-1.92 1.85 1.86 1.86 0 0 0 1.97 1.88c1.16 0 1.92-.77 1.92-2.02V3h3.28Z"></path>
          </svg>
        </span>
      `
    };

    return icons[key] || `
      <span class="social-platform-icon brand-default" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z"></path>
        </svg>
      </span>
    `;
  }

  function createCard(item) {
    const target = item.href.startsWith("mailto:") ? "_self" : "_blank";
    const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";
    const label = escapeHTML(item.label);

    return `
      <a class="modal-social-card social-platform-card" href="${item.href}" target="${target}"${rel} aria-label="Open ${label}">
        ${getSocialIcon(item.label)}
        <strong>${label}</strong>
      </a>
    `;
  }

  function createPaymentCard(method) {
    return `
      <article class="payment-method-card">
        <button
          class="qr-zoom-btn"
          type="button"
          data-qr-name="${escapeHTML(method.name)}"
          data-qr-image="${escapeHTML(method.image)}"
          aria-label="Open ${escapeHTML(method.name)} QR code larger"
        >
          <img src="${method.image}" alt="${method.name} QR code" loading="lazy" />
          <span>Click QR to enlarge</span>
        </button>

        <div>
          <h3>${method.name}</h3>
          <p class="payment-detail">${method.detail}</p>
          <p>${method.note}</p>
        </div>
      </article>
    `;
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  async function validatePromoCode(code, amount) {
    if (!window.safeAdminClient) {
      return {
        ok: false,
        message: "Promo service is not ready. Please refresh the page and try again."
      };
    }

    const { data, error } = await window.safeAdminClient.rpc("validate_promo_code", {
      input_code: code,
      input_piece_slug: paymentContext.slug || "",
      input_amount: amount
    });

    if (error) {
      return {
        ok: false,
        message: error.message || "Promo code could not be checked."
      };
    }

    return data || {
      ok: false,
      message: "Promo code could not be checked."
    };
  }

  function formatPromoAppliedMessage(code, result) {
    const discountAmount = Number(result.discount_amount) || 0;
    const qtyLeft = result.qty_left === null || result.qty_left === undefined
      ? "unlimited"
      : Number(result.qty_left);

    return `${code} applied. Discount: ${formatPeso(discountAmount)}. Qty left: ${qtyLeft}.`;
  }

  function setupPaymentCalculator() {
    const amountInput = panel.querySelector("#paymentAmount");
    const promoInput = panel.querySelector("#promoCodeInput");
    const finalAmount = panel.querySelector("#finalAmount");
    const promoStatus = panel.querySelector("#promoStatus");

    if (!amountInput || !promoInput || !finalAmount || !promoStatus) return;

    const startingPrice = Number(paymentContext.price) || 49;
    amountInput.value = startingPrice;

    let promoCheckId = 0;
    let promoCheckTimer = null;

    async function updateTotal() {
      const currentCheckId = ++promoCheckId;
      const amount = Math.max(Number(amountInput.value) || 0, 0);
      const code = promoInput.value.trim().toUpperCase();

      finalAmount.textContent = formatPeso(amount);

      if (!code) {
        promoStatus.textContent = "Optional: enter a promo code if one was given to you.";
        return;
      }

      promoStatus.textContent = "Checking promo code...";

      const result = await validatePromoCode(code, amount);

      if (currentCheckId !== promoCheckId) return;

      if (!result.ok) {
        finalAmount.textContent = formatPeso(amount);
        promoStatus.textContent = `${result.message || "Promo code not recognized."} You can still continue with the base amount.`;
        return;
      }

      finalAmount.textContent = formatPeso(Number(result.final_amount) || 0);
      promoStatus.textContent = formatPromoAppliedMessage(code, result);
    }

    function scheduleUpdate() {
      window.clearTimeout(promoCheckTimer);
      promoCheckTimer = window.setTimeout(updateTotal, 250);
    }

    amountInput.addEventListener("input", scheduleUpdate);
    promoInput.addEventListener("input", scheduleUpdate);
    updateTotal();
  }

  function renderModal(mode) {
    const isInquiry = mode === "inquiry";
    const isPayment = mode === "payment";
    const isAbout = mode === "about";
    const isQr = mode === "qr";

    if (isQr) {
      panel.innerHTML = `
        <button id="closeSocialModal" class="modal-close" type="button" aria-label="Close QR modal"><span aria-hidden="true">X</span></button>

        <p class="eyebrow">Full QR</p>
        <h2 id="socialModalTitle">${escapeHTML(currentQrContext.name || "Payment QR")}</h2>
        <p class="modal-subtitle">
          You can screenshot this, scan it from another device, or open/save the image in a new tab.
        </p>

        <div class="qr-full-view">
          <img class="qr-full-image" src="${escapeHTML(currentQrContext.image)}" alt="${escapeHTML(currentQrContext.name)} QR code enlarged" />
        </div>

        <div class="modal-action-row">
          <button class="btn secondary" type="button" data-back-payment>Back to payment options</button>
          <a class="btn primary" href="${escapeHTML(currentQrContext.image)}" target="_blank" rel="noopener noreferrer">Open / save image</a>
        </div>
      `;
    } else if (isAbout) {
      panel.innerHTML = `
        <button id="closeSocialModal" class="modal-close" type="button" aria-label="Close about modal"><span aria-hidden="true">X</span></button>

        <p class="eyebrow">About the writer</p>
        <h2 id="socialModalTitle">The writer behind safespaceofsyours</h2>

        <div class="about-modal-card">
          <div class="writer-photo-wrap">
            <img class="writer-photo" src="Resources/me1.jpg" alt="Portrait of the writer behind safespaceofsyours" loading="lazy" />
          </div>

          <div class="writer-details">
            <span class="commission-card-label">Writer behind the pieces</span>
            <h3>Hi, I write quiet words for loud feelings.</h3>
            <p>
              I created safespaceofsyours as a soft place for spoken poetry, reflections, and stories that are hard to say directly.
              This space is also open for custom pieces, message writing, and future premium reads with manual payment confirmation.
            </p>

            <div class="writer-tags" aria-label="Writing themes">
              <span>Spoken poetry</span>
              <span>Reflections</span>
              <span>Commissions</span>
              <span>Premium previews soon</span>
            </div>
          </div>
        </div>
      `;
    } else if (isPayment) {
      panel.innerHTML = `
        <button id="closeSocialModal" class="modal-close" type="button" aria-label="Close payment modal"><span aria-hidden="true">X</span></button>

        <p class="eyebrow">Manual payment</p>
        <h2 id="socialModalTitle">Payment Options</h2>
        <p class="modal-subtitle">
          Use these options for support, custom writing, or future premium unlock requests. Payment is manually verified for now.
        </p>

        <div class="payment-summary-box">
          <span>Selected</span>
          <strong>${escapeHTML(paymentContext.title || "General support / premium unlock")}</strong>
        </div>

        <div class="payment-calculator" aria-label="Payment amount calculator">
          <label>
            Amount in PHP
            <input id="paymentAmount" type="number" min="0" step="1" inputmode="numeric" />
          </label>

          <label>
            Promo code
            <input id="promoCodeInput" type="text" placeholder="Optional" autocomplete="off" />
          </label>

          <div class="final-amount-card">
            <span>Final amount</span>
            <strong id="finalAmount">49</strong>
            <small id="promoStatus">Optional: enter a promo code if one was given to you.</small>
          </div>
        </div>

        <div class="payment-method-grid">
          ${paymentMethods.map(createPaymentCard).join("")}
        </div>

        <div class="modal-note payment-proof-note">
          <p><strong>After paying:</strong> send the proof/screenshot through Email, Instagram, or TikTok so the request can be manually verified.</p>
          <div class="payment-contact-row">
            ${[links.email, links.instagram, links.tiktok].map(createCard).join("")}
          </div>
        </div>
      `;
    } else {
      const selectedLinks = isInquiry
        ? [links.email, links.instagram, links.tiktok]
        : [links.email, links.facebook, links.github, links.instagram, links.tiktok];

      panel.innerHTML = `
        <button id="closeSocialModal" class="modal-close" type="button" aria-label="Close contact modal"><span aria-hidden="true">X</span></button>

        <p class="eyebrow">${isInquiry ? "Inquiry" : "Connect"}</p>
        <h2 id="socialModalTitle">${isInquiry ? "Start an Inquiry" : "Connect with Me"}</h2>
        <p class="modal-subtitle">
          ${
            isInquiry
              ? "Choose where you want to send your story, project idea, or custom spoken poetry request."
              : "Find my other spaces here for updates, messages, and poetry-related posts."
          }
        </p>

        <div class="modal-social-grid ${isInquiry ? "inquiry-grid" : ""}">
          ${selectedLinks.map(createCard).join("")}
        </div>

        ${
          isInquiry
            ? `<div class="modal-note inquiry-note">
              <p>For inquiries, please include the purpose, mood, story context, deadline, and preferred language or style.</p>

              <div class="modal-sample-format">
                <h3>Sample inquiry format</h3>

                <div class="modal-sample-box">
                  <p><strong>Type of piece:</strong> Personalized spoken poetry / birthday message / apology / confession / project writing</p>
                  <p><strong>Purpose:</strong> I want to express...</p>
                  <p><strong>Story/context:</strong> Short background of what happened or what the piece is about.</p>
                  <p><strong>Mood:</strong> Emotional, hopeful, painful, comforting, romantic, faith-based, or reflective.</p>
                  <p><strong>Language:</strong> Tagalog, English, Taglish, or mixed.</p>
                  <p><strong>Deadline:</strong> Preferred date or if there is no rush.</p>
                  <p><strong>Extra notes:</strong> Names, phrases, memories, or lines you want included.</p>
                </div>
              </div>
            </div>`
            : `<p class="modal-note">TikTok is now linked for poetry updates and short-form pieces.</p>`
        }
      `;
    }

    const closeBtn = panel.querySelector("#closeSocialModal");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const backPaymentBtn = panel.querySelector("[data-back-payment]");
    if (backPaymentBtn) backPaymentBtn.addEventListener("click", () => openModal("payment", paymentContext));

    if (isPayment) setupPaymentCalculator();
  }

  function openModal(mode = "connect", context = {}) {
    if (mode === "payment") {
      paymentContext = {
        title: context.title || paymentContext.title || "General support / premium unlock",
        price: Number(context.price) || Number(paymentContext.price) || 49,
        slug: context.slug || paymentContext.slug || ""
      };
    }

    if (mode === "qr") {
      currentQrContext = {
        name: context.name || "Payment QR",
        image: context.image || ""
      };
    }

    renderModal(mode);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const closeBtn = panel.querySelector("#closeSocialModal");
    if (closeBtn) closeBtn.focus();
  }

  if (openConnectBtn) {
    openConnectBtn.addEventListener("click", () => openModal("connect"));
  }

  if (openInquiryBtn) {
    openInquiryBtn.addEventListener("click", () => openModal("inquiry"));
  }

  openAboutBtns.forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      openModal("about");
    });
  });

  document.addEventListener("click", event => {
    const qrTrigger = event.target.closest("[data-qr-image]");
    if (qrTrigger && modal.contains(qrTrigger)) {
      openModal("qr", {
        name: qrTrigger.dataset.qrName || "Payment QR",
        image: qrTrigger.dataset.qrImage || ""
      });
      return;
    }

    const paymentTrigger = event.target.closest("[data-open-payment]");
    if (!paymentTrigger) return;

    openModal("payment", {
      title: paymentTrigger.dataset.pieceTitle || "General support / premium unlock",
      price: paymentTrigger.dataset.piecePrice || 49,
      slug: paymentTrigger.dataset.pieceSlug || ""
    });
  });


  const paymentQuery = new URLSearchParams(window.location.search);
  if (paymentQuery.get("payment") === "piece") {
    window.setTimeout(() => {
      openModal("payment", {
        title: paymentQuery.get("title") || "Premium piece unlock",
        price: paymentQuery.get("price") || 49,
        slug: paymentQuery.get("slug") || ""
      });
    }, 250);
  }

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      closeModal();
    }
  });
}



function setupAdminGate() {
  const adminBtn = document.querySelector("#openAdminGate");
  const modal = document.querySelector("#socialModal");
  const panel = modal ? modal.querySelector(".social-modal") : null;

  if (!adminBtn || !modal || !panel) return;

  const ADMIN_PIN = "4312";
  const MAX_ATTEMPTS = 3;
  const COOLDOWN_MS = 15000;
  const RECOVERY_QUESTION = "what country you want to go";
  const RECOVERY_ANSWER = "Japan, pake mo ba?";

  function normalizeRecoveryAnswer(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  const LOCK_KEY = "safespace_admin_gate_locked";
  const ATTEMPTS_KEY = "safespace_admin_gate_attempts";
  const COOLDOWN_KEY = "safespace_admin_gate_cooldown_until";

  let countdownTimer = null;

  function getAttempts() {
    return Number(localStorage.getItem(ATTEMPTS_KEY) || "0");
  }

  function setAttempts(value) {
    localStorage.setItem(ATTEMPTS_KEY, String(value));
  }

  function isLocked() {
    return localStorage.getItem(LOCK_KEY) === "true";
  }

  function getCooldownUntil() {
    return Number(localStorage.getItem(COOLDOWN_KEY) || "0");
  }

  function startCooldown() {
    localStorage.setItem(LOCK_KEY, "true");
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
  }

  function clearGateLock() {
    localStorage.removeItem(LOCK_KEY);
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(COOLDOWN_KEY);
  }

  function clearCountdownTimer() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function closeModal() {
    clearCountdownTimer();
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function baseModalShell(innerContent) {
    panel.innerHTML = `
      <button id="closeSocialModal" class="modal-close" type="button" aria-label="Close">
        <span aria-hidden="true">X</span>
      </button>

      <h2 id="socialModalTitle" class="visually-hidden">LogIn</h2>

      ${innerContent}
    `;

    const closeBtn = panel.querySelector("#closeSocialModal");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
  }

  function showModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function renderPinForm() {
    baseModalShell(`
      <form id="adminGateForm" class="admin-gate-form stealth-gate-form">
        <label class="admin-gate-label">
          <span>Enter PIN</span>
          <input id="adminPinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="Enter PIN" maxlength="12" aria-label="Enter PIN" />
        </label>

        <button class="btn primary" type="submit">Continue</button>
      </form>

      <p id="adminGateMessage" class="admin-gate-message" role="status" aria-live="polite"></p>
    `);

    showModal();

    const pinInput = panel.querySelector("#adminPinInput");
    const form = panel.querySelector("#adminGateForm");
    const message = panel.querySelector("#adminGateMessage");

    if (pinInput) pinInput.focus();

    if (!form || !pinInput) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      const enteredPin = pinInput.value.trim();

      if (enteredPin === ADMIN_PIN) {
        clearGateLock();
        window.location.href = "admin.html";
        return;
      }

      const nextAttempts = getAttempts() + 1;
      setAttempts(nextAttempts);

      if (nextAttempts >= MAX_ATTEMPTS) {
        startCooldown();
        openAdminModal();
        return;
      }

      if (message) {
        message.textContent = "Try again.";
        message.classList.add("error");
      }

      pinInput.value = "";
      pinInput.focus();
    });
  }

  function renderCooldown() {
    const cooldownUntil = getCooldownUntil();

    baseModalShell(`
      <div class="admin-gate-cooldown" role="status" aria-live="polite">
        <p class="gate-cooldown-title">Please wait</p>

        <div class="gate-countdown">
          <span id="gateCountdownNumber">15</span>
          <small>s</small>
        </div>

        <div class="gate-countdown-track" aria-hidden="true">
          <span id="gateCountdownBar"></span>
        </div>
      </div>
    `);

    showModal();

    const numberEl = panel.querySelector("#gateCountdownNumber");
    const barEl = panel.querySelector("#gateCountdownBar");

    function updateCountdown() {
      const remainingMs = Math.max(0, cooldownUntil - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const progress = Math.max(0, Math.min(1, remainingMs / COOLDOWN_MS));

      if (numberEl) numberEl.textContent = String(remainingSeconds);
      if (barEl) barEl.style.width = `${progress * 100}%`;

      if (remainingMs <= 0) {
        clearCountdownTimer();
        localStorage.removeItem(COOLDOWN_KEY);
        openAdminModal();
      }
    }

    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 250);
  }

  function renderRecoveryForm() {
    baseModalShell(`
      <form id="adminRecoveryForm" class="admin-gate-form stealth-gate-form">
        <label class="admin-gate-label">
          <span>${RECOVERY_QUESTION}</span>
          <input id="adminRecoveryInput" type="text" autocomplete="off" placeholder="Answer" aria-label="${RECOVERY_QUESTION}" />
        </label>

        <button class="btn primary" type="submit">Continue</button>
      </form>

      <p id="adminRecoveryMessage" class="admin-gate-message" role="status" aria-live="polite"></p>
    `);

    showModal();

    const recoveryInput = panel.querySelector("#adminRecoveryInput");
    const form = panel.querySelector("#adminRecoveryForm");
    const message = panel.querySelector("#adminRecoveryMessage");

    if (recoveryInput) recoveryInput.focus();

    if (!form || !recoveryInput) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      if (normalizeRecoveryAnswer(recoveryInput.value) === RECOVERY_ANSWER) {
        clearGateLock();
        openAdminModal();
        return;
      }

      if (message) {
        message.textContent = "Try again.";
        message.classList.add("error");
      }

      recoveryInput.value = "";
      recoveryInput.focus();
    });
  }

  function openAdminModal() {
    clearCountdownTimer();

    const cooldownUntil = getCooldownUntil();

    if (isLocked() && cooldownUntil > Date.now()) {
      renderCooldown();
      return;
    }

    if (isLocked()) {
      renderRecoveryForm();
      return;
    }

    renderPinForm();
  }

  adminBtn.addEventListener("click", openAdminModal);
}

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

if (searchInput) {
  searchInput.addEventListener("input", renderPoems);
}



async function syncPublicPieceSettings() {
  if (!window.SafePieceSettings) return;

  const settings = await window.SafePieceSettings.loadSettings();
  if (!settings.length) return;

  visiblePoems = window.SafePieceSettings.mergePoemsWithSettings(window.POEMS, settings, { includeDisabled: false });
  renderFilters();
  renderPoems();
}

function repairVisibleSymbols() {
  const scrollTopBtn = document.querySelector("#scrollTopBtn");

  if (scrollTopBtn) {
    scrollTopBtn.classList.add("scroll-top-btn");
    scrollTopBtn.setAttribute("aria-label", "Back to top");
    scrollTopBtn.innerHTML = `
      <span class="scroll-top-icon" aria-hidden="true">&#8593;</span>
      <span class="visually-hidden">Back to top</span>
    `;
  }

  document.querySelectorAll(".pencil").forEach(icon => {
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = "&#10022;";
  });
}

redirectOldArchiveHash();
renderFilters();
renderPoems();
setupScrollTopButton();
setupSocialModal();
setupAdminGate();
setupSmartScrollbars();
repairVisibleSymbols();
syncPublicPieceSettings();




