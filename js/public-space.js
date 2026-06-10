(function setupPublicSpace() {
  const root = document.querySelector("[data-public-space-root]");
  if (!root) return;

  const ADMIN_HANDOFF_KEY = "safespace_public_space_admin";
  const ADMIN_HANDOFF_MAX_AGE = 12 * 60 * 60 * 1000;

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
  const feedStatus = root.querySelector("[data-ps-feed-status]");
  const feed = root.querySelector("[data-ps-feed]");

  const LIMITS = {
    post: 1000,
    usernameMin: 3,
    usernameMax: 15,
    passwordMin: 6,
    passwordMax: 8,
    pinLength: 4
  };

  const COPY = {
    register: {
      title: "Create account",
      intro: "Create your account with a username, password, and 4-digit PIN/key for password recovery."
    },
    login: {
      title: "Login account",
      intro: "Enter your username and password to open your Public Space."
    }
  };

  let isAdminMode = false;

  function getClient() {
    const candidates = [
      "safeAdminClient",
      "safeSupabase",
      "safeSupabaseClient",
      "supabaseClient",
      "SAFE_SUPABASE_CLIENT",
      "safeSpaceSupabase"
    ];

    for (const key of candidates) {
      if (window[key] && typeof window[key].from === "function") {
        return window[key];
      }
    }

    return null;
  }

  function setText(node, message) {
    if (node) node.textContent = message || "";
  }

  function setMessage(node, message, type) {
    if (!node) return;
    node.textContent = message || "";
    node.dataset.state = type || "info";
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

  function readAdminHandoff() {
    try {
      const raw = window.localStorage.getItem(ADMIN_HANDOFF_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.role !== "admin") return null;

      const grantedAt = Number(parsed.grantedAt) || 0;
      const expiresAt = Number(parsed.expiresAt) || 0;
      const isFresh = expiresAt ? Date.now() < expiresAt : Date.now() - grantedAt < ADMIN_HANDOFF_MAX_AGE;

      if (!isFresh) {
        window.localStorage.removeItem(ADMIN_HANDOFF_KEY);
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeAdminHandoff(source) {
    try {
      window.localStorage.setItem(
        ADMIN_HANDOFF_KEY,
        JSON.stringify({
          role: "admin",
          source: source || "public_space",
          grantedAt: Date.now(),
          expiresAt: Date.now() + ADMIN_HANDOFF_MAX_AGE
        })
      );
    } catch (error) {}
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

      const wrapper = document.createElement("div");
      wrapper.className = "ps-password-field";

      const parent = input.parentNode;
      if (!parent) return;

      parent.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ps-password-toggle";
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

  function ensureAdminTools() {
    if (!mainSpace || mainSpace.querySelector("[data-ps-admin-tools]")) return;

    mainSpace.insertAdjacentHTML("beforeend", `
      <section class="ps-admin-tools" data-ps-admin-tools>
        <div>
          <p class="eyebrow">Admin mode</p>
          <h2>Public Space controls</h2>
          <p>Review users, posts, comments, hearts, reports, and moderation actions from here.</p>
        </div>

        <div class="ps-admin-tool-grid">
          <button type="button" data-ps-admin-action="users">Registered users</button>
          <button type="button" data-ps-admin-action="posts">All posts</button>
          <button type="button" data-ps-admin-action="comments">Comments</button>
          <button type="button" data-ps-admin-action="reports">Reports</button>
          <button type="button" data-ps-admin-action="hidden">Hidden items</button>
          <button type="button" data-ps-admin-action="settings">Space settings</button>
        </div>

        <p class="ps-message" data-ps-admin-message></p>
      </section>
    `);
  }

  function setAdminMode(enabled, source) {
    isAdminMode = Boolean(enabled);
    document.body.classList.toggle("ps-admin-mode", isAdminMode);
    root.classList.toggle("is-admin-mode", isAdminMode);

    if (!isAdminMode) return;

    writeAdminHandoff(source || "public_space");
    ensureAdminTools();

    const adminTools = root.querySelector("[data-ps-admin-tools]");
    if (adminTools) adminTools.hidden = false;

    const adminMessage = root.querySelector("[data-ps-admin-message]");
    setMessage(adminMessage, "", "info");
    setText(feedStatus, "Admin mode");
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

  function showMainSpace(message) {
    if (authScreen) authScreen.hidden = true;
    if (mainSpace) mainSpace.hidden = false;
    setMessage(authMessage, "", "info");

    if (isAdminMode) {
      setText(feedStatus, "Admin mode");
    } else {
      setText(feedStatus, "");
    }

    if (message) setText(feedStatus, message);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("ps-modal-open");
    const firstInput = modal.querySelector("input, textarea, button");
    if (firstInput) firstInput.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("ps-modal-open");
  }

  function updateCounter() {
    if (!postTextarea || !postCount) return;
    const current = postTextarea.value.length;
    postCount.textContent = String(current) + " / " + String(LIMITS.post);
    postCount.dataset.state = current > LIMITS.post * 0.9 ? "near" : "ok";
  }

  function addLocalPreviewPost(body) {
    if (!feed) return;

    const emptyState = feed.querySelector(".ps-empty-state");
    if (emptyState) emptyState.remove();

    const article = document.createElement("article");
    article.className = "ps-post-card";
    article.innerHTML = `
      <div class="ps-post-meta">
        <strong>${isAdminMode ? "Admin" : "You"}</strong>
        <span>Just now</span>
      </div>
      <p></p>
      <div class="ps-post-actions">
        <button type="button">Heart</button>
        <button type="button">Comment</button>
        ${isAdminMode ? '<button type="button" data-ps-admin-post-action="hide">Hide</button><button type="button" data-ps-admin-post-action="delete">Delete</button>' : ""}
      </div>
    `;

    const paragraph = article.querySelector("p");
    if (paragraph) paragraph.textContent = body;

    feed.prepend(article);
  }

  authSwitches.forEach(button => {
    button.addEventListener("click", () => showAuth(button.dataset.psShowAuth));
  });

  forms.forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();

      const mode = form.dataset.psForm;
      const formData = new FormData(form);
      const username = normalizeUsername(formData.get("username"));
      const password = String(formData.get("password") || "");
      const pin = String(formData.get("pin") || "");

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
      }

      getClient();
      showMainSpace("");
    });
  });

  if (openForgot) {
    openForgot.addEventListener("click", () => openModal(forgotModal));
  }

  if (closeForgot) {
    closeForgot.addEventListener("click", () => closeModal(forgotModal));
  }

  if (forgotModal) {
    forgotModal.addEventListener("click", event => {
      if (event.target === forgotModal) closeModal(forgotModal);
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", event => {
      event.preventDefault();

      const formData = new FormData(forgotForm);
      const username = normalizeUsername(formData.get("username"));
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");
      const pin = String(formData.get("pin") || "");

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
        setMessage(forgotMessage, "New password and confirm password do not match.", "error");
        return;
      }

      const pinError = validatePin(pin);
      if (pinError) {
        setMessage(forgotMessage, pinError, "error");
        return;
      }

      setMessage(forgotMessage, "Password recovery request accepted.", "info");
    });
  }

  if (openCompose) {
    openCompose.addEventListener("click", () => openModal(composeModal));
  }

  if (closeCompose) {
    closeCompose.addEventListener("click", () => closeModal(composeModal));
  }

  if (composeModal) {
    composeModal.addEventListener("click", event => {
      if (event.target === composeModal) closeModal(composeModal);
    });
  }

  if (postTextarea) {
    postTextarea.addEventListener("input", updateCounter);
    updateCounter();
  }

  if (composer) {
    composer.addEventListener("submit", event => {
      event.preventDefault();
      const body = postTextarea ? postTextarea.value.trim() : "";

      if (!body) {
        setMessage(composeMessage, "Write something first before posting.", "error");
        return;
      }

      if (body.length > LIMITS.post) {
        setMessage(composeMessage, "Post can only be up to 1,000 characters.", "error");
        return;
      }

      addLocalPreviewPost(body);
      if (postTextarea) postTextarea.value = "";
      updateCounter();
      setMessage(composeMessage, "", "info");
      closeModal(composeModal);
    });
  }

  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
    });
  }

  if (bellButton) {
    bellButton.addEventListener("click", () => {
      setText(feedStatus, isAdminMode ? "Admin notifications" : "Notifications");
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      if (menu) menu.hidden = true;
      if (!isAdminMode) showAuth("login");
      if (isAdminMode) showMainSpace("Admin mode");
    });
  }

  document.addEventListener("click", event => {
    const adminAction = event.target.closest("[data-ps-admin-action]");
    if (adminAction) {
      const label = adminAction.textContent.trim();
      const adminMessage = root.querySelector("[data-ps-admin-message]");
      setMessage(adminMessage, label + " panel selected.", "info");
      return;
    }

    const adminPostAction = event.target.closest("[data-ps-admin-post-action]");
    if (adminPostAction && isAdminMode) {
      const card = adminPostAction.closest(".ps-post-card");
      const action = adminPostAction.dataset.psAdminPostAction;

      if (action === "hide" && card) {
        card.classList.toggle("is-hidden-by-admin");
        adminPostAction.textContent = card.classList.contains("is-hidden-by-admin") ? "Unhide" : "Hide";
      }

      if (action === "delete" && card) {
        card.remove();
      }
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeModal(forgotModal);
    closeModal(composeModal);
    if (menu) menu.hidden = true;
  });

  enforceNumericPinFields();
  enhancePasswordFields();

  const adminHandoff = readAdminHandoff();
  if (adminHandoff) {
    setAdminMode(true, adminHandoff.source || "handoff");
    showMainSpace("Admin mode");
  } else {
    showAuth("register");
  }
})();