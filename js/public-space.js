(function setupPublicSpace() {
  const root = document.querySelector("[data-public-space-root]");
  if (!root) return;

  const SESSION_KEY = "safespace_public_space_session";
  const ADMIN_HANDOFF_KEY = "safespace_public_space_admin";

  const LIMITS = {
    usernameMin: 3,
    usernameMax: 15,
    passwordMin: 6,
    passwordMax: 8,
    pinLength: 4,
    postMax: 1000
  };

  const POST_EDIT_WINDOW_MS = 30 * 60 * 1000;

  const PUBLIC_SPACE_BADGE_LIMIT = 3;
  const PUBLIC_SPACE_BADGE_OPTIONS = [
    { value: "Moderator", label: "Moderator", image: "Resources/moderator.png" },
    { value: "Admin", label: "Admin", image: "Resources/admin.png" },
    { value: "Beta Tester", label: "Beta Tester", image: "Resources/betatester.png" },
    { value: "Premium", label: "Premium", image: "Resources/premiumacc.png" }
  ];

  const COPY = {
    register: {
      title: "Create your Public Space",
      intro: "Start with a username, password, and 4-digit recovery key."
    },
    login: {
      title: "Welcome back",
      intro: "Login to post, heart, and return to your Public Space."
    }
  };

  const authScreen = root.querySelector("[data-ps-auth-screen]");
  const mainSpace = root.querySelector("[data-ps-main-space]");
  const authTitle = root.querySelector("[data-ps-auth-title]");
  const authIntro = root.querySelector("[data-ps-auth-intro]");
  const forms = Array.from(root.querySelectorAll("[data-ps-form]"));
  const authMessage = root.querySelector("[data-ps-auth-message]");
  const authSwitches = Array.from(root.querySelectorAll("[data-ps-show-auth]"));

  const forgotModal = document.querySelector("[data-ps-forgot-modal]");
  const forgotForm = document.querySelector("[data-ps-forgot-form]");
  const forgotMessage = document.querySelector("[data-ps-forgot-message]");
  const openForgot = root.querySelector("[data-ps-open-forgot]");
  const closeForgot = document.querySelector("[data-ps-close-forgot]");

  const composeModal = document.querySelector("[data-ps-compose-modal]");
  const composer = document.querySelector("[data-ps-composer]");
  const openCompose = root.querySelector("[data-ps-open-compose]");
  const closeCompose = document.querySelector("[data-ps-close-compose]");
  const postTextarea = composer ? composer.querySelector("textarea[name='post']") : null;
  const postButton = composer ? composer.querySelector("button[type='submit']") : null;
  const postCount = document.querySelector("[data-ps-post-count]");
  const composeMessage = document.querySelector("[data-ps-compose-message]");

  const menuToggle = root.querySelector("[data-ps-menu-toggle]");
  const menu = root.querySelector("[data-ps-menu]");
  const logoutButton = root.querySelector("[data-ps-logout]");
  const bellButton = root.querySelector("[data-ps-bell]");
  const scrollTopButton = document.querySelector("#scrollTopBtn");
  const feedStatus = root.querySelector("[data-ps-feed-status]");
  const feed = root.querySelector("[data-ps-feed]");

  let currentSession = readSession();
  let currentUser = currentSession ? currentSession.user : null;
  let isAdminMode = Boolean(currentUser && currentUser.is_admin);
  let latestPublicSpacePosts = [];
  let publicSpacePostFilter = { mode: "all", date: "" };
  let composeMode = "create";
  let editingPostId = null;

  function getClient() {
    const candidates = [
      "safeAdminClient",
      "safeSupabase",
      "safeSupabaseClient",
      "supabaseClient"
    ];

    for (const key of candidates) {
      if (window[key] && typeof window[key].rpc === "function") {
        return window[key];
      }
    }

    return null;
  }

  function setText(node, value) {
    if (node) node.textContent = value || "";
  }

  function setMessage(node, message, type) {
    if (!node) return;
    node.textContent = message || "";
    node.dataset.state = type || "info";
  }

  function setFeedStatus(message) {
    setText(feedStatus, message || "");
  }

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function validateUsername(username) {
    if (username.length < LIMITS.usernameMin) return "Username needs at least 3 characters.";
    if (username.length > LIMITS.usernameMax) return "Username can only be up to 15 characters.";
    if (!/^[a-z0-9_]+$/.test(username)) return "Use letters, numbers, and underscore only.";
    return "";
  }

  function validatePassword(password) {
    const value = String(password || "");
    if (value.length < LIMITS.passwordMin) return "Password needs at least 6 characters.";
    if (value.length > LIMITS.passwordMax) return "Password can only be up to 8 characters.";
    return "";
  }

  function validatePin(pin) {
    const value = String(pin || "");
    if (!/^[0-9]{4}$/.test(value)) return "PIN/key must be exactly 4 digits.";
    return "";
  }

  function getErrorMessage(error) {
    const raw = error && error.message ? error.message : String(error || "Something went wrong.");
    return raw
      .replace(/^Error:\s*/i, "")
      .replace(/^ERROR:\s*/i, "")
      .replace(/\s*\(SQLSTATE.*?\)\s*$/i, "")
      .trim() || "Something went wrong.";
  }

  function readSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.session_token || !parsed.user) return null;

      const expiresAt = parsed.expires_at ? Date.parse(parsed.expires_at) : 0;
      if (expiresAt && Date.now() >= expiresAt) {
        window.localStorage.removeItem(SESSION_KEY);
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function saveSession(payload) {
    currentSession = {
      session_token: payload.session_token,
      expires_at: payload.expires_at,
      user: payload.user
    };
    currentUser = payload.user;
    isAdminMode = Boolean(currentUser && currentUser.is_admin);

    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    } catch (error) {}
  }

  function clearSession() {
    currentSession = null;
    currentUser = null;
    isAdminMode = false;

    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(ADMIN_HANDOFF_KEY);
    } catch (error) {}
  }

  async function rpc(functionName, params) {
    const client = getClient();

    if (!client) {
      throw new Error("Database connection is not ready. Please refresh the page.");
    }

    const response = await client.rpc(functionName, params || {});
    if (response.error) throw response.error;
    return response.data;
  }

  function sessionToken() {
    return currentSession && currentSession.session_token ? currentSession.session_token : "";
  }

  function enforceNumericPinFields() {
    const pinInputs = Array.from(document.querySelectorAll("input[name='pin'], [data-ps-pin-only]"));

    pinInputs.forEach(input => {
      input.type = "text";
      input.inputMode = "numeric";
      input.pattern = "[0-9]*";
      input.maxLength = LIMITS.pinLength;
      input.setAttribute("autocomplete", "off");
      input.setAttribute("data-ps-pin-only", "");

      input.addEventListener("beforeinput", event => {
        if (!event.data) return;
        if (!/^[0-9]+$/.test(event.data)) {
          event.preventDefault();
        }
      });

      input.addEventListener("input", () => {
        input.value = String(input.value || "")
          .replace(/\D+/g, "")
          .slice(0, LIMITS.pinLength);
      });

      input.addEventListener("paste", event => {
        event.preventDefault();
        const pasted = (event.clipboardData || window.clipboardData).getData("text");
        input.value = String(pasted || "")
          .replace(/\D+/g, "")
          .slice(0, LIMITS.pinLength);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }

  function enhancePasswordFields() {
    const passwordInputs = Array.from(document.querySelectorAll("input[type='password']:not([name='pin'])"));

    passwordInputs.forEach(input => {
      if (input.closest(".ps-password-field")) return;

      const wrapper = document.createElement("span");
      wrapper.className = "ps-password-field";

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const toggle = document.createElement("button");
      toggle.className = "ps-password-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-label", "Show password");
      toggle.setAttribute("title", "Show password");
      toggle.dataset.state = "hidden";
      toggle.innerHTML = '<span class="ps-eye-icon" aria-hidden="true"></span>';

      toggle.addEventListener("click", () => {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        toggle.dataset.state = isHidden ? "shown" : "hidden";
        toggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
        toggle.setAttribute("title", isHidden ? "Hide password" : "Show password");
      });

      wrapper.appendChild(toggle);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (error) {
      return "";
    }
  }

  function renderEmptyFeed(message) {
    if (!feed) return;

    feed.innerHTML = `
      <article class="ps-empty-state">
        <h2>No public posts yet.</h2>
        <p>${escapeHtml(message || "Posts, comments, hearts, and notifications will appear here.")}</p>
      </article>
    `;
  }

  function localDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (!date || Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function offsetDateKey(offsetDays) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return localDateKey(date);
  }

  function filterDateDisplayLabel(dateKey) {
    const clean = String(dateKey || "").trim();
    if (!clean) return "";

    const date = new Date(`${clean}T00:00:00`);
    if (!date || Number.isNaN(date.getTime())) return clean;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function openPostFilterDatePicker(input) {
    if (!input) return;

    try {
      input.focus({ preventScroll: true });
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.click();
      }
    } catch (error) {
      try {
        input.click();
      } catch (clickError) {}
    }
  }

  function ensurePostFilterControls() {
    const feedCard = root.querySelector(".ps-feed-card") || (feed ? feed.closest("section, article, div") : null);
    if (!feedCard || feedCard.querySelector("[data-ps-post-filter]")) return;

    const filter = document.createElement("div");
    filter.className = "ps-post-filter ps-post-filter-compact";
    filter.setAttribute("data-ps-post-filter", "");
    filter.innerHTML = `
      <label class="ps-post-filter-select-label">
        <span>Filter posts</span>
        <select data-ps-post-filter-mode aria-label="Filter posts">
          <option value="all">View all posts</option>
          <option value="today">Today only</option>
          <option value="yesterday">Yesterday</option>
          <option value="custom">Custom date</option>
        </select>
      </label>
      <input class="ps-post-filter-date-input" type="date" data-ps-post-filter-date aria-label="Choose custom post date" />
    `;

    const headings = Array.from(feedCard.querySelectorAll("h1, h2, h3, strong"));
    const heading = headings.find(node => /latest posts/i.test(node.textContent || "")) || headings[0];

    if (heading) heading.insertAdjacentElement("afterend", filter);
    else feedCard.prepend(filter);
  }

  function postMatchesFilter(post) {
    const mode = publicSpacePostFilter.mode || "all";
    if (mode === "all") return true;

    const postDate = localDateKey(post && post.created_at);
    if (!postDate) return false;

    if (mode === "today") return postDate === offsetDateKey(0);
    if (mode === "yesterday") return postDate === offsetDateKey(-1);
    if (mode === "custom") return Boolean(publicSpacePostFilter.date) && postDate === publicSpacePostFilter.date;

    return true;
  }

  function applyPostFilter(posts) {
    return (Array.isArray(posts) ? posts : []).filter(postMatchesFilter);
  }

  function syncPostFilterControls() {
    const filter = root.querySelector("[data-ps-post-filter]");
    if (!filter) return;

    const modeSelect = filter.querySelector("[data-ps-post-filter-mode]");
    const dateInput = filter.querySelector("[data-ps-post-filter-date]");
    const customOption = modeSelect ? modeSelect.querySelector("option[value='custom']") : null;

    if (modeSelect) modeSelect.value = publicSpacePostFilter.mode || "all";
    if (dateInput) dateInput.value = publicSpacePostFilter.date || "";

    if (customOption) {
      customOption.textContent = publicSpacePostFilter.date
        ? `Custom date: ${filterDateDisplayLabel(publicSpacePostFilter.date)}`
        : "Custom date";
    }
  }

  function refreshPostFilterView() {
    ensurePostFilterControls();
    syncPostFilterControls();
    renderPosts(latestPublicSpacePosts, { skipCache: true });
  }

  function handlePostFilterChange(event) {
    const modeSelect = event.target.closest("[data-ps-post-filter-mode]");
    const changedDateInput = event.target.closest("[data-ps-post-filter-date]");
    if (!modeSelect && !changedDateInput) return;

    const filter = root.querySelector("[data-ps-post-filter]");
    const activeMode = filter ? filter.querySelector("[data-ps-post-filter-mode]") : null;
    const activeDate = filter ? filter.querySelector("[data-ps-post-filter-date]") : null;

    if (modeSelect) {
      const selectedMode = activeMode ? activeMode.value : "all";

      if (selectedMode === "custom") {
        publicSpacePostFilter.mode = "custom";

        if (activeDate && activeDate.value) {
          publicSpacePostFilter.date = activeDate.value;
          refreshPostFilterView();
          return;
        }

        syncPostFilterControls();
        window.setTimeout(() => openPostFilterDatePicker(activeDate), 0);
        return;
      }

      publicSpacePostFilter.mode = selectedMode;
      publicSpacePostFilter.date = "";
      refreshPostFilterView();
      return;
    }

    if (changedDateInput) {
      if (changedDateInput.value) {
        publicSpacePostFilter.mode = "custom";
        publicSpacePostFilter.date = changedDateInput.value;
      } else {
        publicSpacePostFilter.mode = "all";
        publicSpacePostFilter.date = "";
      }

      refreshPostFilterView();
    }
  }

  function renderPosts(posts) {
    if (!feed) return;

    const list = Array.isArray(posts) ? posts : [];
    latestPublicSpacePosts = list;

    if (!list.length) {
      renderEmptyFeed();
      if (currentPublicSpaceRoute() === "profile") {
        renderProfileOwnPosts(list);
      }
      return;
    }

    feed.innerHTML = list.map(post => {
      const author = post.author || {};
      const username = author.username || "someone";
      const badge = author.badge_label ? `<span>${escapeHtml(author.badge_label)}</span>` : "";
      const premium = author.is_premium ? `<span>Premium</span>` : "";
      const hiddenLabel = post.is_hidden ? `<span>Hidden</span>` : "";
      const heartLabel = post.hearted_by_me ? "? Hearted" : "? Heart";
      const manageButtons = post.can_manage
        ? `<button type="button" data-ps-delete-post="${escapeHtml(post.id)}">Delete post</button>`
        : "";
      const adminButtons = isAdminMode
        ? `<button type="button" data-ps-toggle-hidden="${escapeHtml(post.id)}" data-hidden="${post.is_hidden ? "true" : "false"}">${post.is_hidden ? "Unhide post" : "Hide post"}</button>`
        : "";

      return `
        <article class="ps-post-card ${post.is_hidden ? "is-hidden-by-admin" : ""}" data-post-id="${escapeHtml(post.id)}">
          <div class="ps-post-meta">
            <strong>@${escapeHtml(username)}</strong>
            <span>${[premium, badge, hiddenLabel, escapeHtml(formatDate(post.created_at))].filter(Boolean).join(" ")}</span>
          </div>
          <p>${escapeHtml(post.body)}</p>
          <div class="ps-post-actions">
            <button type="button" data-ps-heart-post="${escapeHtml(post.id)}">${heartLabel} � ${Number(post.heart_count || 0)}</button>
            <button type="button" data-ps-comments-post="${escapeHtml(post.id)}">Comment � ${Number(post.comment_count || 0)}</button>
            ${manageButtons}
            ${adminButtons}
          </div>
        </article>
      `;
    }).join("");

    enhancePostCards(feed, list);
    polishPostCards(feed, list);
    if (currentPublicSpaceRoute() === "profile") {
      renderProfileOwnPosts(list);
    }
  }

  function ensureMenuButton(key, label, adminOnly) {
    if (!menu) return null;

    let button = menu.querySelector(`[data-ps-menu-item='${key}']`);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset.psMenuItem = key;
      button.textContent = label;

      if (adminOnly) button.dataset.psAdminMenuItem = "";

      const backLink = menu.querySelector("a");
      menu.insertBefore(button, backLink || logoutButton || null);
    }

    if (adminOnly) button.hidden = !isAdminMode;

    return button;
  }

  function ensureMenuLink(key, label, href, adminOnly) {
    if (!menu) return null;

    let link = menu.querySelector(`[data-ps-menu-link='${key}']`);

    if (!link) {
      link = document.createElement("a");
      link.href = href;
      link.dataset.psMenuLink = key;
      link.textContent = label;

      if (adminOnly) link.dataset.psAdminMenuItem = "";

      const backLink = menu.querySelector("a[href='index.html']") || menu.querySelector("a");
      menu.insertBefore(link, backLink || logoutButton || null);
    }

    if (adminOnly) link.hidden = !isAdminMode;

    return link;
  }

  function syncMenuRouteItems(route) {
    if (!menu) return;

    ensureMenuButton("home", "Public Space", false);

    const cleanRoute = normalizePublicSpaceRoute(route || currentPublicSpaceRoute());
    const currentItemByRoute = {
      "home": "home",
      "profile": "profile",
      "settings": "settings",
      "admin-overview": "admin",
      "admin-users": "admin-users",
      "admin-posts": "admin-posts",
      "admin-reports": "admin-reports",
      "admin-space-settings": "admin-space-settings"
    };

    const currentKey = currentItemByRoute[cleanRoute] || "home";

    menu.querySelectorAll("[data-ps-menu-item]").forEach(item => {
      const key = item.dataset.psMenuItem;
      const isAdminItem = item.hasAttribute("data-ps-admin-menu-item");
      const hiddenForRole = isAdminItem && !isAdminMode;
      const hiddenForRoute = key === currentKey;

      item.hidden = hiddenForRole || hiddenForRoute;
    });
  }
  function ensureControlScreen() {
    if (!mainSpace || mainSpace.querySelector("[data-ps-control-screen]")) return;

    mainSpace.insertAdjacentHTML("beforeend", `
      <section class="ps-admin-tools ps-admin-screen ps-control-screen" data-ps-control-screen hidden tabindex="-1" aria-label="Public Space controls">
        <div class="ps-admin-screen-top">
          <div>
            <p class="eyebrow" data-ps-control-eyebrow>Public Space</p>
            <h2 data-ps-control-title>Controls</h2>
            <p data-ps-control-intro>Manage your Public Space account.</p>
          </div>
        </div>
        <div class="ps-control-results" data-ps-control-results></div>
      </section>
    `);
  }

  function openControlScreen(title, intro, body, eyebrow) {
    ensureControlScreen();

    const screen = root.querySelector("[data-ps-control-screen]");
    if (!screen) return;

    const eyebrowNode = screen.querySelector("[data-ps-control-eyebrow]");
    const titleNode = screen.querySelector("[data-ps-control-title]");
    const introNode = screen.querySelector("[data-ps-control-intro]");
    const resultsNode = screen.querySelector("[data-ps-control-results]");

    setText(eyebrowNode, eyebrow || "Public Space");
    setText(titleNode, title || "Controls");
    setText(introNode, intro || "");
    if (resultsNode) resultsNode.innerHTML = body || "";

    screen.hidden = false;
    screen.setAttribute("aria-hidden", "false");

    screen.focus({ preventScroll: true });
  }

  function closeControlScreen() {
    const screen = root.querySelector("[data-ps-control-screen]");
    if (!screen) return;

    screen.hidden = true;
    screen.setAttribute("aria-hidden", "true");
  }


  function usernameAvailabilityMessage(input) {
    if (!input) return null;

    const wrapper = input.closest("label") || input.parentElement;
    if (!wrapper) return null;

    let node = wrapper.querySelector("[data-ps-username-check]");
    if (!node) {
      node = document.createElement("small");
      node.className = "ps-username-check";
      node.dataset.psUsernameCheck = "";
      wrapper.appendChild(node);
    }

    return node;
  }

  function setUsernameAvailability(input, message, state) {
    const node = usernameAvailabilityMessage(input);
    if (!node) return;

    node.textContent = message || "";
    node.dataset.state = state || "";
    node.hidden = !message;
  }

  async function checkRegisterUsername(input) {
    if (!input) return false;

    const value = input.value.trim().toLowerCase();
    input.value = value;

    if (!value) {
      setUsernameAvailability(input, "", "");
      return false;
    }

    const usernameError = validateUsername(value);
    if (usernameError) {
      setUsernameAvailability(input, usernameError, "error");
      return false;
    }

    setUsernameAvailability(input, "Checking username...", "checking");

    try {
      const result = await rpc("check_public_space_username", {
        input_username: value
      });

      if (result && result.available) {
        setUsernameAvailability(input, "Username is available.", "success");
        return true;
      }

      setUsernameAvailability(input, (result && result.message) || "Username is already taken.", "error");
      return false;
    } catch (error) {
      setUsernameAvailability(input, "Could not verify username yet. Please try again.", "error");
      return false;
    }
  }

  function setupUsernameAvailabilityChecker() {
    const registerForm = Array.from(forms).find(form => {
      return (form.dataset.psForm || "").toLowerCase() === "register";
    });

    if (!registerForm) return;

    const input = registerForm.querySelector('input[name="username"], input[autocomplete="username"], input[type="text"]');
    if (!input || input.dataset.psUsernameCheckerReady === "true") return;

    input.dataset.psUsernameCheckerReady = "true";

    let usernameTimer = null;
    input.addEventListener("input", () => {
      window.clearTimeout(usernameTimer);
      usernameTimer = window.setTimeout(() => {
        checkRegisterUsername(input);
      }, 350);
    });

    input.addEventListener("blur", () => {
      window.clearTimeout(usernameTimer);
      checkRegisterUsername(input);
    });
  }
  function setMenuOpen(open) {
    if (!menu) return;

    const shouldOpen = Boolean(open);
    const toggle = root.querySelector("[data-ps-menu-toggle]");

    menu.hidden = !shouldOpen;
    menu.setAttribute("aria-hidden", shouldOpen ? "false" : "true");

    if (toggle) {
      toggle.classList.toggle("is-open", shouldOpen);
      toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      toggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");
    }
  }
  function normalizeBadgeValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function splitBadgeLabels(value) {
    return String(value || "")
      .split(/[,|]/)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, PUBLIC_SPACE_BADGE_LIMIT);
  }

  function badgeOptionFor(label) {
    const clean = normalizeBadgeValue(label);
    return PUBLIC_SPACE_BADGE_OPTIONS.find(option => normalizeBadgeValue(option.value) === clean || normalizeBadgeValue(option.label) === clean) || null;
  }

  function profileBadgeItems(user) {
    const source = user || {};
    const items = [];
    const seen = new Set();

    const pushBadge = (label, className) => {
      const cleanLabel = String(label || "").trim();
      const key = normalizeBadgeValue(cleanLabel);
      if (!cleanLabel || !key || key === "active" || seen.has(key)) return;

      const option = badgeOptionFor(cleanLabel);
      seen.add(key);
      items.push({
        label: option ? option.label : cleanLabel,
        className: className || "",
        image: option ? option.image : ""
      });
    };

    if (source.is_admin) pushBadge("Admin");
    if (source.is_premium) pushBadge("Premium");
    splitBadgeLabels(source.badge_label).forEach(label => pushBadge(label));
    if (source.is_disabled) pushBadge("Disabled", "is-danger");

    return items;
  }

  function renderBadgeChip(badge, modifier) {
    const cleanLabel = String((badge && badge.label) || "").trim();
    const extraClass = modifier ? ` ${modifier}` : "";
    const image = badge && badge.image
      ? `<img src="${escapeHtml(badge.image)}" alt="" aria-hidden="true" loading="lazy" />`
      : `<span class="ps-badge-fallback-icon" aria-hidden="true">${escapeHtml(cleanLabel.charAt(0).toUpperCase() || "?")}</span>`;

    return `<span class="ps-badge-chip ${escapeHtml((badge && badge.className) || "")}${extraClass}" title="${escapeHtml(cleanLabel)}" data-ps-badge-label="${escapeHtml(cleanLabel)}" tabindex="0" role="img" aria-label="${escapeHtml(cleanLabel)}">${image}<span class="ps-badge-text">${escapeHtml(cleanLabel)}</span></span>`;
  }

  function renderProfileBadges(user) {
    const badges = profileBadgeItems(user);
    if (!badges.length) return "";

    return `
      <div class="ps-control-chip-row ps-profile-badges" aria-label="Profile badges">
        ${badges.map(badge => renderBadgeChip(badge)).join("")}
      </div>
    `;
  }

  function renderPostBadges(user) {
    const badges = profileBadgeItems(user).filter(badge => normalizeBadgeValue(badge.label) !== "disabled");
    if (!badges.length) return "";

    return `<span class="ps-post-badges" data-ps-post-badges>${badges.map(badge => renderBadgeChip(badge, "is-mini")).join("")}</span>`;
  }

  function isCurrentUserPost(post) {
    if (!currentUser || !post) return false;

    const author = post.author || {};
    const currentId = currentUser.id ? String(currentUser.id) : "";
    const authorId = author.id ? String(author.id) : "";

    if (currentId && authorId && currentId === authorId) return true;

    return normalizeUsername(author.username) === normalizeUsername(currentUser.username);
  }

  function currentUserPosts(posts) {
    return (Array.isArray(posts) ? posts : [])
      .filter(isCurrentUserPost)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function postDateDisplayLabel(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;

    if (diffMs >= 0 && diffMs < minuteMs) return "Just now";
    if (diffMs >= 0 && diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / minuteMs))}m`;
    if (diffMs >= 0 && diffMs < 24 * hourMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}h`;

    const today = startOfLocalDay(now);
    const postedDay = startOfLocalDay(date);
    const dayDiff = Math.round((today.getTime() - postedDay.getTime()) / (24 * hourMs));

    if (dayDiff === 1) return "Yesterday";

    const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (date.getFullYear() === now.getFullYear()) return monthDay;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function polishPostCards(container, posts) {
    if (!container) return;

    const sourcePosts = Array.isArray(posts) ? posts : [];
    const byId = new Map(sourcePosts.map(post => [String(post.id), post]));

    container.querySelectorAll(".ps-post-card[data-post-id]").forEach(card => {
      const postId = String(card.dataset.postId || "");
      const post = byId.get(postId) || postById(postId);
      if (!post) return;

      card.classList.add("ps-post-card-polished");

      const meta = card.querySelector(".ps-post-meta");
      if (!meta) return;

      const authorNode = meta.querySelector("strong");
      if (authorNode && !meta.querySelector("[data-ps-post-badges]")) {
        authorNode.insertAdjacentHTML("afterend", renderPostBadges(post.author || post));
      }

      const dateNode = Array.from(meta.children).find(node => {
        if (!node || node.nodeType !== 1) return false;
        if (node.matches("[data-ps-post-badges], [data-ps-post-more-wrap], .ps-post-more, .ps-badge-chip")) return false;
        return node.tagName.toLowerCase() === "span";
      });

      if (dateNode) {
        dateNode.className = "ps-post-date";
        dateNode.textContent = postDateDisplayLabel(post.created_at);
      }

      meta.querySelectorAll("[data-ps-post-more-wrap]").forEach(node => node.remove());
      Array.from(card.children).forEach(node => {
        if (node.matches && node.matches("[data-ps-post-more-wrap], .ps-post-more")) node.remove();
      });

      const menuMarkup = postMenuHtml(post);
      if (menuMarkup) {
        card.insertAdjacentHTML("beforeend", menuMarkup);
      }
    });
  }

  function handleBadgeLabelToggle(event) {
    const chip = event.target.closest("[data-ps-badge-label]");
    if (!chip || chip.closest("[data-ps-badge-picker]")) return;

    chip.classList.toggle("is-label-open");
    window.clearTimeout(chip._psBadgeTimer);
    chip._psBadgeTimer = window.setTimeout(() => chip.classList.remove("is-label-open"), 1800);
  }
  function postAgeMs(post) {
    const created = post && post.created_at ? new Date(post.created_at).getTime() : 0;
    if (!created || Number.isNaN(created)) return Number.POSITIVE_INFINITY;
    return Date.now() - created;
  }

  function canEditPost(post) {
    return Boolean(currentUser && post && isCurrentUserPost(post) && postAgeMs(post) <= POST_EDIT_WINDOW_MS);
  }

  function postById(postId) {
    const cleanId = String(postId || "");
    return latestPublicSpacePosts.find(post => String(post.id) === cleanId) || null;
  }

  function closePostMenus(exceptMenu) {
    root.querySelectorAll("[data-ps-post-menu]").forEach(menuNode => {
      if (exceptMenu && menuNode === exceptMenu) return;
      menuNode.hidden = true;
    });

    root.querySelectorAll("[data-ps-post-more]").forEach(button => {
      const menuNode = button.closest("[data-ps-post-more-wrap]")?.querySelector("[data-ps-post-menu]");
      if (exceptMenu && menuNode === exceptMenu) return;
      button.setAttribute("aria-expanded", "false");
    });
  }

  function postMenuHtml(post) {
    if (!post || !post.id) return "";

    const postId = escapeHtml(post.id);
    const editButton = canEditPost(post)
      ? `<button type="button" role="menuitem" data-ps-post-menu-action="edit" data-ps-edit-post="${postId}">Edit post</button>`
      : "";

    const deleteButton = post.can_manage
      ? `<button type="button" role="menuitem" data-ps-post-menu-action="delete" data-ps-delete-post="${postId}">Delete post</button>`
      : "";

    const hideButton = isAdminMode
      ? `<button type="button" role="menuitem" data-ps-post-menu-action="hide" data-ps-toggle-hidden="${postId}" data-hidden="${post.is_hidden ? "true" : "false"}">${post.is_hidden ? "Unhide post" : "Hide post"}</button>`
      : "";

    const options = [editButton, deleteButton, hideButton].filter(Boolean).join("");
    if (!options) return "";

    return `
      <span class="ps-post-more" data-ps-post-more-wrap>
        <button class="ps-post-more-toggle" type="button" data-ps-post-more aria-haspopup="menu" aria-expanded="false" aria-label="Post options">•••</button>
        <span class="ps-post-more-menu" data-ps-post-menu hidden role="menu">
          ${options}
        </span>
      </span>
    `;
  }

  function enhancePostCards(container, posts) {
    if (!container) return;

    const sourcePosts = Array.isArray(posts) ? posts : [];
    const byId = new Map(sourcePosts.map(post => [String(post.id), post]));

    container.querySelectorAll(".ps-post-card[data-post-id]").forEach(card => {
      const postId = String(card.dataset.postId || "");
      const post = byId.get(postId) || postById(postId);
      if (!post) return;

      const heartButton = card.querySelector("[data-ps-heart-post]");
      if (heartButton) {
        heartButton.textContent = `${post.hearted_by_me ? "\u2764\uFE0F" : "\uD83E\uDD0D"} · ${Number(post.heart_count || 0)}`;
        heartButton.setAttribute("aria-label", post.hearted_by_me ? "Remove heart" : "Heart this post");
      }

      const commentButton = card.querySelector("[data-ps-comments-post]");
      if (commentButton) {
        commentButton.textContent = `\uD83D\uDCAC · ${Number(post.comment_count || 0)}`;
        commentButton.setAttribute("aria-label", "View comments");
      }

      const cardMeta = card.querySelector(".ps-post-meta");
      const authorNode = cardMeta ? cardMeta.querySelector("strong") : null;
      if (authorNode && cardMeta && !cardMeta.querySelector("[data-ps-post-badges]")) {
        authorNode.insertAdjacentHTML("afterend", renderPostBadges(post.author || post));
      }

      const oldMenu = card.querySelector("[data-ps-post-more-wrap]");
      if (oldMenu) oldMenu.remove();

      const menuMarkup = postMenuHtml(post);
      if (!menuMarkup) return;

      const meta = card.querySelector(".ps-post-meta");
      const dateNode = meta ? meta.querySelector("span") : null;
      if (dateNode) {
        dateNode.insertAdjacentHTML("beforeend", menuMarkup);
      }
    });
  }
  function renderProfilePostCard(post) {
    const hiddenLabel = post.is_hidden ? `<span>Hidden</span>` : "";
    const heartLabel = post.hearted_by_me ? "Hearted" : "Heart";
    const manageButtons = post.can_manage
      ? `<button type="button" data-ps-delete-post="${escapeHtml(post.id)}">Delete post</button>`
      : "";
    const adminButtons = isAdminMode
      ? `<button type="button" data-ps-toggle-hidden="${escapeHtml(post.id)}" data-hidden="${post.is_hidden ? "true" : "false"}">${post.is_hidden ? "Unhide post" : "Hide post"}</button>`
      : "";

    return `
      <article class="ps-post-card ps-profile-post-card ${post.is_hidden ? "is-hidden-by-admin" : ""}" data-post-id="${escapeHtml(post.id)}">
        <div class="ps-post-meta">
          <strong>@${escapeHtml(currentUser.username || "user")}</strong>
          <span>${[hiddenLabel, escapeHtml(formatDate(post.created_at))].filter(Boolean).join(" ")}</span>
        </div>
        <p>${escapeHtml(post.body)}</p>
        <div class="ps-post-actions">
          <button type="button" data-ps-heart-post="${escapeHtml(post.id)}">${heartLabel} · ${Number(post.heart_count || 0)}</button>
          <button type="button" data-ps-comments-post="${escapeHtml(post.id)}">Comment · ${Number(post.comment_count || 0)}</button>
          ${manageButtons}
          ${adminButtons}
        </div>
      </article>
    `;
  }

  function renderProfileOwnPosts(posts) {
    const listNode = root.querySelector("[data-ps-profile-post-list]");
    if (!listNode) return;

    const ownPosts = currentUserPosts(posts || latestPublicSpacePosts);

    if (!currentUser || !ownPosts.length) {
      listNode.innerHTML = "";
      return;
    }

    listNode.innerHTML = `
      <div class="ps-profile-posts-head">
        <strong>Your posts</strong>
        <span>${ownPosts.length} ${ownPosts.length === 1 ? "post" : "posts"}</span>
      </div>
      ${ownPosts.map(renderProfilePostCard).join("")}
    `;
    enhancePostCards(listNode, ownPosts);
    polishPostCards(listNode, ownPosts);
  }

  function updateProfileComposerCounter(form) {
    if (!form) return;
    const textarea = form.querySelector("textarea[name='post']");
    const counter = form.querySelector("[data-ps-profile-post-count]");
    const button = form.querySelector("button[type='submit']");
    const length = textarea ? textarea.value.length : 0;

    if (counter) counter.textContent = `${length}/${LIMITS.postMax}`;
    if (button) button.disabled = length < 1 || length > LIMITS.postMax;
  }

  function renderProfileScreen() {
    const user = currentUser || {};
    const username = user.username || "guest";
    const initial = String(username || "@").charAt(0).toUpperCase() || "@";
    const promptText = `What's on your mind, @${username}?`;
    const profileIntro = currentUser
      ? `@${username}'s Public Space profile.`
      : "Login to see your profile.";

    openControlScreen(
      "Profile",
      profileIntro,
      `
        <section class="ps-profile-page" aria-label="Public Space profile">
          <header class="ps-profile-hero">
            <div class="ps-profile-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
            <div class="ps-profile-heading">
              <strong>@${escapeHtml(username)}</strong>
              <span>Public Space profile</span>
              ${renderProfileBadges(user)}
            </div>
          </header>

          ${currentUser ? `
            <button class="ps-profile-composer-trigger" type="button" data-ps-profile-open-compose aria-label="Create a profile post">
              <span>${escapeHtml(promptText)}</span>
            </button>
          ` : ""}

          <div class="ps-profile-post-list" data-ps-profile-post-list></div>
        </section>
      `,
      "Profile"
    );

    renderProfileOwnPosts(latestPublicSpacePosts);
  }

  function renderSettingsScreen() {
    openControlScreen(
      "Settings",
      "Quick controls for this Public Space session.",
      `
        <div class="ps-control-card">
          <strong>Session</strong>
          <span>${currentUser ? `Signed in as @${escapeHtml(currentUser.username)}.` : "Not signed in."}</span>
        </div>
        <div class="ps-control-card">
          <strong>Privacy and safety</strong>
          <span>Admins can disable accounts, reset passwords, assign badges, and moderate posts. More viewer-facing settings will be connected after admin tools are stable.</span>
        </div>
        <div class="ps-control-card">
          <strong>Display</strong>
          <span>The current Public Space layout is using the modern futuristic compact mode.</span>
        </div>
      `,
      "Menu"
    );
  }

  function renderNotificationsScreen() {
    openControlScreen(
      "Notifications",
      "Public Space notifications will appear here.",
      `
        <div class="ps-control-card">
          <strong>No notification center yet.</strong>
          <span>Bell UI is ready. Database-backed notifications will be connected after admin controls and viewer flow are stable.</span>
        </div>
        <div class="ps-control-card">
          <strong>Planned alerts</strong>
          <span>New comments, hearts, admin notices, disabled-account notices, and moderation updates.</span>
        </div>
      `,
      "Bell"
    );
  }

  function ensureAdminTools() {
    ensureMenuButton("admin", "Admin overview", true);
    ensureMenuButton("admin-users", "Registered users", true);
    ensureMenuButton("admin-posts", "Post moderation", true);
    ensureMenuButton("admin-reports", "Reports", true);
    ensureMenuButton("admin-space-settings", "Space settings", true);
    ensureMenuLink("private-space", "Back to private space", "admin.html", true);
    if (menu) {
      menu.querySelectorAll("[data-ps-admin-menu-item]").forEach(item => {
        item.hidden = !isAdminMode;
      });
    }

    ensureControlScreen();

    if (!mainSpace || mainSpace.querySelector("[data-ps-admin-tools]:not([data-ps-control-screen])")) return;

    mainSpace.insertAdjacentHTML("beforeend", `
      <section class="ps-admin-tools ps-admin-screen" data-ps-admin-tools hidden tabindex="-1" aria-label="Public Space admin controls">
        <div class="ps-admin-screen-top">
          <div>
            <p class="eyebrow">Admin mode</p>
            <h2>Public Space controls</h2>
            <p data-ps-admin-message>Manage users and moderate posts after logging in with a Public Space admin account.</p>
          </div>
        </div>
        <div class="ps-admin-tool-grid">
          <button type="button" data-ps-admin-action="overview">Admin overview</button>
          <button type="button" data-ps-admin-action="users">Registered users</button>
          <button type="button" data-ps-admin-action="posts">Post moderation</button>
          <button type="button" data-ps-admin-action="reports">Reports</button>
          <button type="button" data-ps-admin-action="settings">Space settings</button>
        </div>
        <div class="ps-admin-results" data-ps-admin-results></div>
      </section>
    `);
  }

  function setAdminMode(enabled) {
    isAdminMode = Boolean(enabled && currentUser && currentUser.is_admin);
    document.body.classList.toggle("ps-admin-mode", isAdminMode);
    root.classList.toggle("is-admin-mode", isAdminMode);

    ensureAdminTools();

    if (menu) {
      menu.querySelectorAll("[data-ps-admin-menu-item]").forEach(item => {
        item.hidden = !isAdminMode;
      });
    }

    const adminTools = root.querySelector("[data-ps-admin-tools]:not([data-ps-control-screen])");
    if (adminTools && !isAdminMode) adminTools.hidden = true;
    syncMenuRouteItems(currentPublicSpaceRoute());
  }

  function openAdminScreen(initialAction) {
    if (!isAdminMode) {
      setFeedStatus("Login with a Public Space admin account first.");
      return;
    }

    ensureAdminTools();
    closeControlScreen();

    const adminTools = root.querySelector("[data-ps-admin-tools]:not([data-ps-control-screen])");
    if (!adminTools) return;

    adminTools.hidden = false;
    adminTools.setAttribute("aria-hidden", "false");

    adminTools.focus({ preventScroll: true });

    if (initialAction) {
      window.setTimeout(() => {
        const actionButton = adminTools.querySelector(`[data-ps-admin-action='${initialAction}']`);
        if (actionButton) actionButton.click();
      }, 0);
    }
  }

  function closeAdminScreen() {
    const adminTools = root.querySelector("[data-ps-admin-tools]:not([data-ps-control-screen])");
    if (!adminTools) return;

    adminTools.hidden = true;
    adminTools.setAttribute("aria-hidden", "true");
  }


  function normalizePublicSpaceRoute(route) {
    const cleanRoute = String(route || "home").replace(/^#/, "").trim().toLowerCase();

    const allowedRoutes = new Set([
      "home",
      "profile",
      "settings",
      "notifications",
      "admin-overview",
      "admin-users",
      "admin-posts",
      "admin-reports",
      "admin-space-settings"
    ]);

    return allowedRoutes.has(cleanRoute) ? cleanRoute : "home";
  }

  function currentPublicSpaceRoute() {
    return normalizePublicSpaceRoute(window.location.hash || "home");
  }

  function publicSpaceHomeNodes() {
    return [
      root.querySelector(".ps-space-heading"),
      root.querySelector("[data-ps-open-compose]"),
      root.querySelector(".ps-feed-card")
    ].filter(Boolean);
  }

  function setPublicSpaceHomeVisible(visible) {
    publicSpaceHomeNodes().forEach(node => {
      node.hidden = !visible;
    });
  }

  function setPublicSpaceRouteMode(route) {
    const cleanRoute = normalizePublicSpaceRoute(route);
    const isHomeRoute = cleanRoute === "home";

    document.body.classList.toggle("ps-route-screen-active", !isHomeRoute);
    root.classList.toggle("ps-route-screen-active", !isHomeRoute);
    root.dataset.psRoute = cleanRoute;

    setPublicSpaceHomeVisible(isHomeRoute);
    syncMenuRouteItems(cleanRoute);
  }

  async function renderPublicSpaceRoute(route) {
    const cleanRoute = normalizePublicSpaceRoute(route);

    if (cleanRoute === "home") {
      setPublicSpaceRouteMode("home");
      closeAdminScreen();
      closeControlScreen();
      return;
    }

    if (cleanRoute === "profile") {
      setPublicSpaceRouteMode(cleanRoute);
      closeAdminScreen();
      renderProfileScreen();
      return;
    }

    if (cleanRoute === "settings") {
      setPublicSpaceRouteMode(cleanRoute);
      closeAdminScreen();
      renderSettingsScreen();
      return;
    }

    if (cleanRoute === "notifications") {
      setPublicSpaceRouteMode(cleanRoute);
      closeAdminScreen();
      renderNotificationsScreen();
      return;
    }

    const adminRoutes = {
      "admin-overview": "overview",
      "admin-users": "users",
      "admin-posts": "posts",
      "admin-reports": "reports",
      "admin-space-settings": "settings"
    };

    if (adminRoutes[cleanRoute]) {
      if (!isAdminMode) {
        setPublicSpaceRouteMode("home");
        closeAdminScreen();
        closeControlScreen();
        setFeedStatus("Login with a Public Space admin account first.");
        return;
      }

      setPublicSpaceRouteMode(cleanRoute);
      closeControlScreen();
      openAdminScreen(adminRoutes[cleanRoute]);
      return;
    }

    setPublicSpaceRouteMode("home");
  }

  function navigatePublicSpaceRoute(route, options = {}) {
    const cleanRoute = normalizePublicSpaceRoute(route);
    const baseUrl = `${window.location.pathname}${window.location.search}`;
    const nextUrl = cleanRoute === "home" ? baseUrl : `${baseUrl}#${cleanRoute}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentUrl !== nextUrl) {
      if (options.replace) {
        window.history.replaceState({}, "", nextUrl);
      } else {
        window.history.pushState({}, "", nextUrl);
      }
    }

    const routeRender = renderPublicSpaceRoute(cleanRoute);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    return routeRender;
  }

  // Q62G scroll routed screen to top

  function renderCurrentPublicSpaceRoute() {
    return renderPublicSpaceRoute(currentPublicSpaceRoute());
  }
  function enhanceAdminBadgeSelectors() {
    root.querySelectorAll("[data-ps-badge-input]").forEach(input => {
      if (input.dataset.psBadgeEnhanced === "true") return;

      input.dataset.psBadgeEnhanced = "true";
      input.type = "hidden";
      input.hidden = true;

      const selectedValues = splitBadgeLabels(input.value).map(normalizeBadgeValue);

      const picker = document.createElement("div");
      picker.className = "ps-badge-picker";
      picker.setAttribute("data-ps-badge-picker", "");
      picker.innerHTML = `
        <div class="ps-badge-picker-head">
          <strong>Select badges</strong>
          <span>Choose up to ${PUBLIC_SPACE_BADGE_LIMIT}</span>
        </div>
        <div class="ps-badge-picker-grid">
          ${PUBLIC_SPACE_BADGE_OPTIONS.map(option => {
            const normalized = normalizeBadgeValue(option.value);
            const checked = selectedValues.includes(normalized) ? " checked" : "";
            return `
              <label class="ps-badge-choice">
                <input type="checkbox" value="${escapeHtml(option.value)}"${checked} />
                <span>${renderBadgeChip(option, "is-choice")}</span>
              </label>
            `;
          }).join("")}
        </div>
        <p class="ps-badge-picker-note" data-ps-badge-picker-note>Maximum ${PUBLIC_SPACE_BADGE_LIMIT} badges per user.</p>
      `;

      input.insertAdjacentElement("afterend", picker);

      const syncInput = changedBox => {
        const checkedBoxes = Array.from(picker.querySelectorAll("input[type='checkbox']:checked"));

        if (checkedBoxes.length > PUBLIC_SPACE_BADGE_LIMIT && changedBox) {
          changedBox.checked = false;
        }

        const values = Array.from(picker.querySelectorAll("input[type='checkbox']:checked"))
          .slice(0, PUBLIC_SPACE_BADGE_LIMIT)
          .map(box => box.value);

        input.value = values.join(", ");

        const note = picker.querySelector("[data-ps-badge-picker-note]");
        if (note) note.textContent = `${values.length}/${PUBLIC_SPACE_BADGE_LIMIT} selected`;
      };

      picker.addEventListener("change", event => {
        const box = event.target.closest("input[type='checkbox']");
        if (!box) return;
        syncInput(box);
      });

      syncInput();
    });
  }
  function syncPublicSpaceScrollTop() {
    if (!scrollTopButton) return;

    const shouldShow = !mainSpace.hidden && window.scrollY > 380;
    scrollTopButton.classList.toggle("visible", shouldShow);
    scrollTopButton.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    document.body.classList.toggle("scroll-top-visible", shouldShow);
  }
  function showAuth(mode) {
    const nextMode = mode === "login" ? "login" : "register";

    forms.forEach(form => {
      form.classList.toggle("is-active", form.dataset.psForm === nextMode);
    });

    setText(authTitle, COPY[nextMode].title);
    setText(authIntro, COPY[nextMode].intro);
    setMessage(authMessage, "", "info");

    if (authScreen) authScreen.hidden = false;
    if (mainSpace) mainSpace.hidden = true;
  }

  async function showMainSpace(message) {
    if (authScreen) authScreen.hidden = true;
    if (mainSpace) mainSpace.hidden = false;
    setMessage(authMessage, "", "info");

    setAdminMode(Boolean(currentUser && currentUser.is_admin));

    if (message) setFeedStatus(message);
    await loadPosts(message ? 250 : 0);
  }

  async function loadPosts(delayMs) {
    if (!feed) return [];

    return new Promise(resolve => {
      window.setTimeout(async () => {
        try {
          setFeedStatus("Loading posts...");
          const posts = await rpc("list_public_space_posts", {
            input_session_token: sessionToken() || null
          });
          const list = Array.isArray(posts) ? posts : [];
          renderPosts(list);
          setFeedStatus("");
          resolve(list);
        } catch (error) {
          latestPublicSpacePosts = [];
          renderEmptyFeed("Could not load posts yet.");
          setFeedStatus(getErrorMessage(error));
          resolve([]);
        }
      }, delayMs || 0);
    });
  }

  async function restoreSession() {
    if (!currentSession || !currentSession.session_token) {
      showAuth("register");
      return;
    }

    try {
      const data = await rpc("get_public_space_session", {
        input_session_token: currentSession.session_token
      });

      if (!data || !data.ok || !data.user) {
        clearSession();
        showAuth("login");
        return;
      }

      currentUser = data.user;
      currentSession.user = data.user;
      saveSession(currentSession);

      await showMainSpace(`Welcome back, @${data.user.username}.`);
      await renderCurrentPublicSpaceRoute();
    } catch (error) {
      clearSession();
      showAuth("login");
    }
  }

  function closeModal(modal) {
    if (modal) modal.hidden = true;
  }

  function openModal(modal) {
    if (modal) modal.hidden = false;
  }

  function updateCounter() {
    if (!postTextarea || !postCount) return;

    const length = postTextarea.value.length;
    postCount.textContent = `${length}/${LIMITS.postMax}`;
    if (postButton) postButton.disabled = length < 1 || length > LIMITS.postMax;
  }


  function setComposerSubmitLabel(label) {
    const button = composer ? composer.querySelector("button[type='submit']") : null;
    if (button) button.textContent = label || "Post";
  }

  function resetPostComposerMode() {
    composeMode = "create";
    editingPostId = null;
    setComposerSubmitLabel("Post");
  }
  function openPostComposer(contextText) {
    resetPostComposerMode();

    if (!currentSession || !currentSession.session_token) {
      showAuth("login");
      return;
    }

    const text = String(contextText || "What's on your mind?").trim() || "What's on your mind?";
    const composeTitle = document.querySelector("#psComposeTitle");
    const composeLabel = composer ? composer.querySelector("label span") : null;

    if (composeTitle) composeTitle.textContent = text;
    if (composeLabel) composeLabel.textContent = "Your post";
    if (postTextarea) {
      postTextarea.value = "";
      postTextarea.placeholder = text;
    }

    setComposerSubmitLabel("Post");
    setMessage(composeMessage, "", "info");
    openModal(composeModal);
    updateCounter();

    if (postTextarea) {
      window.setTimeout(() => postTextarea.focus(), 0);
    }
  }

  function openEditPostComposer(post) {
    if (!post || !post.id) return;

    if (!canEditPost(post)) {
      setFeedStatus("Posts can only be edited within 30 minutes.");
      return;
    }

    if (!currentSession || !currentSession.session_token) {
      showAuth("login");
      return;
    }

    composeMode = "edit";
    editingPostId = post.id;

    const composeTitle = document.querySelector("#psComposeTitle");
    const composeLabel = composer ? composer.querySelector("label span") : null;

    if (composeTitle) composeTitle.textContent = "Edit post";
    if (composeLabel) composeLabel.textContent = "Update your post";
    if (postTextarea) {
      postTextarea.value = post.body || "";
      postTextarea.placeholder = "Update your post...";
    }

    setComposerSubmitLabel("Save changes");
    setMessage(composeMessage, "Editing is available for 30 minutes after posting.", "info");
    openModal(composeModal);
    updateCounter();

    if (postTextarea) {
      window.setTimeout(() => postTextarea.focus(), 0);
    }
  }

  async function handleAuthSubmit(form) {
    const mode = form.dataset.psForm;
    const username = normalizeUsername(form.elements.username ? form.elements.username.value : "");
    const password = form.elements.password ? form.elements.password.value : "";
    const pin = form.elements.pin ? form.elements.pin.value : "";

    const usernameError = validateUsername(username);
    if (usernameError) {
      setMessage(authMessage, usernameError, "error");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setMessage(authMessage, passwordError, "error");
      return;
    }

    if (mode === "register") {
      const pinError = validatePin(pin);
      if (pinError) {
        setMessage(authMessage, pinError, "error");
        return;
      }

      const usernameInput = form.elements.username || form.querySelector("input[name='username']");
      const usernameAvailable = await checkRegisterUsername(usernameInput);
      if (!usernameAvailable) {
        setMessage(authMessage, "Please use an available username before creating the account.", "error");
        return;
      }
    }

    try {
      const client = getClient();
      if (!client) throw new Error("Database connection is not ready. Please refresh the page.");

      const button = form.querySelector("button[type='submit']");
      if (button) button.disabled = true;

      setMessage(authMessage, mode === "register" ? "Creating your account..." : "Logging in...", "info");

      const data = mode === "register"
        ? await rpc("register_public_space_user", {
            input_username: username,
            input_password: password,
            input_pin: pin
          })
        : await rpc("login_public_space_user", {
            input_username: username,
            input_password: password
          });

      if (!data || !data.session_token || !data.user) {
        throw new Error("Invalid server response.");
      }

      saveSession(data);
      form.reset();
      await showMainSpace(mode === "register" ? "Account created." : "Logged in.");
      await renderCurrentPublicSpaceRoute();
    } catch (error) {
      setMessage(authMessage, getErrorMessage(error), "error");
    } finally {
      const button = form.querySelector("button[type='submit']");
      if (button) button.disabled = false;
    }
  }

  async function handleForgotSubmit(event) {
    event.preventDefault();
    if (!forgotForm) return;

    const username = normalizeUsername(forgotForm.elements.username ? forgotForm.elements.username.value : "");
    const password = forgotForm.elements.password ? forgotForm.elements.password.value : "";
    const confirmInput = forgotForm.querySelector("input[name='confirm'], input[name='confirmPassword'], input[name='confirm_password']");
    const confirmPassword = confirmInput ? confirmInput.value : password;
    const pin = forgotForm.elements.pin ? forgotForm.elements.pin.value : "";

    const usernameError = validateUsername(username);
    if (usernameError) {
      setMessage(forgotMessage, usernameError, "error");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setMessage(forgotMessage, passwordError, "error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage(forgotMessage, "Passwords do not match.", "error");
      return;
    }

    const pinError = validatePin(pin);
    if (pinError) {
      setMessage(forgotMessage, pinError, "error");
      return;
    }

    try {
      setMessage(forgotMessage, "Resetting password...", "info");

      await rpc("reset_public_space_password", {
        input_username: username,
        input_new_password: password,
        input_pin: pin
      });

      forgotForm.reset();
      clearSession();
      setMessage(forgotMessage, "Password updated. You can login now.", "success");

      window.setTimeout(() => {
        closeModal(forgotModal);
        showAuth("login");
      }, 700);
    } catch (error) {
      setMessage(forgotMessage, getErrorMessage(error), "error");
    }
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();

    const body = postTextarea ? postTextarea.value.trim() : "";

    if (!currentSession || !currentSession.session_token) {
      resetPostComposerMode();
      closeModal(composeModal);
      showAuth("login");
      return;
    }

    if (!body) {
      setFeedStatus("Write something first.");
      setMessage(composeMessage, "Write something first.", "error");
      return;
    }

    if (body.length > LIMITS.postMax) {
      setFeedStatus("Post can only be up to 1,000 characters.");
      setMessage(composeMessage, "Post can only be up to 1,000 characters.", "error");
      return;
    }

    try {
      if (postButton) postButton.disabled = true;
      setFeedStatus("Posting...");
      setMessage(composeMessage, "Posting...", "info");

      if (composeMode === "edit" && editingPostId) {
        await rpc("edit_public_space_post", {
          input_session_token: sessionToken(),
          input_post_id: editingPostId,
          input_body: body
        });
        setFeedStatus("Post updated.");
        setMessage(composeMessage, "Post updated.", "success");
      } else {
        await rpc("create_public_space_post", {
          input_session_token: sessionToken(),
          input_body: body,
          input_visibility: "public"
        });
        setFeedStatus("Posted.");
        setMessage(composeMessage, "Posted.", "success");
      }

      if (postTextarea) postTextarea.value = "";
      updateCounter();
      closeModal(composeModal);
      await loadPosts();
    } catch (error) {
      setFeedStatus(getErrorMessage(error));
      setMessage(composeMessage, getErrorMessage(error), "error");
    } finally {
      if (postButton) postButton.disabled = false;
    }
  }

  async function handleProfileComposerSubmit(form) {
    const textarea = form ? form.querySelector("textarea[name='post']") : null;
    const button = form ? form.querySelector("button[type='submit']") : null;
    const messageNode = form ? form.querySelector("[data-ps-profile-message]") : null;
    const body = textarea ? textarea.value.trim() : "";

    if (!currentSession || !currentSession.session_token) {
      showAuth("login");
      return;
    }

    if (!body) {
      setMessage(messageNode, "Write something first.", "error");
      return;
    }

    if (body.length > LIMITS.postMax) {
      setMessage(messageNode, "Post can only be up to 1,000 characters.", "error");
      return;
    }

    try {
      if (button) button.disabled = true;
      setMessage(messageNode, "Posting to your profile...", "info");

      await rpc("create_public_space_post", {
        input_session_token: sessionToken(),
        input_body: body,
        input_visibility: "public"
      });

      if (textarea) textarea.value = "";
      updateProfileComposerCounter(form);
      const posts = await loadPosts();
      renderProfileOwnPosts(posts);
      setMessage(messageNode, "Posted to your profile.", "success");
    } catch (error) {
      setMessage(messageNode, getErrorMessage(error), "error");
    } finally {
      updateProfileComposerCounter(form);
    }
  }

  async function handleFeedClick(event) {
    const heartButton = event.target.closest("[data-ps-heart-post]");
    const deleteButton = event.target.closest("[data-ps-delete-post]");
    const hideButton = event.target.closest("[data-ps-toggle-hidden]");
    const commentButton = event.target.closest("[data-ps-comments-post]");

    if (commentButton) {
      setFeedStatus("");
      return;
    }

    if (!heartButton && !deleteButton && !hideButton) return;

    if (!currentSession || !currentSession.session_token) {
      showAuth("login");
      return;
    }

    try {
      if (heartButton) {
        heartButton.disabled = true;
        await rpc("toggle_public_space_heart", {
          input_session_token: sessionToken(),
          input_post_id: heartButton.dataset.psHeartPost
        });
      }

      if (deleteButton) {
        deleteButton.disabled = true;
        await rpc("delete_public_space_post", {
          input_session_token: sessionToken(),
          input_post_id: deleteButton.dataset.psDeletePost
        });
      }

      if (hideButton) {
        hideButton.disabled = true;
        const isHidden = hideButton.dataset.hidden === "true";
        await rpc("admin_set_public_space_post_hidden", {
          input_session_token: sessionToken(),
          input_post_id: hideButton.dataset.psToggleHidden,
          input_is_hidden: !isHidden
        });
      }

      await loadPosts();
    } catch (error) {
      setFeedStatus(getErrorMessage(error));
    }
  }

  function adminResultsNode() {
    return root.querySelector("[data-ps-admin-results]");
  }

  function renderAdminInfoCards(status, cards) {
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const results = adminResultsNode();
    const safeCards = Array.isArray(cards) ? cards : [];

    if (!results) return;

    results.innerHTML = `
      <div class="ps-admin-info-grid">
        ${safeCards.map(card => `
          <article class="ps-admin-info-card">
            <strong>${escapeHtml(card.title || "Admin tool")}</strong>
            <span>${escapeHtml(card.body || "")}</span>
          </article>
        `).join("")}
      </div>
    `;

    setMessage(messageNode, status || "Admin controls ready.", "info");
  }

  function renderAdminOverview() {
    renderAdminInfoCards("Admin overview ready.", [
      {
        title: "Registered users",
        body: "View accounts, toggle premium, assign badges, disable or enable accounts, and reset passwords and PIN/key codes."
      },
      {
        title: "Post moderation",
        body: "Refresh the feed and use admin-only hide/delete controls directly on posts while in admin mode."
      },
      {
        title: "Reports",
        body: "Report queue UI is reserved here. Database-backed report creation will be connected after viewer flow is stable."
      },
      {
        title: "Space settings",
        body: "Current locked mode: text-only posts, 1,000-character composer limit, DB-backed accounts, admin-only controls."
      }
    ]);
  }

  function renderPostModerationAdmin() {
    renderAdminInfoCards("Post moderation ready.", [
      {
        title: "Feed refreshed",
        body: "Posts were reloaded. Admin-only hide/delete actions are available directly on each post card in the main feed."
      },
      {
        title: "Next moderation upgrade",
        body: "A dedicated moderation queue can be added after viewer posting, comments, and reports are stable."
      }
    ]);
  }

  function renderAdminReports() {
    renderAdminInfoCards("Reports section ready.", [
      {
        title: "No report queue connected yet",
        body: "The admin screen is ready. Report submission and report review RPC functions will be added after viewer-side testing."
      },
      {
        title: "Planned report actions",
        body: "Review report, hide post/comment, dismiss report, and keep a moderation log."
      }
    ]);
  }

  function renderAdminSpaceSettings() {
    renderAdminInfoCards("Space settings ready.", [
      {
        title: "Posting rules",
        body: "Public Space is currently text-only with a 1,000-character post limit."
      },
      {
        title: "Account controls",
        body: "Admin can manage premium, badges, disabled state, and password/PIN resets from Registered users."
      },
      {
        title: "Security lock",
        body: "Accounts are DB-backed through Supabase RPC. Do not expose service role keys or rely on frontend-only security."
      },
      {
        title: "Upcoming",
        body: "Viewer profile/settings, comments, notifications database, reports, and moderation logs."
      }
    ]);
  }

  function renderAdminUsers(users) {
    const results = adminResultsNode();
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const list = Array.isArray(users) ? users : [];

    if (!results) return;

    if (!list.length) {
      results.innerHTML = `
        <article class="ps-admin-empty">
          <strong>No registered users yet.</strong>
          <span>New Public Space accounts will appear here.</span>
        </article>
      `;
      setMessage(messageNode, "Registered users: 0", "info");
      return;
    }

    results.innerHTML = `
      <div class="ps-admin-results-head">
        <strong>Registered users</strong>
        <span>${list.length} total</span>
      </div>
      <div class="ps-admin-user-list">
        ${list.map(user => {
          const isDisabled = Boolean(user.is_disabled);
          const isPremium = Boolean(user.is_premium);
          const isAdmin = Boolean(user.is_admin);
          const badge = user.badge_label || "";

          return `
            <article class="ps-admin-user-card ${isDisabled ? "is-disabled" : ""}" data-ps-admin-user-card data-user-id="${escapeHtml(user.id)}">
              <div class="ps-admin-user-main">
                <div>
                  <strong>@${escapeHtml(user.username || "user")}</strong>
                  <span>Joined ${escapeHtml(formatDate(user.created_at) || "recently")}</span>
                </div>
                <div class="ps-admin-user-pills">
                  ${isAdmin ? '<span class="ps-status-pill">Admin</span>' : ""}
                  ${isPremium ? '<span class="ps-status-pill">Premium</span>' : ""}
                  ${isDisabled ? '<span class="ps-status-pill is-danger">Disabled</span>' : '<span class="ps-status-pill is-ok">Active</span>'}
                  ${badge ? `<span class="ps-status-pill">${escapeHtml(badge)}</span>` : ""}
                </div>
              </div>

              <div class="ps-admin-user-actions">
                <button type="button" data-ps-user-action="premium" data-user-id="${escapeHtml(user.id)}" data-next-premium="${isPremium ? "false" : "true"}">
                  ${isPremium ? "Remove premium" : "Make premium"}
                </button>

                <button type="button" data-ps-user-action="disable" data-user-id="${escapeHtml(user.id)}" data-next-disabled="${isDisabled ? "false" : "true"}">
                  ${isDisabled ? "Enable account" : "Disable account"}
                </button>
              </div>

              <div class="ps-admin-inline-form">
                <label>
                  <span>Badge label</span>
                  <input type="text" value="${escapeHtml(badge)}" maxlength="24" data-ps-user-badge placeholder="Example: Founder" />
                </label>
                <button type="button" data-ps-user-action="badge" data-user-id="${escapeHtml(user.id)}">Save badge</button>
              </div>

              <div class="ps-admin-inline-form">
                <label>
                  <span>Reset password</span>
                  <input type="text" maxlength="8" data-ps-user-password placeholder="6 to 8 chars" />
                </label>
                <button type="button" data-ps-user-action="password" data-user-id="${escapeHtml(user.id)}">Reset password</button>
              </div>
              <div class="ps-admin-inline-form">
                <label>
                  <span>Reset PIN/key</span>
                  <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" data-ps-user-pin data-ps-pin-only placeholder="4 numbers" />
                </label>
                <button type="button" data-ps-user-action="pin" data-user-id="${escapeHtml(user.id)}">Reset PIN</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;

    enforceNumericPinFields();
    setMessage(messageNode, `Registered users: ${list.length}`, "success");
  }

  async function refreshAdminUsers(message) {
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const results = adminResultsNode();

    if (message) setMessage(messageNode, message, "info");
    if (results) {
      results.innerHTML = `
        <article class="ps-admin-empty">
          <strong>Loading users...</strong>
          <span>Please wait while Public Space users are loaded.</span>
        </article>
      `;
    }

    const users = await rpc("list_public_space_users", {
      input_session_token: sessionToken()
    });

    renderAdminUsers(users);
  }

  async function handleAdminUserAction(button) {
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const card = button.closest("[data-ps-admin-user-card]");
    const userId = button.dataset.userId;
    const action = button.dataset.psUserAction;

    if (!userId || !action) return;

    const params = {
      input_session_token: sessionToken(),
      input_user_id: userId,
      input_is_premium: null,
      input_badge_label: null,
      input_is_disabled: null,
      input_new_password: null,
      input_new_pin: null
    };

    if (action === "premium") {
      params.input_is_premium = button.dataset.nextPremium === "true";
    }

    if (action === "disable") {
      params.input_is_disabled = button.dataset.nextDisabled === "true";
    }

    if (action === "badge") {
      const badgeInput = card ? card.querySelector("[data-ps-user-badge]") : null;
      params.input_badge_label = badgeInput ? badgeInput.value.trim() : "";
    }

    if (action === "password") {
      const passwordInput = card ? card.querySelector("[data-ps-user-password]") : null;
      const newPassword = passwordInput ? passwordInput.value.trim() : "";
      const passwordError = validatePassword(newPassword);

      if (passwordError) {
        setMessage(messageNode, passwordError, "error");
        return;
      }

      params.input_new_password = newPassword;
    }

    if (action === "pin") {
      const pinInput = card ? card.querySelector("[data-ps-user-pin]") : null;
      const newPin = pinInput ? pinInput.value.trim() : "";
      const pinError = validatePin(newPin);

      if (pinError) {
        setMessage(messageNode, pinError, "error");
        return;
      }

      params.input_new_pin = newPin;
    }

    try {
      button.disabled = true;
      setMessage(messageNode, "Saving user changes...", "info");

      await rpc("admin_update_public_space_user", params);

      if (action === "password") {
        const passwordInput = card ? card.querySelector("[data-ps-user-password]") : null;
        if (passwordInput) passwordInput.value = "";
      }

      if (action === "pin") {
        const pinInput = card ? card.querySelector("[data-ps-user-pin]") : null;
        if (pinInput) pinInput.value = "";
      }
      await refreshAdminUsers("User updated.");
    } catch (error) {
      setMessage(messageNode, getErrorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  async function handleAdminAction(event) {
    const postMoreButton = event.target.closest("[data-ps-post-more]");
    if (postMoreButton) {
      event.preventDefault();
      const wrapper = postMoreButton.closest("[data-ps-post-more-wrap]");
      const menuNode = wrapper ? wrapper.querySelector("[data-ps-post-menu]") : null;
      if (!menuNode) return;

      const willOpen = menuNode.hidden;
      closePostMenus(menuNode);
      menuNode.hidden = !willOpen;
      postMoreButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
      return;
    }

    const postMenuAction = event.target.closest("[data-ps-post-menu-action]");
    if (postMenuAction) {
      const postId = postMenuAction.dataset.psEditPost
        || postMenuAction.dataset.psDeletePost
        || postMenuAction.dataset.psToggleHidden
        || "";

      if (postMenuAction.dataset.psPostMenuAction === "edit") {
        event.preventDefault();
        closePostMenus();
        openEditPostComposer(postById(postId));
        return;
      }

      if (postMenuAction.dataset.psPostMenuAction === "delete" || postMenuAction.dataset.psPostMenuAction === "hide") {
        closePostMenus();
        await handleFeedClick(event);
        return;
      }
    }

    if (!event.target.closest("[data-ps-post-more-wrap]")) {
      closePostMenus();
    }
    const profileComposerButton = event.target.closest("[data-ps-profile-open-compose]");
    if (profileComposerButton) {
      event.preventDefault();
      const username = currentUser && currentUser.username ? currentUser.username : "user";
      openPostComposer(`What's on your mind, @${username}?`);
      return;
    }

    const profilePostList = event.target.closest("[data-ps-profile-post-list]");
    const profilePostAction = profilePostList
      ? event.target.closest("[data-ps-heart-post], [data-ps-delete-post], [data-ps-toggle-hidden], [data-ps-comments-post]")
      : null;

    if (profilePostAction) {
      await handleFeedClick(event);
      return;
    }

    const userActionButton = event.target.closest("[data-ps-user-action]");
    if (userActionButton) {
      await handleAdminUserAction(userActionButton);
      return;
    }

    const button = event.target.closest("[data-ps-admin-action]");
    if (!button) return;

    const messageNode = root.querySelector("[data-ps-admin-message]");
    const results = adminResultsNode();
    const action = button.dataset.psAdminAction;

    if (!isAdminMode) {
      setMessage(messageNode, "Login with a Public Space admin account first.", "error");
      return;
    }

    try {
      if (action === "overview") {
        renderAdminOverview();
        return;
      }

      if (action === "users") {
        await refreshAdminUsers("Loading users...");
        return;
      }

      if (action === "posts") {
        await loadPosts();
        renderPostModerationAdmin();
        return;
      }

      if (action === "reports") {
        renderAdminReports();
        return;
      }

      if (action === "settings") {
        renderAdminSpaceSettings();
        return;
      }

      renderAdminInfoCards("Admin section ready.", [
        {
          title: button.textContent || "Admin tool",
          body: "This section is reserved for the next admin upgrade."
        }
      ]);
    } catch (error) {
      setMessage(messageNode, getErrorMessage(error), "error");
    }
  }

  forms.forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      handleAuthSubmit(form);
    });
  });

  authSwitches.forEach(button => {
    button.addEventListener("click", () => {
      showAuth(button.dataset.psShowAuth);
    });
  });

  if (openForgot) {
    openForgot.addEventListener("click", () => {
      setMessage(forgotMessage, "", "info");
      openModal(forgotModal);
    });
  }

  if (closeForgot) closeForgot.addEventListener("click", () => closeModal(forgotModal));
  if (forgotForm) forgotForm.addEventListener("submit", handleForgotSubmit);

  if (openCompose) {
    openCompose.addEventListener("click", () => {
      openPostComposer("What's on your mind?");
    });
  }

  if (closeCompose) closeCompose.addEventListener("click", () => closeModal(composeModal));
  if (composer) composer.addEventListener("submit", handleComposerSubmit);
  if (postTextarea) postTextarea.addEventListener("input", updateCounter);
  if (feed) feed.addEventListener("click", handleFeedClick);

  function handleProfileComposerRootSubmit(event) {
    const form = event.target.closest("[data-ps-profile-composer]");
    if (!form) return;

    event.preventDefault();
    handleProfileComposerSubmit(form);
  }

  function handleProfileComposerRootInput(event) {
    const form = event.target.closest("[data-ps-profile-composer]");
    if (!form) return;

    updateProfileComposerCounter(form);
  }

  root.addEventListener("submit", handleProfileComposerRootSubmit);
  root.addEventListener("input", handleProfileComposerRootInput);
  root.addEventListener("change", handlePostFilterChange);

  window.addEventListener("popstate", renderCurrentPublicSpaceRoute);
  window.addEventListener("hashchange", renderCurrentPublicSpaceRoute);
  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      setMenuOpen(menu.hidden);
    });
  }

  if (menu) {
    menu.addEventListener("click", event => {
      const item = event.target.closest("[data-ps-menu-item]");
      if (!item) return;

      if (item.dataset.psMenuItem === "home") {
        navigatePublicSpaceRoute("home");
      }

      if (item.dataset.psMenuItem === "profile") {
        navigatePublicSpaceRoute("profile");
      }

      if (item.dataset.psMenuItem === "settings") {
        navigatePublicSpaceRoute("settings");
      }


      if (item.dataset.psMenuItem === "admin") {
        navigatePublicSpaceRoute("admin-overview");
      }

      if (item.dataset.psMenuItem === "admin-users") {
        navigatePublicSpaceRoute("admin-users");
      }

      if (item.dataset.psMenuItem === "admin-posts") {
        navigatePublicSpaceRoute("admin-posts");
      }

      if (item.dataset.psMenuItem === "admin-reports") {
        navigatePublicSpaceRoute("admin-reports");
      }

      if (item.dataset.psMenuItem === "admin-space-settings") {
        navigatePublicSpaceRoute("admin-space-settings");
      }

      setMenuOpen(false);
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const token = sessionToken();

      try {
        if (token) {
          await rpc("logout_public_space_user", {
            input_session_token: token
          });
        }
      } catch (error) {}

      clearSession();
      closeAdminScreen();
      closeControlScreen();
      setMenuOpen(false);
      renderEmptyFeed();
      showAuth("login");
    });
  }

  if (bellButton) {
    bellButton.addEventListener("click", () => {
      navigatePublicSpaceRoute("notifications");
    });
  }

  root.addEventListener("click", handleAdminAction);
  root.addEventListener("click", handleBadgeLabelToggle);

  if (scrollTopButton) {
    scrollTopButton.setAttribute("aria-hidden", "true");
    scrollTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", syncPublicSpaceScrollTop, { passive: true });
    window.addEventListener("resize", syncPublicSpaceScrollTop);
    syncPublicSpaceScrollTop();
  }

  const adminBadgeSelectorObserver = new MutationObserver(() => enhanceAdminBadgeSelectors());
  adminBadgeSelectorObserver.observe(root, { childList: true, subtree: true });
  enhanceAdminBadgeSelectors();

  window.setTimeout(() => {
    ensurePostFilterControls();
    syncPostFilterControls();
  }, 0);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeModal(forgotModal);
    closeModal(composeModal);
    closeAdminScreen();
    closeControlScreen();
    setMenuOpen(false);
  });

  enforceNumericPinFields();
  setupUsernameAvailabilityChecker();
  enhancePasswordFields();
  updateCounter();
  renderEmptyFeed();

  restoreSession();
})();