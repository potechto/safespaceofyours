(function setupPublicSpace() {
  const root = document.querySelector("[data-public-space-root]");
  if (!root) return;

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
    if (node) node.textContent = message;
  }

  function setMessage(node, message, type) {
    if (!node) return;
    node.textContent = message;
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

  function showAuth(mode) {
    const nextMode = mode === "login" ? "login" : "register";

    forms.forEach(form => {
      form.classList.toggle("is-active", form.dataset.psForm === nextMode);
    });

    setText(authTitle, COPY[nextMode].title);
    setText(authIntro, COPY[nextMode].intro);
    setMessage(authMessage, "Database connection is not active yet. This Q47 screen is UI-only.", "info");

    if (authScreen) authScreen.hidden = false;
    if (mainSpace) mainSpace.hidden = true;
  }

  function showMainSpace(message) {
    if (authScreen) authScreen.hidden = true;
    if (mainSpace) mainSpace.hidden = false;
    setText(feedStatus, "UI preview only");
    setMessage(authMessage, message || "UI preview opened. Account is not saved yet.", "info");
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

      const client = getClient();
      if (!client) {
        setMessage(authMessage, "Supabase client is not ready. Opening UI preview only.", "info");
      } else {
        setMessage(authMessage, "Supabase client detected. Database functions are still pending.", "info");
      }

      showMainSpace("UI preview only. Account is not saved until database setup is connected.");
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

      setMessage(forgotMessage, "UI ready. Database password reset will be connected later.", "info");
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

      if (postButton) postButton.disabled = true;
      setMessage(composeMessage, "UI ready. Database posting will be connected later.", "info");
      window.setTimeout(() => {
        if (postButton) postButton.disabled = false;
      }, 400);
    });
  }

  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
    });
  }

  if (bellButton) {
    bellButton.addEventListener("click", () => {
      setText(feedStatus, "Notifications will connect after comments and hearts are saved.");
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      if (menu) menu.hidden = true;
      showAuth("login");
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeModal(forgotModal);
    closeModal(composeModal);
    if (menu) menu.hidden = true;
  });

  showAuth("register");
})();