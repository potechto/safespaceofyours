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

  const menuToggle = root.querySelector("[data-ps-menu-toggle]");
  const menu = root.querySelector("[data-ps-menu]");
  const logoutButton = root.querySelector("[data-ps-logout]");
  const bellButton = root.querySelector("[data-ps-bell]");
  const feedStatus = root.querySelector("[data-ps-feed-status]");
  const feed = root.querySelector("[data-ps-feed]");

  let currentSession = readSession();
  let currentUser = currentSession ? currentSession.user : null;
  let isAdminMode = Boolean(currentUser && currentUser.is_admin);

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

  function renderPosts(posts) {
    if (!feed) return;

    const list = Array.isArray(posts) ? posts : [];

    if (!list.length) {
      renderEmptyFeed();
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
        ? `<button type="button" data-ps-delete-post="${escapeHtml(post.id)}">Delete</button>`
        : "";
      const adminButtons = isAdminMode
        ? `<button type="button" data-ps-toggle-hidden="${escapeHtml(post.id)}" data-hidden="${post.is_hidden ? "true" : "false"}">${post.is_hidden ? "Unhide" : "Hide"}</button>`
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

  function ensureControlScreen() {
    if (!mainSpace || mainSpace.querySelector("[data-ps-control-screen]")) return;

    mainSpace.insertAdjacentHTML("beforeend", `
      <section class="ps-admin-tools ps-admin-screen ps-control-screen" data-ps-control-screen hidden aria-label="Public Space controls">
        <div class="ps-admin-screen-top">
          <div>
            <p class="eyebrow" data-ps-control-eyebrow>Public Space</p>
            <h2 data-ps-control-title>Controls</h2>
            <p data-ps-control-intro>Manage your Public Space account.</p>
          </div>
          <button class="ps-admin-close" type="button" data-ps-control-close aria-label="Close controls">&times;</button>
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

    const closeButton = screen.querySelector("[data-ps-control-close]");
    if (closeButton) closeButton.focus();
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
  function renderProfileScreen() {
    const user = currentUser || {};
    const chips = [
      user.is_admin ? "Admin" : "",
      user.is_premium ? "Premium" : "",
      user.badge_label ? user.badge_label : "",
      user.is_disabled ? "Disabled" : "Active"
    ].filter(Boolean);

    openControlScreen(
      "Profile",
      currentUser ? `Logged in as @${user.username}.` : "You are not logged in.",
      `
        <div class="ps-control-card">
          <strong>@${escapeHtml(user.username || "guest")}</strong>
          <span>${currentUser ? "Public Space account" : "Create or login to use Public Space."}</span>
          <div class="ps-control-chip-row">
            ${chips.map(chip => `<span class="ps-status-pill">${escapeHtml(chip)}</span>`).join("")}
          </div>
        </div>
        <div class="ps-control-card">
          <strong>Account notes</strong>
          <span>Username, premium, badge, disable/enable, and password/PIN reset are managed from admin user controls.</span>
        </div>
      `,
      "Account"
    );
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
      <section class="ps-admin-tools ps-admin-screen" data-ps-admin-tools hidden aria-label="Public Space admin controls">
        <div class="ps-admin-screen-top">
          <div>
            <p class="eyebrow">Admin mode</p>
            <h2>Public Space controls</h2>
            <p data-ps-admin-message>Manage users and moderate posts after logging in with a Public Space admin account.</p>
          </div>
          <button class="ps-admin-close" type="button" data-ps-admin-close aria-label="Close admin controls">&times;</button>
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

    const firstButton = adminTools.querySelector("button");
    if (firstButton) firstButton.focus();

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
    if (!feed) return;

    window.setTimeout(async () => {
      try {
        setFeedStatus("Loading posts...");
        const posts = await rpc("list_public_space_posts", {
          input_session_token: sessionToken() || null
        });
        renderPosts(posts);
        setFeedStatus("");
      } catch (error) {
        renderEmptyFeed("Could not load posts yet.");
        setFeedStatus(getErrorMessage(error));
      }
    }, delayMs || 0);
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
      closeModal(composeModal);
      showAuth("login");
      return;
    }

    if (!body) {
      setFeedStatus("Write something first.");
      return;
    }

    if (body.length > LIMITS.postMax) {
      setFeedStatus("Post can only be up to 1,000 characters.");
      return;
    }

    try {
      if (postButton) postButton.disabled = true;
      setFeedStatus("Posting...");

      await rpc("create_public_space_post", {
        input_session_token: sessionToken(),
        input_body: body,
        input_visibility: "public"
      });

      if (postTextarea) postTextarea.value = "";
      updateCounter();
      closeModal(composeModal);
      await loadPosts();
    } catch (error) {
      setFeedStatus(getErrorMessage(error));
    } finally {
      if (postButton) postButton.disabled = false;
    }
  }

  async function handleFeedClick(event) {
    const heartButton = event.target.closest("[data-ps-heart-post]");
    const deleteButton = event.target.closest("[data-ps-delete-post]");
    const hideButton = event.target.closest("[data-ps-toggle-hidden]");
    const commentButton = event.target.closest("[data-ps-comments-post]");

    if (commentButton) {
      setFeedStatus("Comments UI will be connected next.");
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
    const controlCloseButton = event.target.closest("[data-ps-control-close]");
    if (controlCloseButton) {
      navigatePublicSpaceRoute("home", { replace: true });
      return;
    }

    const closeButton = event.target.closest("[data-ps-admin-close]");
    if (closeButton) {
      navigatePublicSpaceRoute("home", { replace: true });
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
      if (!currentSession || !currentSession.session_token) {
        showAuth("login");
        return;
      }

      openModal(composeModal);
      if (postTextarea) postTextarea.focus();
      updateCounter();
    });
  }

  if (closeCompose) closeCompose.addEventListener("click", () => closeModal(composeModal));
  if (composer) composer.addEventListener("submit", handleComposerSubmit);
  if (postTextarea) postTextarea.addEventListener("input", updateCounter);
  if (feed) feed.addEventListener("click", handleFeedClick);

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