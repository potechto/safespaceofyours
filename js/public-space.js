(function setupPublicSpace() {
  const root = document.querySelector("[data-public-space-root]");
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll("[data-ps-tab]"));
  const forms = Array.from(root.querySelectorAll("[data-ps-form]"));
  const authMessage = root.querySelector("[data-ps-auth-message]");
  const composer = root.querySelector("[data-ps-composer]");
  const postTextarea = composer ? composer.querySelector("textarea[name='post']") : null;
  const postButton = composer ? composer.querySelector("button[type='submit']") : null;
  const postCount = root.querySelector("[data-ps-post-count]");
  const feedStatus = root.querySelector("[data-ps-feed-status]");

  const LIMITS = {
    post: 1000,
    usernameMin: 3,
    passwordMin: 6,
    pinMin: 4
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

  function setMessage(message, type) {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.dataset.state = type || "info";
  }

  function setFeedStatus(message) {
    if (feedStatus) feedStatus.textContent = message;
  }

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function validateUsername(username) {
    if (username.length < LIMITS.usernameMin) return "Username needs at least 3 characters.";
    if (!/^[a-z0-9_]+$/.test(username)) return "Use letters, numbers, and underscore only.";
    return "";
  }

  function validatePassword(password) {
    if (String(password || "").length < LIMITS.passwordMin) {
      return "Password needs at least 6 characters.";
    }
    return "";
  }

  function validatePin(pin) {
    if (String(pin || "").length < LIMITS.pinMin) {
      return "PIN needs at least 4 digits/characters.";
    }
    return "";
  }

  function activateTab(name) {
    tabs.forEach(tab => {
      const isActive = tab.dataset.psTab === name;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    forms.forEach(form => {
      form.classList.toggle("is-active", form.dataset.psForm === name);
    });

    setMessage("Database connection will be activated in the next step.", "info");
  }

  function updateCounter() {
    if (!postTextarea || !postCount) return;
    const current = postTextarea.value.length;
    postCount.textContent = `${current} / ${LIMITS.post}`;
    postCount.dataset.state = current > LIMITS.post * 0.9 ? "near" : "ok";
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => activateTab(tab.dataset.psTab));
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
        setMessage(usernameError, "error");
        return;
      }

      if (mode === "login" || mode === "register" || mode === "reset") {
        const passwordError = validatePassword(password);
        if (passwordError) {
          setMessage(passwordError, "error");
          return;
        }
      }

      if (mode === "register" || mode === "reset") {
        const pinError = validatePin(pin);
        if (pinError) {
          setMessage(pinError, "error");
          return;
        }
      }

      const client = getClient();
      if (!client) {
        setMessage("Supabase client is not ready yet. Q47 will connect the database tables.", "error");
        return;
      }

      setMessage("UI is ready. Database tables are the next step before this can save accounts.", "info");
    });
  });

  if (postTextarea) {
    postTextarea.addEventListener("input", updateCounter);
    updateCounter();
  }

  if (composer) {
    composer.addEventListener("submit", event => {
      event.preventDefault();
      setMessage("Login and database setup are needed before posting.", "info");
    });
  }

  const client = getClient();
  if (client) {
    setFeedStatus("Ready for Q47 database tables");
  } else {
    setFeedStatus("Supabase script not ready");
  }

  if (postTextarea) postTextarea.disabled = true;
  if (postButton) postButton.disabled = true;
})();