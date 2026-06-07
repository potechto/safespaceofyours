const poemGrid = document.querySelector("#poemGrid");
const searchInput = document.querySelector("#searchInput");
const filterButtons = document.querySelector("#filterButtons");
const emptyState = document.querySelector("#emptyState");
const year = document.querySelector("#year");

let activeCategory = "All";

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
  return ["All", ...new Set(window.POEMS.map(poem => poem.category))];
}

function renderFilters() {
  if (!filterButtons) return;

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

/* V12 poem card helpers */
function getPoemTypeLabel(poem) {
  const type = poem.type || "spoken-poetry";
  return type
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getPoemAccess(poem) {
  return poem.access || "free";
}

function formatPeso(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return "";
  return `₱${numericAmount.toLocaleString("en-PH")}`;
}

function renderPoems() {
  if (!poemGrid || !searchInput || !emptyState) return;

  const keyword = searchInput.value.trim();

  const filtered = window.POEMS.filter(poem => {
    const categoryMatch = activeCategory === "All" || poem.category === activeCategory;
    const searchMatch = !keyword || poemMatchesSearch(poem, keyword);
    return categoryMatch && searchMatch;
  });

  emptyState.hidden = filtered.length !== 0;

  poemGrid.innerHTML = filtered.map(poem => {
    const access = getPoemAccess(poem);
    const isPremium = access === "premium";
    const price = Number(poem.price) || 49;
    const accessLabel = isPremium ? "Premium" : "Free";
    const typeLabel = getPoemTypeLabel(poem);
    const priceLabel = isPremium ? formatPeso(price) : "";

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
            <span class="read-more">${isPremium ? "Read preview →" : "Read full piece →"}</span>
          </div>
        </a>

        ${isPremium ? `
          <button
            class="card-payment-btn"
            type="button"
            data-open-payment
            data-piece-title="${escapeHTML(poem.title)}"
            data-piece-price="${price}"
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
    price: 49
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
      detail: "RA**H JO*N S. ? 0976 *** 6958",
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
      detail: "RALPH JOHN SANTOS ? **** 4853",
      note: "Scan the QR first. Bank details are partially masked for privacy."
    }
  ];

  const promoCodes = {
    SAFE10: { type: "percent", value: 10, label: "10% off" },
    POTATO15: { type: "percent", value: 15, label: "15% off" },
    FIRSTREAD20: { type: "percent", value: 20, label: "20% off" }
  };

  function createCard(item) {
    const target = item.href.startsWith("mailto:") ? "_self" : "_blank";

    return `
      <a class="modal-social-card" href="${item.href}" target="${target}" rel="noopener noreferrer">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
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

  function setupPaymentCalculator() {
    const amountInput = panel.querySelector("#paymentAmount");
    const promoInput = panel.querySelector("#promoCodeInput");
    const finalAmount = panel.querySelector("#finalAmount");
    const promoStatus = panel.querySelector("#promoStatus");

    if (!amountInput || !promoInput || !finalAmount || !promoStatus) return;

    const startingPrice = Number(paymentContext.price) || 49;
    amountInput.value = startingPrice;

    function updateTotal() {
      const amount = Math.max(Number(amountInput.value) || 0, 0);
      const code = promoInput.value.trim().toUpperCase();
      const promo = promoCodes[code];
      let discount = 0;

      if (promo && promo.type === "percent") {
        discount = amount * (promo.value / 100);
      }

      const total = Math.max(amount - discount, 0);
      finalAmount.textContent = formatPeso(total || amount);

      if (!code) {
        promoStatus.textContent = "Optional: enter a promo code if one was given to you.";
      } else if (promo) {
        promoStatus.textContent = `${code} applied ? ${promo.label}.`;
      } else {
        promoStatus.textContent = "Promo code not recognized. You can still continue with the base amount.";
      }
    }

    amountInput.addEventListener("input", updateTotal);
    promoInput.addEventListener("input", updateTotal);
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
            <strong id="finalAmount">?49</strong>
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
        price: Number(context.price) || Number(paymentContext.price) || 49
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
      price: paymentTrigger.dataset.piecePrice || 49
    });
  });

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

redirectOldArchiveHash();
renderFilters();
renderPoems();
setupScrollTopButton();
setupSocialModal();
setupSmartScrollbars();

