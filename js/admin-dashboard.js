const dashboardMessage = document.querySelector("#dashboardMessage");
const promoForm = document.querySelector("#promoForm");
const unlockForm = document.querySelector("#unlockForm");
const promoList = document.querySelector("#promoList");
const unlockList = document.querySelector("#unlockList");
const paymentList = document.querySelector("#paymentList");

function setDashboardMessage(message, type = "") {
  if (!dashboardMessage) return;
  dashboardMessage.textContent = message || "";
  dashboardMessage.classList.remove("success", "error");
  if (type) dashboardMessage.classList.add(type);
}

function escapeAdminHTML(value) {
  return String(value ? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    await Promise.all([loadPromos(), loadUnlocks(), loadPayments()]);
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

document.addEventListener("click", async event => {
  const promoToggle = event.target.closest("[data-toggle-promo]");
  const promoDelete = event.target.closest("[data-delete-promo]");
  const unlockToggle = event.target.closest("[data-toggle-unlock]");
  const unlockDelete = event.target.closest("[data-delete-unlock]");
  const paymentToggle = event.target.closest("[data-toggle-payment]");

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
