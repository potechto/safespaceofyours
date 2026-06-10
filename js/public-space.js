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
            <button type="button" data-ps-heart-post="${escapeHtml(post.id)}">${heartLabel} · ${Number(post.heart_count || 0)}</button>
            <button type="button" data-ps-comments-post="${escapeHtml(post.id)}">Comment · ${Number(post.comment_count || 0)}</button>
            ${manageButtons}
            ${adminButtons}
          </div>
        </article>
      `;
    }).join("");
  }

  function ensureAdminTools() {
    if (!mainSpace || mainSpace.querySelector("[data-ps-admin-tools]")) return;

    mainSpace.insertAdjacentHTML("beforeend", `
      <section class="ps-admin-tools" data-ps-admin-tools hidden>
        <div>
          <p class="eyebrow">Admin mode</p>
          <h2>Public Space controls</h2>
          <p data-ps-admin-message>Manage users and moderate posts after logging in with a Public Space admin account.</p>
        </div>
        <div class="ps-admin-tool-grid">
          <button type="button" data-ps-admin-action="users">Registered users</button>
          <button type="button" data-ps-admin-action="posts">Refresh all posts</button>
          <button type="button" data-ps-admin-action="reports">Reports</button>
          <button type="button" data-ps-admin-action="settings">Space settings</button>
        </div>
      </section>
    `);
  }

  function setAdminMode(enabled) {
    isAdminMode = Boolean(enabled && currentUser && currentUser.is_admin);
    document.body.classList.toggle("ps-admin-mode", isAdminMode);
    root.classList.toggle("is-admin-mode", isAdminMode);

    ensureAdminTools();

    const adminTools = root.querySelector("[data-ps-admin-tools]");
    if (adminTools) adminTools.hidden = !isAdminMode;
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

  async function handleAdminAction(event) {
    const button = event.target.closest("[data-ps-admin-action]");
    if (!button) return;

    const messageNode = root.querySelector("[data-ps-admin-message]");
    const action = button.dataset.psAdminAction;

    if (!isAdminMode) {
      setMessage(messageNode, "Login with a Public Space admin account first.", "error");
      return;
    }

    try {
      if (action === "users") {
        setMessage(messageNode, "Loading users...", "info");

        const users = await rpc("list_public_space_users", {
          input_session_token: sessionToken()
        });

        const count = Array.isArray(users) ? users.length : 0;
        const names = Array.isArray(users)
          ? users.slice(0, 8).map(user => `@${user.username}`).join(", ")
          : "";

        setMessage(messageNode, `Registered users: ${count}${names ? " — " + names : ""}`, "success");
        return;
      }

      if (action === "posts") {
        await loadPosts();
        setMessage(messageNode, "Posts refreshed.", "success");
        return;
      }

      setMessage(messageNode, "This admin tool will be connected in the next phase.", "info");
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

  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
    });
  }

  if (menu) {
    menu.addEventListener("click", event => {
      const item = event.target.closest("[data-ps-menu-item]");
      if (!item) return;

      if (item.dataset.psMenuItem === "profile") {
        setFeedStatus(currentUser ? `Logged in as @${currentUser.username}.` : "Not logged in.");
      }

      if (item.dataset.psMenuItem === "settings") {
        setFeedStatus("Settings will be connected next.");
      }

      menu.hidden = true;
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
      if (menu) menu.hidden = true;
      renderEmptyFeed();
      showAuth("login");
    });
  }

  if (bellButton) {
    bellButton.addEventListener("click", () => {
      setFeedStatus("Notifications will be connected next.");
    });
  }

  root.addEventListener("click", handleAdminAction);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeModal(forgotModal);
    closeModal(composeModal);
    if (menu) menu.hidden = true;
  });

  enforceNumericPinFields();
  enhancePasswordFields();
  updateCounter();
  renderEmptyFeed();

  restoreSession();
})();