const dashboardMessage = document.querySelector("#dashboardMessage");
const promoForm = document.querySelector("#promoForm");
const unlockForm = document.querySelector("#unlockForm");
const promoList = document.querySelector("#promoList");
const unlockList = document.querySelector("#unlockList");
const paymentList = document.querySelector("#paymentList");
const pieceSettingsList = document.querySelector("#pieceSettingsList");

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

function renderEmpty(target, message) {
  target.innerHTML = `<div class="list-item"><div><small>${escapeAdminHTML(message)}</small></div></div>`;
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

  promoList.innerHTML = data.map(item => `
    <article class="list-item">
      <div>
        <strong>${escapeAdminHTML(item.code)}</strong>
        <small>${escapeAdminHTML(item.discount_type)} ? ${escapeAdminHTML(item.discount_value)} ? ${item.is_active ? "active" : "inactive"}</small>
      </div>
      <div class="item-actions">
        <button class="tiny-btn" type="button" data-toggle-promo="${item.id}" data-current="${item.is_active}">
          ${item.is_active ? "Disable" : "Enable"}
        </button>
        <button class="tiny-btn danger" type="button" data-delete-promo="${item.id}">Delete</button>
      </div>
    </article>
  `).join("");
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

  unlockList.innerHTML = data.map(item => `
    <article class="list-item">
      <div>
        <strong>${escapeAdminHTML(item.code)}</strong>
        <small>${escapeAdminHTML(item.piece_slug)} ? used ${item.used_count}/${item.max_uses} ? ${item.is_active ? "active" : "inactive"}</small>
      </div>
      <div class="item-actions">
        <button class="tiny-btn" type="button" data-toggle-unlock="${item.id}" data-current="${item.is_active}">
          ${item.is_active ? "Disable" : "Enable"}
        </button>
        <button class="tiny-btn danger" type="button" data-delete-unlock="${item.id}">Delete</button>
      </div>
    </article>
  `).join("");
}


async function loadPieceSettings() {
  if (!pieceSettingsList) return;

  const { data, error } = await adminClient
    .from("piece_settings")
    .select("slug,title,category,type,is_enabled,access_type,price,preview_mode,preview_char_limit,updated_at")
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

  pieceSettingsList.innerHTML = data.map(item => {
    const accessType = normalizeAdminAccess(item.access_type);
    const price = Number(item.price) || 49;
    const previewLimit = Number(item.preview_char_limit) || 700;

    return `
      <article class="list-item piece-control-item" data-piece-row="${escapeAdminHTML(item.slug)}">
        <div class="piece-control-main">
          <div class="piece-title-row">
            <strong>${escapeAdminHTML(item.title)}</strong>
            <span class="piece-status-pill ${item.is_enabled ? "is-visible" : "is-hidden"}">${item.is_enabled ? "Visible" : "Hidden"}</span>
          </div>

          <div class="piece-meta">
            <span>${escapeAdminHTML(item.category)}</span>
            <span>${escapeAdminHTML(item.slug)}</span>
            <span>${accessType === "paid" ? escapeAdminHTML(formatAdminPeso(price)) : "Free access"}</span>
            <span>Preview ${escapeAdminHTML(previewLimit)} chars</span>
          </div>
        </div>

        <div class="piece-control-fields">
          <label class="piece-field inline-check">
            <span>Status</span>
            <span class="switch-line">
              <input type="checkbox" data-piece-enabled ${item.is_enabled ? "checked" : ""} />
              Enabled
            </span>
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
            <button class="tiny-btn" type="button" data-generate-unlock="${escapeAdminHTML(item.slug)}">Generate code</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
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
        <small>${escapeAdminHTML(item.display_detail)} ? ${escapeAdminHTML(item.qr_path)} ? ${item.is_active ? "visible" : "hidden"}</small>
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

promoForm.addEventListener("submit", async event => {
  event.preventDefault();

  const code = document.querySelector("#promoCodeInputAdmin").value.trim().toUpperCase();
  const discountType = document.querySelector("#promoTypeInput").value;
  const discountValue = Number(document.querySelector("#promoValueInput").value);

  if (!code || !Number.isFinite(discountValue)) {
    setDashboardMessage("Enter a valid promo code and value.", "error");
    return;
  }

  const { error } = await adminClient
    .from("promo_codes")
    .insert({
      code,
      discount_type: discountType,
      discount_value: discountValue,
      is_active: true
    });

  if (error) {
    setDashboardMessage(error.message, "error");
    return;
  }

  promoForm.reset();
  document.querySelector("#promoTypeInput").value = "percent";
  await loadPromos();
  setDashboardMessage("Promo code added.", "success");
});

unlockForm.addEventListener("submit", async event => {
  event.preventDefault();

  const code = document.querySelector("#unlockCodeInput").value.trim().toUpperCase();
  const pieceSlug = document.querySelector("#pieceSlugInput").value.trim();
  const maxUses = Number(document.querySelector("#maxUsesInput").value) || 1;

  if (!code || !pieceSlug) {
    setDashboardMessage("Enter an unlock code and piece slug.", "error");
    return;
  }

  const { error } = await adminClient
    .from("unlock_codes")
    .insert({
      code,
      piece_slug: pieceSlug,
      max_uses: maxUses,
      is_active: true
    });

  if (error) {
    setDashboardMessage(error.message, "error");
    return;
  }

  unlockForm.reset();
  document.querySelector("#maxUsesInput").value = 1;
  await loadUnlocks();
  setDashboardMessage("Unlock code added.", "success");
});


/* data-piece-access-change-bound */
document.addEventListener("change", event => {
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
  const promoToggle = event.target.closest("[data-toggle-promo]");
  const promoDelete = event.target.closest("[data-delete-promo]");
  const unlockToggle = event.target.closest("[data-toggle-unlock]");
  const unlockDelete = event.target.closest("[data-delete-unlock]");
  const paymentToggle = event.target.closest("[data-toggle-payment]");
  const pieceSave = event.target.closest("[data-save-piece]");
  const unlockGenerate = event.target.closest("[data-generate-unlock]");

  try {
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


    if (pieceSave) {
      const row = pieceSave.closest("[data-piece-row]");
      const slug = pieceSave.dataset.savePiece;
      const accessType = normalizeAdminAccess(row.querySelector("[data-piece-access]").value);
      const rawPrice = Number(row.querySelector("[data-piece-price]").value);
      const previewLimit = Number(row.querySelector("[data-piece-preview]").value) || 700;
      const isEnabled = row.querySelector("[data-piece-enabled]").checked;

      const payload = {
        is_enabled: isEnabled,
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
