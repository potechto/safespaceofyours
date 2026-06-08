const year = document.querySelector("#year");
const readerCover = document.querySelector("#readerCover");
const readerCategory = document.querySelector("#readerCategory");
const readerTitle = document.querySelector("#readerTitle");
const readerExcerpt = document.querySelector("#readerExcerpt");
const poemText = document.querySelector("#poemText");

const prevPoem = document.querySelector("#prevPoem");
const nextPoem = document.querySelector("#nextPoem");
const randomPoem = document.querySelector("#randomPoem");

const UNLOCKED_PIECES_STORAGE_KEY = "safespaceofsyours.unlockedPieces.v1";

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
      <p class="eyebrow">Unlocked piece</p>
      <p>This full piece is unlocked on this browser/device.</p>
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
  const paymentLink = `index.html?payment=piece&title=${encodeURIComponent(poem.title)}&price=${encodeURIComponent(price)}&slug=${encodeURIComponent(poem.slug)}#commissions`;

  return `
    <div class="paid-preview-text">
      ${formatPoem(previewText)}
    </div>

    <div class="paid-preview-notice paid-preview-after">
      <p class="eyebrow">Premium piece</p>
      <h2>Pay for full piece</h2>
      <p>
        Full access price: <strong>${escapeHTML(formatPeso(price))}</strong>.
        The text above is only a preview.
      </p>

      <div class="premium-next-steps">
        <p><strong>After payment:</strong> send your proof of payment through the contact option shown in the payment panel.</p>
        <p><strong>Then:</strong> wait for manual confirmation and your unlock/viewing code for this piece.</p>
      </div>

      <div class="reader-unlock-panel">
        <div>
          <p class="eyebrow">Already paid?</p>
          <h3>Enter unlock code</h3>
          <p>Use the code sent after manual payment confirmation. It unlocks this full piece on this browser/device.</p>
        </div>

        <form class="unlock-code-form" data-unlock-form>
          <input data-unlock-code-input type="text" placeholder="Enter unlock code" autocomplete="off" />
          <button class="reader-action-btn" type="submit">Unlock full piece</button>
          <p class="unlock-message" data-unlock-message></p>
        </form>
      </div>

      <a class="reader-action-btn pay-to-view-btn" href="${escapeHTML(paymentLink)}">Pay to View</a>
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
    document.title = "Piece not found | safespaceofsyours";
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
    document.title = "Piece unavailable | safespaceofsyours";
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

  document.title = `${poem.title} | safespaceofsyours`;

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
