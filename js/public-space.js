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
  const PUBLIC_SPACE_ACTIVE_WINDOW_MS = 3 * 60 * 1000;
  const PUBLIC_SPACE_IDLE_WINDOW_MS = 3 * 60 * 1000;
  const PUBLIC_SPACE_PRESENCE_TOUCH_MS = 25 * 1000;

  const PUBLIC_SPACE_BADGE_LIMIT = 3;
  const PUBLIC_SPACE_BADGE_OPTIONS = [
    { value: "Moderator", label: "Moderator", image: "Resources/moderator.png" },
    { value: "Admin", label: "Admin", image: "Resources/admin.png" },
    { value: "tester", label: "tester", image: "Resources/betatester.png", aliases: ["Beta Tester"] },
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
  let activePublicProfileUser = null;
  let publicProfileBackRoute = "home";
  let publicSpacePostFilter = { mode: "all", date: "" };
  let notificationPanelFilter = "all";
  let publicSpaceNotifications = [];
  let notificationsLoading = false;
  let publicSpaceNotificationsLoadedAt = 0;
  let publicSpaceLiveRefreshTimer = null;
  let publicSpaceLiveRefreshInFlight = false;
  let publicSpaceLivePostsSnapshot = "";
  let lastPublicSpacePresenceTouch = 0;
  let lastPublicSpaceUserActivityAt = Date.now();
  let publicSpaceActivityListenersReady = false;
  let adminUserFilterState = {
    query: "",
    status: "all"
  };
  let adminPostFilterState = {
    query: "",
    status: "all"
  };
  let composeMode = "create";
  let editingPostId = null;
  const COMMENT_EDIT_WINDOW_MS = 30 * 60 * 1000;

  let activeCommentsPostId = "";
  let activeEditingCommentId = "";
  let activeReplyParentCommentId = "";
  let activeComments = [];
  let commentsLoading = false;

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

    const detail = message ? `<p>${escapeHtml(message)}</p>` : "";
    feed.innerHTML = `
      <article class="ps-empty-state">
        <h2>No post Available</h2>
        ${detail}
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

  function ensurePostFilterControls() {
    const feedCard = root.querySelector(".ps-feed-card") || (feed ? feed.closest("section, article, div") : null);
    if (!feedCard) return;

    const existingFilter = feedCard.querySelector("[data-ps-post-filter]");
    if (existingFilter) {
      existingFilter.querySelector("option[value='custom']")?.remove();
      existingFilter.querySelector("[data-ps-post-filter-custom-tray]")?.remove();
      existingFilter.querySelector("[data-ps-clean-calendar]")?.remove();
      return;
    }

    const filter = document.createElement("div");
    filter.className = "ps-post-filter ps-post-filter-compact ps-post-filter-simple";
    filter.setAttribute("data-ps-post-filter", "");
    filter.innerHTML = `
      <label class="ps-post-filter-select-label">
        <span>Filter posts</span>
        <select data-ps-post-filter-mode aria-label="Filter posts">
          <option value="all">View all posts</option>
          <option value="today">Today only</option>
          <option value="yesterday">Yesterday</option>
        </select>
      </label>
    `;

    const headings = Array.from(feedCard.querySelectorAll("h1, h2, h3, strong"));
    const heading = headings.find(node => /latest posts/i.test(node.textContent || "")) || headings[0];

    if (heading) {
      let row = heading.closest(".ps-feed-card-head");
      if (!row) {
        row = document.createElement("div");
        row.className = "ps-feed-card-head";
        heading.insertAdjacentElement("beforebegin", row);
        row.appendChild(heading);
      }
      row.appendChild(filter);
    } else {
      feedCard.prepend(filter);
    }
  }

  function postCreatedDateKey(post) {
    if (!post) return "";

    const value = post.created_at || post.createdAt || post.posted_at || post.postedAt || post.date || post.timestamp;
    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return "";

    return localDateKey(date);
  }

  function activePostFilterDateKey() {
    const mode = publicSpacePostFilter.mode || "all";

    if (mode === "today") return offsetDateKey(0);
    if (mode === "yesterday") return offsetDateKey(-1);

    return "";
  }
  function postMatchesFilter(post) {
    const mode = publicSpacePostFilter.mode || "all";
    if (mode === "all") return true;

    const targetDate = activePostFilterDateKey();
    if (!targetDate) return true;

    const postDate = postCreatedDateKey(post);
    if (!postDate) return false;

    return postDate === targetDate;
  }

  function postCardNodesForFilter() {
    const scoped = Array.from(root.querySelectorAll(".ps-feed-card [data-post-id], [data-ps-feed] [data-post-id]"));
    if (scoped.length) return scoped;

    if (feed) {
      const feedCards = Array.from(feed.querySelectorAll("[data-post-id]"));
      if (feedCards.length) return feedCards;
    }

    return Array.from(root.querySelectorAll("[data-post-id]"));
  }

  function setPostFilterEmptyState(visibleCount, totalCount) {
    const feedCard = root.querySelector(".ps-feed-card") || (feed ? feed.closest("section, article, div") : null);
    if (!feedCard) return;

    let empty = feedCard.querySelector("[data-ps-filter-empty]");
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "ps-filter-empty";
      empty.setAttribute("data-ps-filter-empty", "");
      empty.innerHTML = `<strong>No post Available</strong>`;
      feedCard.appendChild(empty);
    }

    const shouldShow = totalCount > 0 && visibleCount === 0 && (publicSpacePostFilter.mode || "all") !== "all";
    empty.hidden = !shouldShow;
  }

  function applyPostFilter() {
    const cards = postCardNodesForFilter();
    const mode = publicSpacePostFilter.mode || "all";
    const targetDate = activePostFilterDateKey();
    let visibleCount = 0;

    cards.forEach(card => {
      const postId = String(card.dataset.postId || card.getAttribute("data-post-id") || "");
      const post = postById(postId);
      const cardDate = String(card.dataset.postDateKey || "").trim();
      const postDate = cardDate || postCreatedDateKey(post);
      const shouldShow = mode === "all" || !targetDate || postDate === targetDate;

      card.hidden = !shouldShow;
      card.style.display = shouldShow ? "" : "none";
      card.classList.toggle("is-filter-hidden", !shouldShow);

      if (shouldShow) visibleCount += 1;
    });

    setPostFilterEmptyState(visibleCount, cards.length);
    return visibleCount;
  }

  function normalizePostFilterMode() {
    const allowedModes = new Set(["all", "today", "yesterday"]);
    if (!allowedModes.has(publicSpacePostFilter.mode || "all")) {
      publicSpacePostFilter.mode = "all";
      publicSpacePostFilter.date = "";
    }
  }

  function syncPostFilterControls() {
    normalizePostFilterMode();

    const filter = root.querySelector("[data-ps-post-filter]");
    if (!filter) return;

    const modeSelect = filter.querySelector("[data-ps-post-filter-mode]");
    filter.querySelector("option[value='custom']")?.remove();
    filter.querySelector("[data-ps-post-filter-custom-tray]")?.remove();
    filter.querySelector("[data-ps-clean-calendar]")?.remove();

    if (modeSelect) modeSelect.value = publicSpacePostFilter.mode || "all";
  }

  function refreshPostFilterView() {
    ensurePostFilterControls();
    syncPostFilterControls();
    applyPostFilter();
  }

  function handlePostFilterChange(event) {
    const modeSelect = event.target.closest("[data-ps-post-filter-mode]");
    if (!modeSelect) return;

    const selectedMode = modeSelect.value || "all";
    publicSpacePostFilter.mode = ["all", "today", "yesterday"].includes(selectedMode) ? selectedMode : "all";
    publicSpacePostFilter.date = "";

    syncPostFilterControls();
    applyPostFilter();
  }

  function handlePostFilterClick(event) {
    const filter = event.target.closest("[data-ps-post-filter]");
    if (!filter) return;

    filter.querySelector("[data-ps-post-filter-custom-tray]")?.remove();
    filter.querySelector("[data-ps-clean-calendar]")?.remove();
  }

  function renderPosts(posts) {
    if (!feed) return;

    const list = Array.isArray(posts) ? posts : [];
    latestPublicSpacePosts = list;

    if (!list.length) {
      renderEmptyFeed();
      const activeRoute = currentPublicSpaceRoute();
      if (activeRoute === "profile") {
        renderProfileOwnPosts(list);
      }
      if (isPublicUserProfileRoute(activeRoute)) {
        renderPublicUserProfilePosts(publicUserIdFromRoute(activeRoute));
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
            ${renderPublicSpaceUserButton(author, username)}
            <span>${[premium, badge, hiddenLabel, escapeHtml(formatDate(post.created_at))].filter(Boolean).join(" ")}</span>
          </div>
          <p>${escapeHtml(post.body)}</p>
          <div class="ps-post-actions">
            <button type="button" data-ps-heart-post="${escapeHtml(post.id)}">${heartLabel} � ${Number(post.heart_count || 0)}</button>
            <button type="button" data-ps-comments-post="${escapeHtml(post.id)}">${commentCountText(post)}</button>
            ${manageButtons}
            ${adminButtons}
          </div>
        </article>
      `;
    }).join("");

    enhancePostCards(feed, list);
    polishPostCards(feed, list);
    const activeRoute = currentPublicSpaceRoute();
    if (activeRoute === "profile") {
      renderProfileOwnPosts(list);
    }
    if (isPublicUserProfileRoute(activeRoute)) {
      renderPublicUserProfilePosts(publicUserIdFromRoute(activeRoute));
    }
  }

  function commentCount(post) {
    return Number((post && post.comment_count) || 0);
  }

  function commentCountText(post) {
    const count = commentCount(post);
    return count > 0 ? `💬 · ${count}` : "💬";
  }

  function syncPostCommentCount(postId, count) {
    const cleanId = String(postId || "");
    const nextCount = Number(count || 0);

    if (!cleanId) return;

    if (Array.isArray(latestPublicSpacePosts)) {
      latestPublicSpacePosts.forEach(post => {
        if (String(post.id || "") === cleanId) post.comment_count = nextCount;
      });
    }

    document.querySelectorAll("[data-ps-comments-post]").forEach(button => {
      if (String(button.dataset.psCommentsPost || "") === cleanId) {
        button.textContent = commentCountText({ comment_count: nextCount });
      }
    });

    const modalTitle = document.querySelector("[data-ps-comments-modal]:not([hidden]) [data-ps-comments-title]");
    if (modalTitle && String(activeCommentsPostId || "") === cleanId) {
      modalTitle.textContent = `Comments · ${nextCount}`;
    }
  }

  function currentCommentsPost() {
    return activeCommentsPostId ? postById(activeCommentsPostId) : null;
  }

  function ensureCommentsModal() {
    let modal = document.querySelector("[data-ps-comments-modal]");
    if (modal) return modal;

    document.body.insertAdjacentHTML("beforeend", `
      <div class="ps-modal ps-comments-modal" data-ps-comments-modal hidden>
        <div class="ps-modal-card ps-comments-card" role="dialog" aria-modal="true" aria-labelledby="psCommentsTitle">
          <button class="ps-modal-close" type="button" data-ps-close-comments aria-label="Close comments modal">&times;</button>
          <div class="ps-panel-heading ps-comments-heading">
            <p class="eyebrow">Comments</p>
            <h2 id="psCommentsTitle" data-ps-comments-title>Post comments</h2>
            <p data-ps-comments-subtitle>Read and add soft replies.</p>
          </div>
          <div class="ps-comments-post-preview" data-ps-comments-post-preview></div>
          <div class="ps-comments-list" data-ps-comments-list></div>
          <form class="ps-comments-form" data-ps-comments-form novalidate>
            <label>
              <span data-ps-comment-label>Add a comment</span>
              <textarea name="comment" maxlength="500" rows="3" placeholder="Write a kind comment..."></textarea>
            </label>
            <div class="ps-comment-toolbar">
              <div class="ps-comment-emoji-row">
                <button class="ps-comment-emoji-toggle" type="button" data-ps-comment-emoji-toggle aria-label="Open emoji picker" title="Emoji" aria-expanded="false">😊</button>
                <div class="ps-comment-emoji-panel" data-ps-comment-emoji-panel hidden>
                  <button type="button" data-ps-comment-emoji="✨" aria-label="Insert ✨">✨</button><button type="button" data-ps-comment-emoji="🥹" aria-label="Insert 🥹">🥹</button><button type="button" data-ps-comment-emoji="🙏" aria-label="Insert 🙏">🙏</button><button type="button" data-ps-comment-emoji="🌷" aria-label="Insert 🌷">🌷</button><button type="button" data-ps-comment-emoji="🌸" aria-label="Insert 🌸">🌸</button><button type="button" data-ps-comment-emoji="🫶" aria-label="Insert 🫶">🫶</button><button type="button" data-ps-comment-emoji="💫" aria-label="Insert 💫">💫</button><button type="button" data-ps-comment-emoji="☁️" aria-label="Insert ☁️">☁️</button><button type="button" data-ps-comment-emoji="🕊️" aria-label="Insert 🕊️">🕊️</button><button type="button" data-ps-comment-emoji="😊" aria-label="Insert 😊">😊</button><button type="button" data-ps-comment-emoji="💙" aria-label="Insert 💙">💙</button><button type="button" data-ps-comment-emoji="🤍" aria-label="Insert 🤍">🤍</button><button type="button" data-ps-comment-emoji="🩵" aria-label="Insert 🩵">🩵</button><button type="button" data-ps-comment-emoji="💜" aria-label="Insert 💜">💜</button><button type="button" data-ps-comment-emoji="💗" aria-label="Insert 💗">💗</button><button type="button" data-ps-comment-emoji="💖" aria-label="Insert 💖">💖</button><button type="button" data-ps-comment-emoji="🥰" aria-label="Insert 🥰">🥰</button><button type="button" data-ps-comment-emoji="😭" aria-label="Insert 😭">😭</button><button type="button" data-ps-comment-emoji="🙌" aria-label="Insert 🙌">🙌</button><button type="button" data-ps-comment-emoji="🫂" aria-label="Insert 🫂">🫂</button><button type="button" data-ps-comment-emoji="🌙" aria-label="Insert 🌙">🌙</button><button type="button" data-ps-comment-emoji="⭐" aria-label="Insert ⭐">⭐</button><button type="button" data-ps-comment-emoji="🌻" aria-label="Insert 🌻">🌻</button><button type="button" data-ps-comment-emoji="🍃" aria-label="Insert 🍃">🍃</button>
                </div>
              </div>
              <span data-ps-comment-count>0/500</span>
              <button class="btn primary ps-comment-send-btn" type="submit" data-ps-comment-submit aria-label="Post comment" title="Post comment"><span aria-hidden="true">➤</span></button>
            </div>
            <p class="ps-comments-edit-note" data-ps-comment-edit-note></p>
            <p class="ps-message" data-ps-comments-message></p>
          </form>
        </div>
      </div>
    `);

    return document.querySelector("[data-ps-comments-modal]");
  }

  function commentsModalNode(selector) {
    const modal = ensureCommentsModal();
    return selector ? modal.querySelector(selector) : modal;
  }

  function setCommentsMessage(message, type) {
    setMessage(commentsModalNode("[data-ps-comments-message]"), message || "", type || "info");
  }

  function closeCommentsModal() {
    const modal = document.querySelector("[data-ps-comments-modal]");
    if (modal) closeModal(modal);
    activeCommentsPostId = "";
    activeEditingCommentId = "";
    activeReplyParentCommentId = "";
    activeComments = [];
    commentsLoading = false;
  }

  function closeCommentActionMenus(exceptMenu) {
    document.querySelectorAll("[data-ps-comment-menu]").forEach(menu => {
      if (exceptMenu && menu === exceptMenu) return;
      menu.dataset.open = "false";
      const button = menu.querySelector("[data-ps-comment-menu-toggle]");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  }

  function currentUserId() {
    const sessionUserId = currentSession && currentSession.user && currentSession.user.id
      ? String(currentSession.user.id)
      : "";

    if (sessionUserId) return sessionUserId;

    if (typeof currentUser !== "undefined" && currentUser && currentUser.id) {
      return String(currentUser.id);
    }

    return "";
  }

  function isCurrentUserComment(comment) {
    const ownId = currentUserId();
    if (!ownId || !comment) return false;
    const commentUserId = comment.user_id || (comment.author && comment.author.id);
    return String(commentUserId || "") === ownId;
  }

  function commentAgeMs(comment) {
    const created = comment && comment.created_at ? new Date(comment.created_at).getTime() : 0;
    if (!created || Number.isNaN(created)) return Number.POSITIVE_INFINITY;
    return Date.now() - created;
  }

  function canEditComment(comment) {
    if (!comment || comment.is_deleted) return false;
    if (comment.can_edit === true) return true;
    if (comment.can_manage === true || isAdminMode) return true;
    if (comment.is_hidden) return false;
    if (!isCurrentUserComment(comment)) return false;
    return commentAgeMs(comment) <= COMMENT_EDIT_WINDOW_MS;
  }

  function commentParentId(comment) {
    return String((comment && (comment.parent_comment_id || comment.parentCommentId)) || "");
  }

  function isTopLevelComment(comment) {
    return !commentParentId(comment);
  }

  function topLevelComments() {
    return activeComments.filter(comment => isTopLevelComment(comment));
  }

  function repliesForComment(commentId) {
    const cleanId = String(commentId || "");
    if (!cleanId) return [];

    return activeComments
      .filter(comment => String(commentParentId(comment)) === cleanId)
      .sort((left, right) => new Date(left.created_at || 0) - new Date(right.created_at || 0));
  }

  function activeOwnComment() {
    return activeComments.find(comment => (
      isTopLevelComment(comment) &&
      isCurrentUserComment(comment) &&
      !comment.is_deleted
    )) || null;
  }

  function activeOwnReply(parentCommentId) {
    const cleanId = String(parentCommentId || "");
    if (!cleanId) return null;

    return activeComments.find(comment => (
      String(commentParentId(comment)) === cleanId &&
      isCurrentUserComment(comment) &&
      !comment.is_deleted
    )) || null;
  }

  function canReplyToComment(comment) {
    if (!comment || !isTopLevelComment(comment) || comment.is_deleted || comment.is_hidden) return false;
    if (!currentSession || !sessionToken()) return false;
    if (isCurrentUserComment(comment)) return false;
    if (activeOwnReply(comment.id)) return false;
    return comment.can_reply !== false;
  }

  function resetCommentReplyMode() {
    activeReplyParentCommentId = "";
  }

  function resetCommentEditMode() {
    activeEditingCommentId = "";
  }

  function setCommentReplyMode(comment) {
    if (!comment || !canReplyToComment(comment)) {
      setCommentsMessage("You already replied to this comment or cannot reply to it.", "error");
      return;
    }

    activeEditingCommentId = "";
    activeReplyParentCommentId = String(comment.id || "");

    closeCommentActionMenus();
    clearCommentsMessage();
    renderCommentsModal();

    setTimeout(() => {
      const form = commentsModalNode(`[data-ps-reply-parent-comment-id="${activeReplyParentCommentId}"]`);
      const textarea = form ? form.querySelector("textarea[name='comment']") : null;

      if (form && typeof form.scrollIntoView === "function") {
        form.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      if (textarea) {
        textarea.value = "";
        textarea.focus({ preventScroll: true });
        keepMobileTypingTargetVisible(textarea);
      }
    }, 0);
  }

  function setCommentEditMode(comment) {
    if (!comment || !canEditComment(comment)) {
      setCommentsMessage("This comment can no longer be edited.", "error");
      return;
    }

    const isAdminEditingAnother = !isCurrentUserComment(comment) && Boolean(comment.can_manage || isAdminMode);

    activeReplyParentCommentId = "";
    activeEditingCommentId = String(comment.id || "");
    const textarea = commentsModalNode("textarea[name='comment']");
    if (textarea) {
      textarea.value = comment.body || "";
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      keepMobileTypingTargetVisible(textarea);
    }

    setCommentsMessage(
      isAdminEditingAnother
        ? "Editing this comment as admin. Save carefully."
        : "Editing your comment. You can save changes within 30 minutes.",
      "info"
    );

    renderCommentsModal();
  }


  function closeCommentEmojiPanel() {
    const panel = commentsModalNode("[data-ps-comment-emoji-panel]");
    const toggle = commentsModalNode("[data-ps-comment-emoji-toggle]");

    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }


  // Q65F mobile typing support
  function isMobileTypingViewport() {
    return Boolean(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  }

  function updateMobileViewportState() {
    if (!document || !document.documentElement || !document.body) return;

    const viewport = window.visualViewport || null;
    const height = viewport && viewport.height ? viewport.height : window.innerHeight;
    const baseHeight = window.innerHeight || height;
    const offsetTop = viewport && viewport.offsetTop ? viewport.offsetTop : 0;
    const keyboardOffset = Math.max(0, Math.round(baseHeight - height - offsetTop));

    document.documentElement.style.setProperty("--ps-visual-viewport-height", `${Math.max(320, Math.round(height))}px`);
    document.documentElement.style.setProperty("--ps-keyboard-offset", `${keyboardOffset}px`);

    document.body.classList.toggle("ps-keyboard-visible", isMobileTypingViewport() && keyboardOffset > 80);
  }

  function activeMobileTypingTarget() {
    const active = document.activeElement;
    if (!active || !active.matches) return null;

    const selector = "[data-ps-comments-modal] textarea[name='comment'], [data-ps-compose-modal] textarea[name='post']";
    return active.matches(selector) ? active : null;
  }

  function keepMobileTypingTargetVisible(target, delay = 140) {
    if (!target || !target.closest || !isMobileTypingViewport()) return;

    updateMobileViewportState();

    window.setTimeout(() => {
      const anchor = target.closest("[data-ps-comments-form], [data-ps-composer], .ps-modal-card") || target;

      try {
        anchor.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch (error) {
        anchor.scrollIntoView(false);
      }

      const card = target.closest(".ps-modal-card");
      if (card && target.closest("[data-ps-comments-form], [data-ps-composer]")) {
        card.scrollTop = card.scrollHeight;
      }
    }, delay);
  }

  function handleMobileTypingFocus(event) {
    const target = event.target;
    if (!target || !target.matches) return;

    const selector = "[data-ps-comments-modal] textarea[name='comment'], [data-ps-compose-modal] textarea[name='post']";
    if (!target.matches(selector)) return;

    document.body.classList.add("ps-mobile-typing-active");
    keepMobileTypingTargetVisible(target, 220);
  }

  function handleMobileTypingBlur() {
    window.setTimeout(() => {
      if (!activeMobileTypingTarget()) {
        document.body.classList.remove("ps-mobile-typing-active");
      }

      updateMobileViewportState();
    }, 120);
  }

  function handleMobileTypingViewportChange() {
    updateMobileViewportState();

    const target = activeMobileTypingTarget();
    if (target) keepMobileTypingTargetVisible(target, 80);
  }

  function insertCommentEmoji(textarea, emoji, options = {}) {
    if (!textarea || textarea.disabled || !emoji) return;

    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const next = `${before}${emoji}${after}`.slice(0, 500);

    textarea.value = next;
    const cursor = Math.min(start + emoji.length, textarea.value.length);
    const shouldFocus = !options || options.focus !== false;

    if (shouldFocus) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(cursor, cursor);
      keepMobileTypingTargetVisible(textarea);
    } else {
      try {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      } catch (error) {
        // Some mobile browsers block selection changes when the textarea is blurred.
      }
    }

    renderCommentsModal();
  }

  function renderCommentItem(comment) {
    const author = comment.author || {};
    const username = author.username || "someone";
    const isReply = !isTopLevelComment(comment);
    const canDelete = Boolean(comment.can_manage || isAdminMode);
    const canHide = Boolean(comment.can_hide || isAdminMode);
    const canEdit = canEditComment(comment);
    const canReply = !isReply && canReplyToComment(comment);
    const hiddenClass = comment.is_hidden ? " is-hidden-by-admin" : "";
    const replyClass = isReply ? " is-reply" : "";
    const hiddenLabel = comment.is_hidden ? `<span class="ps-comment-hidden-label">Hidden</span>` : "";
    const createdAt = comment.created_at ? new Date(comment.created_at).getTime() : 0;
    const updatedAt = comment.updated_at ? new Date(comment.updated_at).getTime() : 0;
    const isEdited = createdAt && updatedAt && Math.abs(updatedAt - createdAt) > 1500;
    const editedLabel = isEdited ? `<span class="ps-comment-date">Edited</span>` : "";
    const dateLabel = escapeHtml(postDateDisplayLabel(comment.created_at) || formatDate(comment.created_at));
    const actions = [];

    const inlineReplyAction = canReply
      ? `<div class="ps-comment-inline-actions"><button class="ps-comment-reply-btn" type="button" data-ps-reply-comment="${escapeHtml(comment.id)}">Reply</button></div>`
      : "";

    if (canEdit) {
      actions.push(`<button type="button" data-ps-edit-comment="${escapeHtml(comment.id)}">Edit</button>`);
    }

    if (canDelete) {
      actions.push(`<button type="button" data-ps-delete-comment="${escapeHtml(comment.id)}">Delete</button>`);
    }

    if (canHide) {
      actions.push(`<button type="button" data-ps-toggle-comment-hidden="${escapeHtml(comment.id)}" data-hidden="${comment.is_hidden ? "true" : "false"}">${comment.is_hidden ? "Unhide" : "Hide"}</button>`);
    }

    const actionMenu = actions.length
      ? `
          <div class="ps-comment-menu" data-ps-comment-menu data-open="false">
            <button class="ps-comment-menu-toggle" type="button" data-ps-comment-menu-toggle aria-label="Comment options" aria-expanded="false"><span class="ps-comment-menu-dots" aria-hidden="true"></span></button>
            <div class="ps-comment-menu-popover" role="menu">
              ${actions.join("")}
            </div>
          </div>
        `
      : "";

    const replies = isReply ? [] : repliesForComment(comment.id);
    const repliesHtml = replies.length
      ? `<div class="ps-comment-replies">${replies.map(renderCommentItem).join("")}</div>`
      : "";

    const inlineReplyComposer = (!isReply && String(activeReplyParentCommentId || "") === String(comment.id || ""))
      ? `
          <form class="ps-inline-reply-form" data-ps-comments-form data-ps-reply-parent-comment-id="${escapeHtml(comment.id)}">
            <div class="ps-inline-reply-head">
              <span>Reply to @${escapeHtml(username)}</span>
              <button class="ps-comment-mode-cancel" type="button" data-ps-cancel-comment-reply>Cancel reply</button>
            </div>
            <div class="ps-inline-reply-row">
              <textarea name="comment" maxlength="500" placeholder="Write a kind reply..."></textarea>
              <button class="ps-inline-reply-send" type="submit" aria-label="Post reply" title="Post reply">
                <span aria-hidden="true">➤</span>
              </button>
            </div>
          </form>
        `
      : "";

    return `
        <article class="ps-comment-item${hiddenClass}${replyClass}" data-comment-id="${escapeHtml(comment.id)}" data-parent-comment-id="${escapeHtml(commentParentId(comment))}">
          <div class="ps-comment-meta">
            <div class="ps-comment-author-line">
              ${renderPublicSpaceUserButton(author, username)}
              ${renderPostBadges(author)}
              <span class="ps-comment-date">${dateLabel}</span>
              ${editedLabel}
              ${hiddenLabel}
            </div>
            ${actionMenu}
          </div>
          <p>${escapeHtml(comment.body)}</p>
          ${inlineReplyAction}
          ${inlineReplyComposer}
          ${repliesHtml}
        </article>
      `;
  }


  function renderCommentsModal() {
    const modal = ensureCommentsModal();
    const post = currentCommentsPost();
    const title = modal.querySelector("[data-ps-comments-title]");
    const subtitle = modal.querySelector("[data-ps-comments-subtitle]");
    const preview = modal.querySelector("[data-ps-comments-post-preview]");
    const listNode = modal.querySelector("[data-ps-comments-list]");
    const textarea = modal.querySelector("textarea[name='comment']");
    const counter = modal.querySelector("[data-ps-comment-count]");
    const submitButton = modal.querySelector("[data-ps-comments-form] button[type='submit']");
    const label = modal.querySelector("[data-ps-comment-label]");
    const note = modal.querySelector("[data-ps-comment-edit-note]");
    const emojiToggle = modal.querySelector("[data-ps-comment-emoji-toggle]");
    const emojiPanel = modal.querySelector("[data-ps-comment-emoji-panel]");

    let replyParent = activeReplyParentCommentId
      ? activeComments.find(comment => String(comment.id || "") === String(activeReplyParentCommentId))
      : null;

    if (activeReplyParentCommentId && !replyParent) {
      activeReplyParentCommentId = "";
      replyParent = null;
    }

    const editingComment = activeEditingCommentId
      ? activeComments.find(comment => String(comment.id || "") === String(activeEditingCommentId))
      : null;

    if (activeEditingCommentId && !editingComment) {
      activeEditingCommentId = "";
    }

    const isEditing = Boolean(editingComment);
    const isEditingReply = Boolean(editingComment && !isTopLevelComment(editingComment));
    const isReplying = false;
    const ownComment = activeOwnComment();
    const alreadyCommented = Boolean(ownComment && !isEditing);
    const canUseForm = Boolean(currentSession && sessionToken() && !commentsLoading && (!alreadyCommented || isEditing));
    const length = textarea ? textarea.value.length : 0;

    if (title) title.textContent = post ? `Comments · ${commentCount(post)}` : "Post comments";
    if (subtitle) subtitle.textContent = post ? `Replies for @${(post.author && post.author.username) || "someone"}'s post.` : "Read and add soft replies.";

    if (preview) {
      preview.innerHTML = post
        ? `${renderPublicSpaceUserButton(post.author || {}, (post.author && post.author.username) || "someone")}<p>${escapeHtml(post.body)}</p>`
        : "";
    }

    if (listNode) {
      const roots = topLevelComments();

      if (commentsLoading) {
        listNode.innerHTML = `<div class="ps-comments-empty">Loading comments...</div>`;
      } else if (!roots.length) {
        listNode.innerHTML = `<div class="ps-comments-empty">No comments yet.</div>`;
      } else {
        listNode.innerHTML = roots.map(renderCommentItem).join("");
      }
    }

    if (label) {
      if (isEditing) {
        label.textContent = isEditingReply ? "Edit your reply" : "Edit your comment";
      } else if (isReplying) {
        label.innerHTML = `
          <span>Reply to @${escapeHtml((replyParent.author && replyParent.author.username) || "someone")}</span>
          <button class="ps-comment-mode-cancel" type="button" data-ps-cancel-comment-reply>Cancel reply</button>
        `;
      } else {
        label.textContent = "Add a comment";
      }
    }

    if (textarea) {
      textarea.disabled = !canUseForm;

      if (alreadyCommented && ownComment && canEditComment(ownComment)) {
        textarea.placeholder = isReplying
          ? "You already replied. You can edit your reply within 30 minutes."
          : "You already commented. You can edit your comment within 30 minutes.";
      } else if (alreadyCommented) {
        textarea.placeholder = isReplying
          ? "You already replied to this comment. Delete your reply before adding another."
          : "You already commented. Delete your comment before adding another.";
      } else if (isReplying) {
        textarea.placeholder = "Write a kind reply...";
      } else {
        textarea.placeholder = isEditing ? "Edit your kind comment..." : "Write a kind comment...";
      }
    }

    if (counter) counter.textContent = `${length}/500`;

    if (submitButton) {
      const submitLabel = isEditing
        ? "Save changes"
        : (alreadyCommented ? (isReplying ? "Already replied" : "Already commented") : (isReplying ? "Post reply" : "Post comment"));

      submitButton.innerHTML = `<span aria-hidden="true">${isEditing ? "✓" : "➤"}</span>`;
      submitButton.setAttribute("aria-label", submitLabel);
      submitButton.setAttribute("title", submitLabel);
      submitButton.disabled = !canUseForm || length < 1 || length > 500;
    }

    if (emojiToggle) {
      emojiToggle.disabled = !canUseForm;
      emojiToggle.setAttribute("aria-expanded", emojiPanel && !emojiPanel.hidden ? "true" : "false");
    }

    if (emojiPanel && !canUseForm) {
      emojiPanel.hidden = true;
    }

    if (note) {
      if (isEditing) {
        note.innerHTML = `<button type="button" data-ps-cancel-comment-edit>Cancel edit</button>`;
      } else if (isReplying) {
        note.innerHTML = "";
      } else {
        note.innerHTML = "";
      }
    }
  }


  async function loadCommentsForPost(postId, showLoading = true) {
    activeCommentsPostId = String(postId || "");
    if (!activeCommentsPostId) return [];

    if (showLoading) {
      commentsLoading = true;
      renderCommentsModal();
    }

    try {
      const comments = await rpc("list_public_space_comments", {
        input_session_token: sessionToken() || null,
        input_post_id: activeCommentsPostId
      });

      activeComments = Array.isArray(comments) ? comments : [];

      if (activeEditingCommentId && !activeComments.some(comment => String(comment.id || "") === String(activeEditingCommentId))) {
        activeEditingCommentId = "";
      }

      syncPostCommentCount(activeCommentsPostId, activeComments.length);
      setCommentsMessage("", "info");
      return activeComments;
    } catch (error) {
      activeComments = [];
      setCommentsMessage(getErrorMessage(error), "error");
      return [];
    } finally {
      commentsLoading = false;
      renderCommentsModal();
    }
  }

  async function openCommentsPanel(postId) {
    const post = postById(postId);
    if (!post) {
      setFeedStatus("Post could not be found. Refresh and try again.");
      return;
    }

    activeCommentsPostId = String(postId || "");
    activeEditingCommentId = "";
    activeReplyParentCommentId = "";
    activeComments = [];

    const modal = ensureCommentsModal();
    const textarea = modal.querySelector("textarea[name='comment']");
    if (textarea) textarea.value = "";

    setCommentsMessage("", "info");
    renderCommentsModal();
    openModal(modal);

    await loadCommentsForPost(activeCommentsPostId, true);
  }

  async function refreshCommentsAndPosts(postId) {
    await loadPosts();
    activeCommentsPostId = String(postId || activeCommentsPostId || "");
    if (activeCommentsPostId) await loadCommentsForPost(activeCommentsPostId, false);
  }

  async function handleCommentsSubmit(event) {
    const form = event.target.closest("[data-ps-comments-form]");
    if (!form) return;

    event.preventDefault();

    if (!currentSession || !sessionToken()) {
      closeCommentsModal();
      showAuth("login");
      return;
    }

    const textarea = form.querySelector("textarea[name='comment']");
    const body = textarea ? textarea.value.trim() : "";
    const button = form.querySelector("button[type='submit']");

    if (!activeCommentsPostId) {
      setCommentsMessage("Choose a post first.", "error");
      return;
    }

    if (body.length < 1 || body.length > 500) {
      setCommentsMessage("Comment must be 1 to 500 characters.", "error");
      return;
    }

    const editingComment = activeEditingCommentId
      ? activeComments.find(comment => String(comment.id || "") === String(activeEditingCommentId))
      : null;

    const formReplyParentId = form.dataset.psReplyParentCommentId || "";
    const replyParent = formReplyParentId && !editingComment
      ? activeComments.find(comment => String(comment.id || "") === String(formReplyParentId))
      : null;

    if (activeEditingCommentId && !editingComment) {
      resetCommentEditMode();
      setCommentsMessage("That comment is no longer available to edit.", "error");
      renderCommentsModal();
      return;
    }

    if (editingComment && !canEditComment(editingComment)) {
      resetCommentEditMode();
      setCommentsMessage("This comment can no longer be edited.", "error");
      renderCommentsModal();
      return;
    }

    if (!editingComment && formReplyParentId && !replyParent) {
      resetCommentReplyMode();
      setCommentsMessage("That comment is no longer available to reply to.", "error");
      renderCommentsModal();
      return;
    }

    if (!editingComment && replyParent && activeOwnReply(replyParent.id)) {
      setCommentsMessage("You already replied to this comment. Delete your reply before adding another.", "error");
      renderCommentsModal();
      return;
    }

    if (!editingComment && replyParent && !canReplyToComment(replyParent)) {
      setCommentsMessage("You cannot reply to this comment.", "error");
      renderCommentsModal();
      return;
    }

    if (!editingComment && !replyParent && activeOwnComment()) {
      setCommentsMessage("You already commented on this post. Delete your comment before adding another.", "error");
      renderCommentsModal();
      return;
    }

    if (button) button.disabled = true;

    try {
      if (editingComment) {
        setCommentsMessage("Saving changes...", "info");

        await rpc("edit_public_space_comment", {
          input_session_token: sessionToken(),
          input_comment_id: activeEditingCommentId,
          input_body: body
        });

        resetCommentEditMode();
        if (textarea) textarea.value = "";

        await refreshCommentsAndPosts(activeCommentsPostId);
        setCommentsMessage(commentParentId(editingComment) ? "Reply updated." : "Comment updated.", "success");
      } else {
        setCommentsMessage(replyParent ? "Posting reply..." : "Posting comment...", "info");

        await rpc("create_public_space_comment", {
          input_session_token: sessionToken(),
          input_post_id: activeCommentsPostId,
          input_body: body,
          input_parent_comment_id: replyParent ? replyParent.id : null
        });

        resetCommentReplyMode();
        if (textarea) textarea.value = "";

        await refreshCommentsAndPosts(activeCommentsPostId);
        loadPublicSpaceNotifications({ silent: true }).catch(() => {});
        setCommentsMessage(replyParent ? "Reply posted. Notification sent." : "Comment posted. Notification sent.", "success");
      }
    } catch (error) {
      setCommentsMessage(getErrorMessage(error), "error");
    } finally {
      renderCommentsModal();
    }
  }


  async function handleCommentsModalClick(event) {
    const closeButton = event.target.closest("[data-ps-close-comments]");
    const menuToggle = event.target.closest("[data-ps-comment-menu-toggle]");
    const commentMenu = event.target.closest("[data-ps-comment-menu]");
    const deleteButton = event.target.closest("[data-ps-delete-comment]");
    const hideButton = event.target.closest("[data-ps-toggle-comment-hidden]");
    const editButton = event.target.closest("[data-ps-edit-comment]");
    const replyButton = event.target.closest("[data-ps-reply-comment]");
    const ownEditButton = event.target.closest("[data-ps-edit-own-comment]");
    const cancelEditButton = event.target.closest("[data-ps-cancel-comment-edit]");
    const cancelReplyButton = event.target.closest("[data-ps-cancel-comment-reply]");
    const emojiToggle = event.target.closest("[data-ps-comment-emoji-toggle]");
    const emojiButton = event.target.closest("[data-ps-comment-emoji]");
    const emojiPanelClick = event.target.closest("[data-ps-comment-emoji-panel]");
    const modal = event.target.closest("[data-ps-comments-modal]");

    if (closeButton) {
      event.preventDefault();
      closeCommentsModal();
      return;
    }

    if (!modal) {
      closeCommentActionMenus();
      closeCommentEmojiPanel();
      return;
    }

    if (cancelReplyButton) {
      event.preventDefault();
      resetCommentReplyMode();
      const textarea = commentsModalNode("textarea[name='comment']");
      if (textarea) textarea.value = "";
      setCommentsMessage("Reply cancelled.", "info");
      renderCommentsModal();
      return;
    }

    if (replyButton) {
      event.preventDefault();
      const comment = activeComments.find(item => String(item.id || "") === String(replyButton.dataset.psReplyComment || ""));
      setCommentReplyMode(comment);
      return;
    }

    if (emojiToggle) {
      event.preventDefault();
      const panel = commentsModalNode("[data-ps-comment-emoji-panel]");
      const shouldOpen = panel ? panel.hidden : false;
      if (panel) panel.hidden = !shouldOpen;
      emojiToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      return;
    }

    if (emojiButton) {
      event.preventDefault();

      const textarea = commentsModalNode("textarea[name='comment']");
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }

      insertCommentEmoji(textarea, emojiButton.dataset.psCommentEmoji || emojiButton.textContent || "", { focus: false });
      closeCommentEmojiPanel();

      if (emojiButton && typeof emojiButton.blur === "function") {
        emojiButton.blur();
      }

      return;
    }

    if (!emojiPanelClick) {
      closeCommentEmojiPanel();
    }

    if (cancelEditButton) {
      event.preventDefault();
      resetCommentEditMode();
      const textarea = commentsModalNode("textarea[name='comment']");
      if (textarea) textarea.value = "";
      setCommentsMessage("", "info");
      renderCommentsModal();
      return;
    }

    if (editButton || ownEditButton) {
      event.preventDefault();
      closeCommentActionMenus();
      const id = (editButton && editButton.dataset.psEditComment) || (ownEditButton && ownEditButton.dataset.psEditOwnComment) || "";
      const comment = activeComments.find(item => String(item.id || "") === String(id));
      setCommentEditMode(comment);
      return;
    }

    if (menuToggle) {
      event.preventDefault();
      event.stopPropagation();

      const menu = menuToggle.closest("[data-ps-comment-menu]");
      if (!menu) return;

      const shouldOpen = menu.dataset.open !== "true";
      closeCommentActionMenus();

      if (shouldOpen) {
        menu.dataset.open = "true";
        menuToggle.setAttribute("aria-expanded", "true");
      }

      return;
    }

    if (!commentMenu) {
      closeCommentActionMenus();
    }

    if (!deleteButton && !hideButton) return;

    if (!currentSession || !sessionToken()) {
      closeCommentsModal();
      showAuth("login");
      return;
    }

    try {
      if (deleteButton) {
        deleteButton.disabled = true;
        setCommentsMessage("Deleting comment...", "info");

        if (String(activeEditingCommentId || "") === String(deleteButton.dataset.psDeleteComment || "")) {
          resetCommentEditMode();
        }

        await rpc("delete_public_space_comment", {
          input_session_token: sessionToken(),
          input_comment_id: deleteButton.dataset.psDeleteComment
        });
      }

      if (hideButton) {
        hideButton.disabled = true;
        const isHidden = hideButton.dataset.hidden === "true";
        setCommentsMessage(isHidden ? "Unhiding comment..." : "Hiding comment...", "info");

        await rpc("admin_set_public_space_comment_hidden", {
          input_session_token: sessionToken(),
          input_comment_id: hideButton.dataset.psToggleCommentHidden,
          input_is_hidden: !isHidden
        });
      }

      await refreshCommentsAndPosts(activeCommentsPostId);
      setCommentsMessage(deleteButton ? "Comment deleted." : "Comment updated.", "success");
    } catch (error) {
      setCommentsMessage(getErrorMessage(error), "error");
    } finally {
      renderCommentsModal();
    }
  }

  function handleCommentsModalInput(event) {
    if (!event.target.closest("[data-ps-comments-form]")) return;
    renderCommentsModal();
  }

  function handleCommentsModalKeydown(event) {
    if (event.key !== "Escape") return;
    if (document.querySelector("[data-ps-comments-modal]:not([hidden])")) closeCommentsModal();
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
          <button class="ps-route-back" type="button" data-ps-route-back aria-label="Go back">&#8592;</button>
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
    screen.classList.remove("ps-notifications-screen");
    const screenTop = screen.querySelector(".ps-admin-screen-top");
    screen.querySelectorAll("[data-ps-control-top-actions]").forEach(node => {
      const movedBackButton = node.querySelector("[data-ps-route-back]");
      if (movedBackButton && screenTop) {
        screenTop.appendChild(movedBackButton);
      }
      node.remove();
    });

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
    return PUBLIC_SPACE_BADGE_OPTIONS.find(option => {
      const aliases = Array.isArray(option.aliases) ? option.aliases : [];
      return normalizeBadgeValue(option.value) === clean
        || normalizeBadgeValue(option.label) === clean
        || aliases.some(alias => normalizeBadgeValue(alias) === clean);
    }) || null;
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

  function publicSpaceUserId(user) {
    return String((user && (user.id || user.user_id)) || "").trim();
  }

  function publicSpaceUsername(user, fallback) {
    return String((user && user.username) || fallback || "someone").trim() || "someone";
  }

  function isPublicSpaceUserActive(user) {
    if (!user || user.is_disabled) return false;

    const lastSeenAt = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
    if (lastSeenAt) {
      return Date.now() - lastSeenAt <= PUBLIC_SPACE_ACTIVE_WINDOW_MS;
    }

    return user.is_active === true;
  }

  function hasPublicSpacePresence(user) {
    if (!user || user.is_disabled) return false;

    return Boolean(user.last_seen_at || typeof user.is_active === "boolean");
  }

  function renderPublicSpaceActiveDot(user) {
    if (!hasPublicSpacePresence(user)) return "";

    const id = publicSpaceUserId(user);
    const ownId = publicSpaceUserId(currentUser);
    if (id && ownId && id === ownId) return "";

    const isActive = isPublicSpaceUserActive(user);
    const className = isActive ? "is-active" : "is-idle";
    const label = isActive ? "Active now" : "Idle";

    return `<span class="ps-presence-dot ${className}" title="${label}" aria-label="${label}"></span>`;
  }

  function renderPublicSpaceUsernameStrong(user, fallbackUsername) {
    const username = publicSpaceUsername(user, fallbackUsername);
    return `<strong class="ps-user-name">@${escapeHtml(username)}${renderPublicSpaceActiveDot(user)}</strong>`;
  }

  function publicUserProfileRoute(user) {
    const id = publicSpaceUserId(user);
    return id ? `user-${id.toLowerCase()}` : "profile";
  }

  function isPublicUserProfileRoute(route) {
    return /^user-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(route || "").trim().toLowerCase());
  }

  function publicUserIdFromRoute(route) {
    const cleanRoute = String(route || "").trim().toLowerCase();
    return isPublicUserProfileRoute(cleanRoute) ? cleanRoute.replace(/^user-/, "") : "";
  }

  function rememberPublicProfileBackRoute(route, targetRoute) {
    const cleanRoute = normalizePublicSpaceRoute(route || "home");
    const cleanTarget = normalizePublicSpaceRoute(targetRoute || "home");

    if (cleanTarget === "home") {
      publicProfileBackRoute = "home";
      return publicProfileBackRoute;
    }

    publicProfileBackRoute = cleanRoute && cleanRoute !== cleanTarget ? cleanRoute : "home";
    return publicProfileBackRoute;
  }

  function publicProfileBackTarget() {
    const currentRoute = currentPublicSpaceRoute();
    const backRoute = normalizePublicSpaceRoute(publicProfileBackRoute || "home");

    return backRoute && backRoute !== currentRoute ? backRoute : "home";
  }

  function renderPublicSpaceUserButton(user, fallbackUsername) {
    const id = publicSpaceUserId(user);
    const username = publicSpaceUsername(user, fallbackUsername);
    const badgeLabel = String((user && user.badge_label) || "").trim();
    const lastSeenAt = String((user && user.last_seen_at) || "").trim();
    const isActive = isPublicSpaceUserActive(user);

    if (!id) {
      return renderPublicSpaceUsernameStrong(user, username);
    }

    return `<button class="ps-user-link" type="button" data-ps-author-anchor data-ps-open-user-profile data-user-id="${escapeHtml(id)}" data-username="${escapeHtml(username)}" data-badge-label="${escapeHtml(badgeLabel)}" data-last-seen-at="${escapeHtml(lastSeenAt)}" data-is-active="${isActive ? "true" : "false"}" aria-label="Open @${escapeHtml(username)} profile">@${escapeHtml(username)}${renderPublicSpaceActiveDot(user)}</button>`;
  }

  function rememberPublicProfileUser(user) {
    const id = publicSpaceUserId(user);
    if (!id) return null;

    activePublicProfileUser = {
      id,
      username: publicSpaceUsername(user),
      is_admin: Boolean(user && user.is_admin),
      is_premium: Boolean(user && user.is_premium),
      badge_label: String((user && user.badge_label) || "").trim(),
      last_seen_at: String((user && user.last_seen_at) || "").trim(),
      is_active: isPublicSpaceUserActive(user)
    };

    return activePublicProfileUser;
  }

  function userFromPublicProfileClick(button) {
    return rememberPublicProfileUser({
      id: button ? button.dataset.userId : "",
      username: button ? button.dataset.username : "",
      badge_label: button ? button.dataset.badgeLabel : "",
      last_seen_at: button ? button.dataset.lastSeenAt : "",
      is_active: button ? button.dataset.isActive === "true" : false
    });
  }

  function publicProfileUserFromPosts(userId) {
    const cleanId = String(userId || "").trim().toLowerCase();

    if (!cleanId) return null;

    if (currentUser && publicSpaceUserId(currentUser).toLowerCase() === cleanId) {
      return currentUser;
    }

    const fromPosts = (Array.isArray(latestPublicSpacePosts) ? latestPublicSpacePosts : [])
      .map(post => post && post.author)
      .find(author => publicSpaceUserId(author).toLowerCase() === cleanId);

    if (fromPosts) return fromPosts;

    if (activePublicProfileUser && publicSpaceUserId(activePublicProfileUser).toLowerCase() === cleanId) {
      return activePublicProfileUser;
    }

    return { id: userId, username: "user" };
  }

  function publicUserPosts(userId, posts) {
    const cleanId = String(userId || "").trim().toLowerCase();

    return (Array.isArray(posts) ? posts : [])
      .filter(post => publicSpaceUserId(post && post.author).toLowerCase() === cleanId)
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

      card.dataset.postDateKey = postCreatedDateKey(post);
      card.dataset.postCreatedAt = post.created_at || post.createdAt || post.posted_at || post.postedAt || post.date || post.timestamp || "";

      card.classList.add("ps-post-card-polished");

      const meta = card.querySelector(".ps-post-meta");
      if (!meta) return;

      const authorNode = meta.querySelector("[data-ps-author-anchor], strong");
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
        commentButton.textContent = commentCountText(post);
        commentButton.setAttribute("aria-label", "View comments");
      }

      const cardMeta = card.querySelector(".ps-post-meta");
      const authorNode = cardMeta ? cardMeta.querySelector("[data-ps-author-anchor], strong") : null;
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
          ${renderPublicSpaceUserButton(post.author || currentUser || {}, currentUser && currentUser.username ? currentUser.username : "user")}
          <span>${[hiddenLabel, escapeHtml(formatDate(post.created_at))].filter(Boolean).join(" ")}</span>
        </div>
        <p>${escapeHtml(post.body)}</p>
        <div class="ps-post-actions">
          <button type="button" data-ps-heart-post="${escapeHtml(post.id)}">${heartLabel} · ${Number(post.heart_count || 0)}</button>
          <button type="button" data-ps-comments-post="${escapeHtml(post.id)}">${commentCountText(post)}</button>
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
              ${renderPublicSpaceUsernameStrong(user, username)}
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

  function renderPublicUserProfileFilter(userId, totalPosts, visiblePosts) {
    const mode = publicSpacePostFilter.mode || "all";

    return `
      <div class="ps-public-profile-filter" data-ps-public-profile-filter data-user-id="${escapeHtml(userId)}">
        <label>
          <span>Filter posts</span>
          <select data-ps-public-profile-filter-mode>
            <option value="all"${mode === "all" ? " selected" : ""}>View all posts</option>
            <option value="today"${mode === "today" ? " selected" : ""}>Today</option>
            <option value="yesterday"${mode === "yesterday" ? " selected" : ""}>Yesterday</option>
          </select>
        </label>
      </div>
    `;
  }

  function renderPublicUserProfilePosts(userId) {
    const listNode = root.querySelector("[data-ps-public-profile-post-list]");
    if (!listNode) return;

    const allPosts = publicUserPosts(userId, latestPublicSpacePosts);
    const visiblePosts = allPosts.filter(postMatchesFilter);

    if (!allPosts.length) {
      listNode.innerHTML = `
        <div class="ps-public-profile-empty">
          <strong>No visible posts yet.</strong>
          <span>This user has no public posts available for you to view right now.</span>
        </div>
      `;
      return;
    }

    if (!visiblePosts.length) {
      listNode.innerHTML = `
        <div class="ps-public-profile-empty">
          <strong>No posts for this filter.</strong>
          <span>Try View all posts.</span>
        </div>
      `;
      return;
    }

    listNode.innerHTML = visiblePosts.map(renderProfilePostCard).join("");
    enhancePostCards(listNode, visiblePosts);
    polishPostCards(listNode, visiblePosts);
  }

  function renderPublicUserProfileScreen(userId) {
    const cleanId = String(userId || "").trim();
    const user = publicProfileUserFromPosts(cleanId);
    const username = publicSpaceUsername(user, "user");
    const initial = String(username || "@").charAt(0).toUpperCase() || "@";
    const allPosts = publicUserPosts(cleanId, latestPublicSpacePosts);
    const visiblePosts = allPosts.filter(postMatchesFilter);

    openControlScreen(
      `@${username}`,
      "",
      `
        <section class="ps-profile-page ps-public-profile-page" aria-label="@${escapeHtml(username)} Public Space profile" data-ps-public-profile data-user-id="${escapeHtml(cleanId)}">
          <header class="ps-profile-hero ps-public-profile-hero">
            <div class="ps-profile-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
            <div class="ps-profile-heading">
              ${renderPublicSpaceUsernameStrong(user, username)}
              ${renderProfileBadges(user)}
            </div>
          </header>

          ${renderPublicUserProfileFilter(cleanId, allPosts.length, visiblePosts.length)}

          <div class="ps-profile-post-list ps-public-profile-post-list" data-ps-public-profile-post-list></div>
        </section>
      `,
      "Profile"
    );

    renderPublicUserProfilePosts(cleanId);
  }

  function handlePublicUserProfileFilterChange(event) {
    const modeSelect = event.target.closest("[data-ps-public-profile-filter-mode]");
    if (!modeSelect) return;

    const selectedMode = modeSelect.value || "all";
    publicSpacePostFilter.mode = ["all", "today", "yesterday"].includes(selectedMode) ? selectedMode : "all";
    publicSpacePostFilter.date = "";

    const profile = root.querySelector("[data-ps-public-profile]");
    renderPublicUserProfilePosts(profile ? profile.dataset.userId : publicUserIdFromRoute(currentPublicSpaceRoute()));
  }

  function handlePublicProfileBackClick(event) {
    const button = event.target.closest("[data-ps-route-back]");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const targetRoute = publicProfileBackTarget();
    if (targetRoute === "home") publicProfileBackRoute = "home";
    navigatePublicSpaceRoute(targetRoute, { preserveBack: true });
  }

  function handlePublicUserProfileClick(event) {
    const button = event.target.closest("[data-ps-open-user-profile]");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const user = userFromPublicProfileClick(button);
    if (!user || !publicSpaceUserId(user)) return;

    const targetRoute = publicUserProfileRoute(user);
    rememberPublicProfileBackRoute(currentPublicSpaceRoute(), targetRoute);

    const modal = button.closest("[data-ps-comments-modal]");
    if (modal) closeCommentsModal();

    navigatePublicSpaceRoute(targetRoute);
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
    const allItems = buildNotificationItems();
    const unreadCount = unreadNotificationCount();

    openControlScreen(
      "Notifications",
      unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.` : "Your notification history.",
      `
        <section class="ps-notifications-history" data-ps-notifications-history>
          <div class="ps-notification-list ps-notifications-history-list">
            ${allItems.map(item => `
              <article class="ps-notification-item ${item.unread ? "is-unread" : ""}" data-ps-notification-item="${escapeHtml(item.id)}">
                <span class="ps-notification-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.detail)}</p>
                  ${item.time ? `<small>${escapeHtml(item.time)}</small>` : ""}
                </div>
                ${item.unread ? `<span class="ps-notification-dot" aria-hidden="true"></span>` : ""}
              </article>
            `).join("")}
          </div>
        </section>
      `,
      "Bell"
    );

    const screen = root.querySelector("[data-ps-control-screen]");
    const top = screen ? screen.querySelector(".ps-admin-screen-top") : null;
    const backButton = top ? top.querySelector("[data-ps-route-back]") : null;

    if (screen) screen.classList.add("ps-notifications-screen");
    if (top && backButton) {
      let topActions = top.querySelector("[data-ps-control-top-actions]");

      if (!topActions) {
        backButton.insertAdjacentHTML("beforebegin", `
          <div class="ps-notifications-history-actions ps-notifications-history-icon-actions" data-ps-control-top-actions aria-label="Notification actions">
            <button type="button" data-ps-notification-action="mark-read" aria-label="Mark all as read" title="Mark all as read">✓</button>
            <button type="button" data-ps-notification-action="clear" aria-label="Clear notifications" title="Clear notifications">🧹</button>
            <button type="button" data-ps-notification-refresh aria-label="Refresh notifications" title="Refresh notifications">↻</button>
          </div>
        `);
        topActions = top.querySelector("[data-ps-control-top-actions]");
      }

      if (topActions && !topActions.querySelector("[data-ps-route-back]")) {
        topActions.appendChild(backButton);
      }
    }

    refreshNotificationsScreenAfterLoad();
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
          <button class="ps-route-back" type="button" data-ps-route-back aria-label="Go back">&#8592;</button>
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

    if (isPublicUserProfileRoute(cleanRoute)) return cleanRoute;

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

    if (isPublicUserProfileRoute(cleanRoute)) {
      setPublicSpaceRouteMode(cleanRoute);
      closeAdminScreen();
      renderPublicUserProfileScreen(publicUserIdFromRoute(cleanRoute));
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
    const currentRoute = currentPublicSpaceRoute();
    if (!options.preserveBack) rememberPublicProfileBackRoute(currentRoute, cleanRoute);

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

      const selectedValues = splitBadgeLabels(input.value).map(label => {
        const option = badgeOptionFor(label);
        return normalizeBadgeValue(option ? option.value : label);
      });

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
        syncAdminUserCardBadgePreview(input.closest("[data-ps-admin-user-card]"), input.value);

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
  function ensureNotificationPanel() {
    let panel = document.querySelector("[data-ps-notification-panel]");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.className = "ps-notification-panel";
    panel.setAttribute("data-ps-notification-panel", "");
    panel.setAttribute("aria-label", "Notifications");
    panel.hidden = true;

    panel.innerHTML = `
      <header class="ps-notification-head">
        <div>
          <h2>Notifications</h2>
          <span data-ps-notification-summary>No unread notifications</span>
        </div>
        <div class="ps-notification-more-wrap">
          <button class="ps-notification-more" type="button" data-ps-notification-more aria-haspopup="menu" aria-expanded="false" aria-label="Notification options">•••</button>
          <div class="ps-notification-menu" data-ps-notification-menu hidden role="menu">
            <button type="button" role="menuitem" data-ps-notification-action="mark-read">✓ <span>Mark all as read</span></button>
            <button type="button" role="menuitem" data-ps-notification-action="clear">🧹 <span>Clear notifications</span></button>
            <button type="button" role="menuitem" data-ps-notification-action="settings">⚙ <span>Notification settings</span></button>
            <button type="button" role="menuitem" data-ps-notification-action="open">▣ <span>Open Notifications</span></button>
          </div>
        </div>
      </header>

      <div class="ps-notification-tabs" role="tablist" aria-label="Notification filters">
        <button type="button" data-ps-notification-filter="all" class="is-active">All</button>
        <button type="button" data-ps-notification-filter="unread">Unread</button>
      </div>

      <div class="ps-notification-list" data-ps-notification-list></div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  function notificationDetails(notification) {
    const details = notification && typeof notification.details === "object" && notification.details
      ? notification.details
      : {};

    return details;
  }

  function notificationTypeIcon(type, details = {}) {
    if (details.kind === "new_piece") return "📖";
    if (type === "heart") return "💗";
    if (type === "comment") return "💬";
    if (type === "admin") return "✨";
    return "🔔";
  }

  function notificationTimeLabel(value) {
    const created = value ? new Date(value) : null;

    if (!created || Number.isNaN(created.getTime())) return "";

    const diffMs = Date.now() - created.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return created.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    });
  }

  function normalizeNotificationItem(notification) {
    const details = notificationDetails(notification);
    const type = String(notification?.type || "");
    const actor = notification?.actor || {};
    const actorName = actor.username ? `@${actor.username}` : "Someone";
    const title = details.title
      || (details.kind === "new_piece" ? "New piece uploaded" : "")
      || (type === "heart" ? "New heart" : "")
      || (type === "comment" ? "New comment" : "")
      || "Notification";

    const detail = details.message
      || (details.kind === "new_piece" && details.piece_title ? `Admin uploaded “${details.piece_title}”. Check it out.` : "")
      || (type === "heart" ? `${actorName} hearted your post.` : "")
      || (type === "comment" ? `${actorName} commented on your post.` : "")
      || "You have a new Public Space notification.";

    return {
      id: notification.id,
      unread: notification.is_read !== true,
      icon: notificationTypeIcon(type, details),
      title,
      detail,
      time: notificationTimeLabel(notification.created_at),
      type,
      details,
      post_id: notification.post_id || "",
      comment_id: notification.comment_id || ""
    };
  }

  function buildNotificationItems() {
    if (!currentUser) {
      return [{
        id: "login",
        unread: false,
        icon: "🔔",
        title: "Login to see notifications.",
        detail: "Hearts, comments, and admin notices will appear here.",
        time: "",
        details: {}
      }];
    }

    if (notificationsLoading && !publicSpaceNotifications.length) {
      return [{
        id: "loading",
        unread: false,
        icon: "⏳",
        title: "Loading notifications...",
        detail: "Please wait while your notification history loads.",
        time: "",
        details: {}
      }];
    }

    const items = publicSpaceNotifications.map(normalizeNotificationItem);

    if (!items.length) {
      return [{
        id: "empty",
        unread: false,
        icon: "🔔",
        title: "No notifications yet.",
        detail: "New hearts, comments, and admin notices will show here.",
        time: "",
        details: {}
      }];
    }

    return items;
  }

  function unreadNotificationCount() {
    return publicSpaceNotifications.filter(item => item && item.is_read !== true).length;
  }

  function updateNotificationBell() {
    if (!bellButton) return;

    const count = unreadNotificationCount();
    let badge = bellButton.querySelector("[data-ps-bell-count]");

    bellButton.classList.toggle("has-unread", count > 0);
    bellButton.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");

    if (!count) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ps-bell-count";
      badge.dataset.psBellCount = "true";
      bellButton.appendChild(badge);
    }

    badge.textContent = count > 9 ? "9+" : String(count);
  }

  function getPublicSpaceLivePostsSnapshot(posts) {
    try {
      return JSON.stringify((Array.isArray(posts) ? posts : []).map(post => ({
        id: post.id,
        updated_at: post.updated_at,
        heart_count: post.heart_count,
        comment_count: post.comment_count,
        hearted_by_me: post.hearted_by_me,
        is_hidden: post.is_hidden,
        is_deleted: post.is_deleted
      })));
    } catch (error) {
      return String(Date.now());
    }
  }

  function normalizePublicSpaceNotificationsResult(result) {
    if (Array.isArray(result)) return result;

    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn("Public Space notification JSON parse failed:", error);
        return [];
      }
    }

    if (result && typeof result === "object") {
      if (Array.isArray(result.data)) return result.data;
      if (Array.isArray(result.notifications)) return result.notifications;
      if (Array.isArray(result.items)) return result.items;
      if (Array.isArray(result.payload)) return result.payload;
    }

    return [];
  }

  function isNotificationPanelVisible() {
    const panel = document.querySelector("[data-ps-notification-panel]");
    return Boolean(panel && !panel.hidden);
  }

  function isNotificationsHistoryVisible() {
    return Boolean(root.querySelector("[data-ps-notifications-history]"));
  }

  function markPublicSpaceUserActivity() {
    const now = Date.now();
    const wasIdle = now - lastPublicSpaceUserActivityAt > PUBLIC_SPACE_IDLE_WINDOW_MS;

    lastPublicSpaceUserActivityAt = now;

    if (wasIdle) {
      lastPublicSpacePresenceTouch = 0;
    }
  }

  function hasRecentPublicSpaceActivity() {
    return Date.now() - lastPublicSpaceUserActivityAt <= PUBLIC_SPACE_IDLE_WINDOW_MS;
  }

  function bindPublicSpaceActivityListeners() {
    if (publicSpaceActivityListenersReady || !document || !window) return;

    publicSpaceActivityListenersReady = true;

    ["pointerdown", "keydown", "input", "submit", "wheel", "touchstart"].forEach(eventName => {
      document.addEventListener(eventName, markPublicSpaceUserActivity, { passive: true, capture: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) markPublicSpaceUserActivity();
    });
  }

  async function touchPublicSpacePresence(options = {}) {
    if (!currentSession || !sessionToken()) return null;

    bindPublicSpaceActivityListeners();

    const now = Date.now();
    if (!options.force && !hasRecentPublicSpaceActivity()) {
      return currentUser;
    }

    if (!options.force && now - lastPublicSpacePresenceTouch < PUBLIC_SPACE_PRESENCE_TOUCH_MS) {
      return currentUser;
    }

    lastPublicSpacePresenceTouch = now;

    try {
      const result = await rpc("touch_public_space_presence", {
        input_session_token: sessionToken()
      });

      if (result && result.ok && result.user) {
        currentUser = result.user;
        currentSession.user = result.user;
        saveSession(currentSession);
      }

      return result;
    } catch (error) {
      if (!options.silent) throw error;
      console.warn("Public Space presence update failed:", error);
      return null;
    }
  }

  async function refreshPublicSpaceLiveData() {
    if (!currentSession || !sessionToken() || publicSpaceLiveRefreshInFlight) return [];

    publicSpaceLiveRefreshInFlight = true;

    try {
      await touchPublicSpacePresence({ silent: true });
      const result = await rpc("list_public_space_posts", {
        input_session_token: sessionToken()
      });
      const posts = Array.isArray(result) ? result : [];
      const nextSnapshot = getPublicSpaceLivePostsSnapshot(posts);

      latestPublicSpacePosts = posts;

      if (nextSnapshot !== publicSpaceLivePostsSnapshot) {
        publicSpaceLivePostsSnapshot = nextSnapshot;
        renderPosts(posts);
      }

      await loadPublicSpaceNotifications({ silent: true, background: true });

      if (activeCommentsPostId) {
        try {
          await refreshCommentsForPost(activeCommentsPostId);
        } catch (error) {
          console.warn("Live comments refresh failed:", error);
        }
      }

      const ownProfileList = root.querySelector("[data-ps-profile-post-list]");
      if (ownProfileList && typeof renderProfileOwnPosts === "function") {
        renderProfileOwnPosts(posts);
      }

      return posts;
    } finally {
      publicSpaceLiveRefreshInFlight = false;
    }
  }


  // Q65N live comments refresh
  function isCommentsModalVisible() {
    const modal = document.querySelector("[data-ps-comments-modal]");
    return Boolean(modal && !modal.hidden);
  }

  function isLocalCommentComposerActive() {
    // Q65O: allow passive live refresh when the desktop comment box is merely focused but empty.
    const active = document.activeElement;
    if (!active || !active.closest) return false;

    const form = active.closest("[data-ps-comments-form]");
    if (!form) return false;

    const textarea = form.querySelector("textarea[name='comment']");
    if (!textarea) return false;

    if (active === textarea) {
      return textarea.value.trim().length > 0;
    }

    return false;
  }


  // Q66B live refresh transient UI guard
  function isCommentTransientUiOpen() {
    const modal = document.querySelector("[data-ps-comments-modal]");
    if (!modal || modal.hidden) return false;

    return Boolean(
      modal.querySelector("[data-ps-comment-menu][data-open='true']") ||
      modal.querySelector("[data-ps-comment-emoji-panel]:not([hidden])")
    );
  }

  function normalizeLiveCommentsResult(value) {
    if (Array.isArray(value)) return value;

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return normalizeLiveCommentsResult(parsed);
      } catch (error) {
        return [];
      }
    }

    if (value && Array.isArray(value.comments)) return value.comments;
    if (value && Array.isArray(value.data)) return value.data;
    return [];
  }

  function liveCommentsSignature(items) {
    return JSON.stringify((items || []).map(item => [
      item && item.id,
      item && item.body,
      item && item.is_hidden,
      item && item.is_deleted,
      item && item.updated_at,
      item && item.created_at,
      item && item.user_id,
      item && item.can_edit,
      item && item.can_manage,
      item && item.can_hide
    ]));
  }

  async function refreshActiveCommentsLive() {
    if (!currentSession || !sessionToken()) return;
    if (!activeCommentsPostId || commentsLoading) return;
    if (!isCommentsModalVisible()) return;
    if (activeEditingCommentId) return;
    if (isLocalCommentComposerActive()) return;
    if (isCommentTransientUiOpen()) return;

    const previousSignature = liveCommentsSignature(activeComments);
    const result = await rpc("list_public_space_comments", {
      input_session_token: sessionToken(),
      input_post_id: activeCommentsPostId
    });
    const nextComments = normalizeLiveCommentsResult(result);
    const nextSignature = liveCommentsSignature(nextComments);

    if (previousSignature === nextSignature) return;

    activeComments = nextComments;
    renderCommentsModal();
  }

  function startPublicSpaceLiveRefresh() {
    if (publicSpaceLiveRefreshTimer) return;

    publicSpaceLiveRefreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      if (!currentSession || !sessionToken()) return;

      refreshPublicSpaceLiveData();
      refreshActiveCommentsLive().catch(error => console.warn("Live comments refresh failed:", error));
    }, 1800);
  }

  function stopPublicSpaceLiveRefresh() {
    if (!publicSpaceLiveRefreshTimer) return;

    window.clearInterval(publicSpaceLiveRefreshTimer);
    publicSpaceLiveRefreshTimer = null;
    publicSpaceLiveRefreshInFlight = false;
  }

  async function loadPublicSpaceNotifications(options = {}) {
    if (!currentSession || !sessionToken()) {
      publicSpaceNotifications = [];
      updateNotificationBell();
      return [];
    }

    if (!options.silent) {
      notificationsLoading = true;
      renderNotificationPanel();
    }

    try {
      const result = await rpc("list_public_space_notifications", {
        input_session_token: sessionToken()
      });

      publicSpaceNotifications = normalizePublicSpaceNotificationsResult(result);
      publicSpaceNotificationsLoadedAt = Date.now();
      return publicSpaceNotifications;
    } catch (error) {
      if (!options.silent) {
        publicSpaceNotifications = [];
        console.warn("Public Space notifications failed:", error);
      }
      return [];
    } finally {
      notificationsLoading = false;
      updateNotificationBell();

      if (isNotificationPanelVisible()) {
        renderNotificationPanel();
      }

      // Do not auto-render the full Notifications screen from a data refresh.
      // Explicit actions such as Open Notifications / Refresh / Mark Read render it manually.
    }
  }

  function refreshNotificationsScreenAfterLoad() {
    if (!currentUser || notificationsLoading || publicSpaceNotificationsLoadedAt) return;

    window.setTimeout(async () => {
      await loadPublicSpaceNotifications({ silent: true, background: true });
    }, 0);
  }

  async function clearPublicSpaceNotifications() {
    if (!currentSession || !sessionToken()) return;

    await rpc("clear_public_space_notifications", {
      input_session_token: sessionToken()
    });

    publicSpaceNotifications = [];
    publicSpaceNotificationsLoadedAt = Date.now();
    updateNotificationBell();

    if (isNotificationPanelVisible()) {
      renderNotificationPanel();
    }

    if (isNotificationsHistoryVisible()) {
      renderNotificationsScreen();
    }
  }

  async function markAllPublicSpaceNotificationsRead() {
    if (!currentSession || !sessionToken()) return;

    await rpc("mark_public_space_notifications_read", {
      input_session_token: sessionToken()
    });

    publicSpaceNotifications = publicSpaceNotifications.map(item => ({ ...item, is_read: true }));
    updateNotificationBell();
    renderNotificationPanel();
  }

  async function markPublicSpaceNotificationRead(notificationId) {
    const cleanId = String(notificationId || "").trim();
    if (!cleanId || !currentSession || !sessionToken()) return;

    await rpc("mark_public_space_notification_read", {
      input_session_token: sessionToken(),
      input_notification_id: cleanId
    });

    publicSpaceNotifications = publicSpaceNotifications.map(item => (
      String(item.id || "") === cleanId ? { ...item, is_read: true } : item
    ));

    updateNotificationBell();
    renderNotificationPanel();
  }

  function publicSpaceNotificationLink(item) {
    const details = item && item.details ? item.details : {};

    if (details.url) return String(details.url);
    if (details.piece_slug) return `poem.html?slug=${encodeURIComponent(details.piece_slug)}`;
    return "";
  }

  function scrollToPublicSpacePost(postId) {
    const cleanId = String(postId || "").trim();
    if (!cleanId) return;

    window.setTimeout(() => {
      const card = root.querySelector(`[data-post-id="${CSS.escape(cleanId)}"]`);
      if (!card) return;

      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("is-highlighted");
      window.setTimeout(() => card.classList.remove("is-highlighted"), 2200);
    }, 250);
  }

  async function openPublicSpaceNotification(itemId) {
    const item = buildNotificationItems().find(entry => String(entry.id || "") === String(itemId || ""));

    if (!item || ["login", "loading", "empty"].includes(item.id)) return;

    try {
      await markPublicSpaceNotificationRead(item.id);
    } catch (error) {
      console.warn("Notification read update failed:", error);
    }

    const link = publicSpaceNotificationLink(item);

    if (link) {
      window.location.href = link;
      return;
    }

    if (item.post_id) {
      closeNotificationPanel();
      navigatePublicSpaceRoute("home");
      scrollToPublicSpacePost(item.post_id);
    }
  }

  function renderNotificationPanel() {
    const panel = ensureNotificationPanel();
    const listNode = panel.querySelector("[data-ps-notification-list]");
    const summaryNode = panel.querySelector("[data-ps-notification-summary]");
    const menuNode = panel.querySelector("[data-ps-notification-menu]");
    const moreButton = panel.querySelector("[data-ps-notification-more]");

    const allItems = buildNotificationItems();
    const items = allItems.filter(item => {
      if (notificationPanelFilter === "unread") return item.unread;
      return true;
    });

    panel.querySelectorAll("[data-ps-notification-filter]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.psNotificationFilter === notificationPanelFilter);
    });

    if (summaryNode) {
      const unreadCount = allItems.filter(item => item.unread).length;
      summaryNode.textContent = unreadCount ? `${unreadCount} unread` : "No unread notifications";
    }

    if (menuNode && moreButton) {
      menuNode.hidden = true;
      moreButton.setAttribute("aria-expanded", "false");
    }

    if (!listNode) return;

    if (!items.length) {
      listNode.innerHTML = `
        <article class="ps-notification-empty">
          <strong>No unread notifications.</strong>
          <span>Switch to All to view older notices.</span>
        </article>
      `;
      return;
    }

    listNode.innerHTML = items.map(item => `
      <article class="ps-notification-item ${item.unread ? "is-unread" : ""}" data-ps-notification-item="${escapeHtml(item.id)}">
        <span class="ps-notification-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
          ${item.time ? `<small>${escapeHtml(item.time)}</small>` : ""}
        </div>
        ${item.unread ? `<span class="ps-notification-dot" aria-hidden="true"></span>` : ""}
      </article>
    `).join("");
  }

  async function openNotificationPanel() {
    const panel = ensureNotificationPanel();
    panel.hidden = false;
    panel.classList.add("is-open");
    if (bellButton) bellButton.classList.add("is-active");

    renderNotificationPanel();
    await loadPublicSpaceNotifications({ silent: false });
  }

  function closeNotificationPanel() {
    const panel = document.querySelector("[data-ps-notification-panel]");
    if (!panel) return;

    panel.hidden = true;
    panel.classList.remove("is-open");
    const menuNode = panel.querySelector("[data-ps-notification-menu]");
    const moreButton = panel.querySelector("[data-ps-notification-more]");
    if (menuNode) menuNode.hidden = true;
    if (moreButton) moreButton.setAttribute("aria-expanded", "false");
    if (bellButton) bellButton.classList.remove("is-active");
  }

  function toggleNotificationPanel() {
    const panel = ensureNotificationPanel();
    if (panel.hidden) openNotificationPanel();
    else closeNotificationPanel();
  }

  function handleBellNotificationClick(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleNotificationPanel();
  }

  async function handleNotificationPanelClick(event) {
    const routeBackButton = event.target.closest("[data-ps-route-back]");
    if (routeBackButton) return;

    const panel = event.target.closest("[data-ps-notification-panel], [data-ps-notifications-history], [data-ps-control-top-actions]");
    const moreButton = event.target.closest("[data-ps-notification-more]");
    const filterButton = event.target.closest("[data-ps-notification-filter]");
    const actionButton = event.target.closest("[data-ps-notification-action]");
    const refreshButton = event.target.closest("[data-ps-notification-refresh]");
    const itemButton = event.target.closest("[data-ps-notification-item]");
    const bellClick = event.target.closest("[data-ps-bell]");

    if (bellClick) return;

    if (!panel) {
      closeNotificationPanel();
      return;
    }

    if (moreButton) {
      event.preventDefault();
      const menuNode = panel.querySelector("[data-ps-notification-menu]");
      const willOpen = menuNode ? menuNode.hidden : false;
      if (menuNode) menuNode.hidden = !willOpen;
      moreButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
      return;
    }

    if (filterButton) {
      event.preventDefault();
      notificationPanelFilter = filterButton.dataset.psNotificationFilter || "all";
      renderNotificationPanel();
      return;
    }

    if (actionButton) {
      event.preventDefault();
      const action = actionButton.dataset.psNotificationAction;

      if (action === "mark-read") {
        const isHistoryScreen = Boolean(actionButton.closest("[data-ps-notifications-history], [data-ps-control-top-actions]"));

        await markAllPublicSpaceNotificationsRead();
        notificationPanelFilter = "all";

        if (isHistoryScreen) {
          renderNotificationsScreen();
        } else {
          renderNotificationPanel();
        }

        return;
      }

      if (action === "clear") {
        const isHistoryScreen = Boolean(actionButton.closest("[data-ps-notifications-history], [data-ps-control-top-actions]"));

        await clearPublicSpaceNotifications();
        notificationPanelFilter = "all";

        if (isHistoryScreen) {
          renderNotificationsScreen();
        } else {
          renderNotificationPanel();
        }

        return;
      }

      if (action === "settings") {
        closeNotificationPanel();
        navigatePublicSpaceRoute("settings");
        return;
      }

      if (action === "open") {
        closeNotificationPanel();
        await loadPublicSpaceNotifications({ silent: true });
        navigatePublicSpaceRoute("notifications");
        return;
      }
    }

    if (refreshButton) {
      event.preventDefault();
      await loadPublicSpaceNotifications({ silent: false });
      renderNotificationsScreen();
      return;
    }

    if (itemButton) {
      event.preventDefault();
      await openPublicSpaceNotification(itemButton.dataset.psNotificationItem);
    }
  }

  function handleNotificationPanelKeydown(event) {
    if (event.key === "Escape") closeNotificationPanel();
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

    publicSpaceNotifications = [];
    publicSpaceNotificationsLoadedAt = 0;
    updateNotificationBell();
    stopPublicSpaceLiveRefresh();
  }

  async function showMainSpace(message) {
    if (authScreen) authScreen.hidden = true;
    if (mainSpace) mainSpace.hidden = false;
    setMessage(authMessage, "", "info");

    setAdminMode(Boolean(currentUser && currentUser.is_admin));

    if (message) setFeedStatus(message);

    await Promise.all([
      loadPosts(message ? 250 : 0),
      loadPublicSpaceNotifications({ silent: true })
    ]);

    startPublicSpaceLiveRefresh();
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

      await touchPublicSpacePresence({ force: true, silent: true });

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

  function postDeleteConfirmText(postId) {
    const post = postById(postId) || {};
    const author = post.author || {};
    const username = author.username || post.username || "this user";
    const preview = adminModerationPostPreview(post.body || "");
    const previewLine = preview ? `\n\nPreview: ${preview}` : "";

    return `Delete this post by @${username}? This action cannot be undone.${previewLine}`;
  }

  function setPostActionLoading(button, label) {
    if (!button) return "";
    const previous = button.textContent || "";
    button.disabled = true;
    button.classList.add("is-processing");
    button.setAttribute("aria-busy", "true");
    if (label) button.textContent = label;
    return previous;
  }

  function restorePostActionButton(button, previousLabel) {
    if (!button) return;
    button.disabled = false;
    button.classList.remove("is-processing");
    button.removeAttribute("aria-busy");
    if (previousLabel) button.textContent = previousLabel;
  }

  async function handleFeedClick(event) {
    const heartButton = event.target.closest("[data-ps-heart-post]");
    const deleteButton = event.target.closest("[data-ps-delete-post]");
    const hideButton = event.target.closest("[data-ps-toggle-hidden]");
    const commentButton = event.target.closest("[data-ps-comments-post]");

    if (commentButton) {
      event.preventDefault();
      event.stopPropagation();
      await openCommentsPanel(commentButton.dataset.psCommentsPost);
      return;
    }
    if (!heartButton && !deleteButton && !hideButton) return;

    event.preventDefault();

    if (!currentSession || !currentSession.session_token) {
      showAuth("login");
      return;
    }

    if (deleteButton) {
      const postId = deleteButton.dataset.psDeletePost || "";
      if (!window.confirm(postDeleteConfirmText(postId))) {
        setFeedStatus("Post delete cancelled.");
        return;
      }
    }

    let activeButton = heartButton || deleteButton || hideButton;
    let previousLabel = "";

    try {
      if (heartButton) {
        previousLabel = setPostActionLoading(heartButton, "Saving...");
        await rpc("toggle_public_space_heart", {
          input_session_token: sessionToken(),
          input_post_id: heartButton.dataset.psHeartPost
        });
      }

      if (deleteButton) {
        previousLabel = setPostActionLoading(deleteButton, "Deleting...");
        setFeedStatus("Deleting post...");
        await rpc("delete_public_space_post", {
          input_session_token: sessionToken(),
          input_post_id: deleteButton.dataset.psDeletePost
        });
      }

      if (hideButton) {
        const isHidden = hideButton.dataset.hidden === "true";
        previousLabel = setPostActionLoading(hideButton, isHidden ? "Unhiding..." : "Hiding...");
        setFeedStatus(isHidden ? "Unhiding post..." : "Hiding post...");
        await rpc("admin_set_public_space_post_hidden", {
          input_session_token: sessionToken(),
          input_post_id: hideButton.dataset.psToggleHidden,
          input_is_hidden: !isHidden
        });
      }

      await refreshPublicSpaceLiveData();

      if (deleteButton) setFeedStatus("Post deleted.");
      if (hideButton) setFeedStatus(hideButton.dataset.hidden === "true" ? "Post unhidden." : "Post hidden.");
    } catch (error) {
      restorePostActionButton(activeButton, previousLabel);
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
        ${safeCards.map(card => {
          const action = String(card.action || "").trim();
          const actionLabel = card.actionLabel || "Open";

          return `
            <article class="ps-admin-info-card ${action ? "has-action" : ""}">
              <strong>${escapeHtml(card.title || "Admin tool")}</strong>
              <span>${escapeHtml(card.body || "")}</span>
              ${action ? `<button type="button" class="ps-admin-info-action" data-ps-admin-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;

    setMessage(messageNode, status || "Admin controls ready.", "info");
  }

  async function renderAdminOverview() {
    const messageNode = root.querySelector("[data-ps-admin-message]");

    renderAdminInfoCards("Loading admin overview stats...", [
      {
        title: "Loading overview",
        body: "Please wait while Public Space stats are loaded."
      }
    ]);

    try {
      const users = await rpc("list_public_space_users", {
        input_session_token: sessionToken()
      });

      const list = Array.isArray(users) ? users : [];
      const stats = list.reduce((total, user) => {
        const disabled = Boolean(user && user.is_disabled);
        const admin = Boolean(user && user.is_admin);
        const badges = splitBadgeLabels((user && user.badge_label) || "");
        const premium = Boolean(user && user.is_premium) || badges.some(label => normalizeBadgeValue(label) === "premium");
        const active = !disabled && isPublicSpaceUserActive(user);

        total.users += 1;
        if (active) total.active += 1;
        if (!disabled && !active) total.idle += 1;
        if (admin) total.admins += 1;
        if (premium) total.premium += 1;
        if (disabled) total.disabled += 1;

        return total;
      }, {
        users: 0,
        active: 0,
        idle: 0,
        admins: 0,
        premium: 0,
        disabled: 0
      });

      const accountLabel = stats.users === 1 ? "registered account" : "registered accounts";
      const activeLabel = stats.active === 1 ? "user active now" : "users active now";
      const idleLabel = stats.idle === 1 ? "enabled user idle" : "enabled users idle";
      const adminLabel = stats.admins === 1 ? "admin account" : "admin accounts";
      const premiumLabel = stats.premium === 1 ? "premium account" : "premium accounts";
      const disabledLabel = stats.disabled === 1 ? "disabled account" : "disabled accounts";

      renderAdminInfoCards("Admin overview stats ready.", [
        { title: "Total users", body: String(stats.users) + " " + accountLabel },
        { title: "Active now", body: String(stats.active) + " " + activeLabel },
        { title: "Idle", body: String(stats.idle) + " " + idleLabel },
        { title: "Admins", body: String(stats.admins) + " " + adminLabel },
        { title: "Premium", body: String(stats.premium) + " " + premiumLabel },
        { title: "Disabled", body: String(stats.disabled) + " " + disabledLabel },
        {
          title: "Manage users",
          body: "Search, filter, assign badges, toggle premium/access, or reset passwords and PIN/key codes.",
          action: "users",
          actionLabel: "Open users"
        },
        {
          title: "Moderate posts",
          body: "Reload the feed and use admin-only hide/delete controls on public posts.",
          action: "posts",
          actionLabel: "Open moderation"
        },
        {
          title: "Reports",
          body: "Review the reserved report queue area and planned moderation workflow.",
          action: "reports",
          actionLabel: "Open reports"
        },
        {
          title: "Space settings",
          body: "Review locked posting rules, account controls, security notes, and upcoming upgrades.",
          action: "settings",
          actionLabel: "Open settings"
        }
      ]);
    } catch (error) {
      renderAdminInfoCards("Admin overview failed to load.", [
        {
          title: "Stats unavailable",
          body: "Open Registered users to manage accounts directly, then try Admin overview again.",
          action: "users",
          actionLabel: "Open users"
        }
      ]);
      setMessage(messageNode, getErrorMessage(error), "error");
    }
  }

  function adminModerationPostPreview(body) {
    const normalized = String(body || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "(empty post)";
    return normalized.length > 190 ? normalized.slice(0, 187) + "..." : normalized;
  }

  function adminModerationPostStatusPills(post) {
    const hidden = Boolean(post && post.is_hidden);
    const deleted = Boolean(post && post.is_deleted);
    const canManage = Boolean(post && post.can_manage) || isAdminMode;
    const parts = [];

    parts.push({ key: hidden ? "hidden" : "visible", label: hidden ? "Hidden" : "Visible", className: hidden ? "is-danger" : "is-ok" });
    if (deleted) parts.push({ key: "deleted", label: "Deleted", className: "is-danger" });
    if (canManage) parts.push({ key: "manageable", label: "Manageable", className: "" });

    return parts.map(part => `<span class="ps-status-pill ${part.className || ""}" data-ps-admin-pill="${escapeHtml(part.key)}">${escapeHtml(part.label)}</span>`).join("");
  }

  function adminModerationPostActions(post) {
    if (!post || !post.id || post.is_deleted) return "";

    const postId = escapeHtml(post.id);
    const isHidden = Boolean(post.is_hidden);
    const hideLabel = isHidden ? "Unhide" : "Hide";

    const hideButton = '<button type="button" data-ps-post-menu-action="hide" data-ps-toggle-hidden="' + postId + '" data-hidden="' + (isHidden ? 'true' : 'false') + '">' + hideLabel + '</button>';
    const deleteButton = '<button type="button" data-ps-post-menu-action="delete" data-ps-delete-post="' + postId + '">Delete</button>';

    return hideButton + deleteButton;
  }

  function adminPostFilterStatusOptionsHtml() {
    const options = [
      ["all", "All posts"],
      ["visible", "Visible"],
      ["hidden", "Hidden"],
      ["deleted", "Deleted"]
    ];

    return options.map(([value, label]) => {
      const selected = adminPostFilterState.status === value ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function adminModerationPostSearchText(post, username) {
    const source = post || {};
    const author = source.author || {};
    return [
      username || "",
      author.username || "",
      source.username || "",
      source.body || "",
      source.is_hidden ? "hidden" : "visible",
      source.is_deleted ? "deleted" : "",
      source.created_at || "",
      source.updated_at || ""
    ].join(" ").toLowerCase();
  }

  function adminModerationPostMatchesStatus(card, status) {
    if (!card || !status || status === "all") return true;
    if (status === "visible") return card.dataset.psAdminPostHidden !== "true" && card.dataset.psAdminPostDeleted !== "true";
    if (status === "hidden") return card.dataset.psAdminPostHidden === "true";
    if (status === "deleted") return card.dataset.psAdminPostDeleted === "true";
    return true;
  }

  function applyAdminPostFilters() {
    const results = adminResultsNode();
    if (!results) return;

    const cards = Array.from(results.querySelectorAll("[data-ps-admin-post-card]"));
    const count = results.querySelector("[data-ps-admin-post-count]");
    const empty = results.querySelector("[data-ps-admin-post-filter-empty]");
    const query = String(adminPostFilterState.query || "").trim().toLowerCase();
    const status = String(adminPostFilterState.status || "all");
    let visible = 0;

    cards.forEach(card => {
      const searchText = String(card.dataset.psAdminPostSearch || "").toLowerCase();
      const matchesQuery = !query || searchText.includes(query);
      const matchesStatus = adminModerationPostMatchesStatus(card, status);
      const shouldShow = matchesQuery && matchesStatus;

      card.hidden = !shouldShow;
      card.classList.toggle("is-filtered-out", !shouldShow);

      if (shouldShow) visible += 1;
    });

    if (count) {
      count.textContent = cards.length === visible ? `${cards.length} total` : `${visible} of ${cards.length} shown`;
    }

    if (empty) {
      empty.hidden = visible > 0 || cards.length === 0;
    }
  }

  function bindAdminPostFilters() {
    const filter = root.querySelector("[data-ps-admin-post-filter]");
    if (!filter) return;

    const searchInput = filter.querySelector("[data-ps-admin-post-search]");
    const statusSelect = filter.querySelector("[data-ps-admin-post-status]");
    const resetButton = filter.querySelector("[data-ps-admin-post-filter-reset]");

    if (searchInput) {
      searchInput.value = adminPostFilterState.query || "";
      searchInput.addEventListener("input", () => {
        adminPostFilterState.query = searchInput.value || "";
        applyAdminPostFilters();
      });
    }

    if (statusSelect) {
      statusSelect.value = adminPostFilterState.status || "all";
      statusSelect.addEventListener("change", () => {
        adminPostFilterState.status = statusSelect.value || "all";
        applyAdminPostFilters();
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        adminPostFilterState = { query: "", status: "all" };
        if (searchInput) searchInput.value = "";
        if (statusSelect) statusSelect.value = "all";
        applyAdminPostFilters();
      });
    }
  }

  function renderPostModerationAdmin() {
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const results = adminResultsNode();
    const sourcePosts = Array.isArray(latestPublicSpacePosts) ? latestPublicSpacePosts : [];
    const list = sourcePosts.filter(post => post && post.id);

    if (!results) return;

    if (!list.length) {
      renderAdminInfoCards("Post moderation ready.", [
        {
          title: "No posts found",
          body: "There are no public posts to moderate yet."
        },
        {
          title: "Moderation actions",
          body: "Once posts exist, admins can hide, unhide, or delete them here using existing post moderation RPCs."
        }
      ]);
      return;
    }

    const hiddenCount = list.filter(post => post && post.is_hidden).length;
    const deletedCount = list.filter(post => post && post.is_deleted).length;
    const visibleCount = list.length - hiddenCount - deletedCount;

    results.innerHTML = `
      <div class="ps-admin-results-head ps-admin-post-head">
        <strong>Post moderation</strong>
        <span data-ps-admin-post-count>${list.length} total</span>
      </div>
      <div class="ps-admin-post-summary">
        <article>
          <strong>${list.length}</strong>
          <span>Total posts</span>
        </article>
        <article>
          <strong>${visibleCount}</strong>
          <span>Visible</span>
        </article>
        <article>
          <strong>${hiddenCount}</strong>
          <span>Hidden</span>
        </article>
        <article>
          <strong>${deletedCount}</strong>
          <span>Deleted</span>
        </article>
      </div>
      <div class="ps-admin-post-filter" data-ps-admin-post-filter>
        <label>
          <span>Search posts</span>
          <input type="search" value="${escapeHtml(adminPostFilterState.query || "")}" placeholder="Author or post text..." autocomplete="off" data-ps-admin-post-search />
        </label>
        <label>
          <span>Filter status</span>
          <select data-ps-admin-post-status>
            ${adminPostFilterStatusOptionsHtml()}
          </select>
        </label>
        <button type="button" data-ps-admin-post-filter-reset>Reset</button>
      </div>
      <div class="ps-admin-post-list" data-ps-admin-post-list>
        ${list.map(post => {
          const author = post.author || {};
          const username = author.username || post.username || "unknown";
          const postId = escapeHtml(post.id);
          const created = post.created_at ? formatDate(post.created_at) : "Unknown date";
          const updated = post.updated_at && post.updated_at !== post.created_at ? ` · updated ${formatDate(post.updated_at)}` : "";
          const hiddenClass = post.is_hidden ? " is-hidden-by-admin" : "";
          const deletedClass = post.is_deleted ? " is-deleted" : "";
          const searchText = adminModerationPostSearchText(post, username);

          return `
            <article class="ps-admin-post-card${hiddenClass}${deletedClass}" data-ps-admin-post-card data-post-id="${postId}" data-ps-admin-post-hidden="${post.is_hidden ? "true" : "false"}" data-ps-admin-post-deleted="${post.is_deleted ? "true" : "false"}" data-ps-admin-post-search="${escapeHtml(searchText)}">
              <div class="ps-admin-post-top">
                <div>
                  <strong>@${escapeHtml(username)}</strong>
                  <span>${escapeHtml(created + updated)}</span>
                </div>
                <div class="ps-admin-post-pills">
                  ${adminModerationPostStatusPills(post)}
                </div>
              </div>
              <p>${escapeHtml(adminModerationPostPreview(post.body))}</p>
              <div class="ps-admin-post-foot">
                <span>${Number(post.heart_count || 0)} hearts · ${Number(post.comment_count || 0)} comments</span>
                <div class="ps-admin-post-actions">
                  ${adminModerationPostActions(post)}
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <article class="ps-admin-empty ps-admin-post-filter-empty" data-ps-admin-post-filter-empty hidden>
        <strong>No posts match this filter.</strong>
        <span>Try a different author, post text, or status.</span>
      </article>
    `;

    bindAdminPostFilters();
    applyAdminPostFilters();
    setMessage(messageNode, `Post moderation: ${list.length} loaded`, "success");
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

  function adminUserPillsHtml(options) {
    const settings = options || {};
    const badges = splitBadgeLabels(settings.badgeLabel || "");
    const isAdmin = Boolean(settings.isAdmin);
    const isDisabled = Boolean(settings.isDisabled);
    const isPremium = Boolean(settings.isPremium) || badges.some(label => normalizeBadgeValue(label) === "premium");
    const visibleBadgePills = badges.filter(label => normalizeBadgeValue(label) !== "premium");

    return [
      isAdmin ? '<span class="ps-status-pill" data-ps-admin-pill="admin">Admin</span>' : "",
      isPremium ? '<span class="ps-status-pill" data-ps-admin-pill="premium">Premium access</span>' : "",
      isDisabled ? '<span class="ps-status-pill is-danger" data-ps-admin-pill="disabled">Disabled</span>' : '<span class="ps-status-pill is-ok" data-ps-admin-pill="active">Active</span>',
      ...visibleBadgePills.map(label => `<span class="ps-status-pill" data-ps-admin-pill="badge">${escapeHtml(label)}</span>`)
    ].join("");
  }

  function syncAdminUserCardBadgePreview(card, badgeValue) {
    if (!card) return;

    const pills = card.querySelector("[data-ps-admin-user-pills]");
    if (!pills) return;

    const badges = splitBadgeLabels(badgeValue || "");
    const hasPremiumBadge = badges.some(label => normalizeBadgeValue(label) === "premium");

    card.dataset.psAdminBadgePreview = badges.join(", ");
    card.dataset.psAdminIsPremium = hasPremiumBadge ? "true" : "false";
    pills.innerHTML = adminUserPillsHtml({
      isAdmin: card.dataset.psAdminIsAdmin === "true",
      isDisabled: card.dataset.psAdminIsDisabled === "true",
      isPremium: hasPremiumBadge,
      badgeLabel: badges.join(", ")
    });
  }

  function adminUserFilterStatusOptionsHtml() {
    const options = [
      ["all", "All users"],
      ["online", "Active now"],
      ["idle", "Idle / last seen"],
      ["admin", "Admins"],
      ["premium", "Premium"],
      ["disabled", "Disabled"],
      ["enabled", "Enabled"]
    ];

    return options.map(([value, label]) => {
      const selected = adminUserFilterState.status === value ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function adminUserFilterText(user, badgeLabel, isAdmin, isDisabled, isPremium) {
    const source = user || {};
    const labels = [
      source.username || "",
      badgeLabel || "",
      isAdmin ? "admin" : "",
      isPremium ? "premium" : "",
      isDisabled ? "disabled" : "enabled active",
      isPublicSpaceUserActive(source) ? "online active now" : "idle last seen offline",
      ...splitBadgeLabels(badgeLabel || "")
    ];

    return labels.join(" ").toLowerCase();
  }

  function adminUserMatchesStatus(card, status) {
    if (!card || !status || status === "all") return true;

    if (status === "online") return card.dataset.psAdminFilterActive === "true";
    if (status === "idle") return card.dataset.psAdminFilterActive !== "true" && card.dataset.psAdminIsDisabled !== "true";
    if (status === "admin") return card.dataset.psAdminIsAdmin === "true";
    if (status === "premium") return card.dataset.psAdminIsPremium === "true";
    if (status === "disabled") return card.dataset.psAdminIsDisabled === "true";
    if (status === "enabled") return card.dataset.psAdminIsDisabled !== "true";

    return true;
  }

  function applyAdminUserFilters() {
    const results = adminResultsNode();
    if (!results) return;

    const cards = Array.from(results.querySelectorAll("[data-ps-admin-user-card]"));
    const count = results.querySelector("[data-ps-admin-users-count]");
    const empty = results.querySelector("[data-ps-admin-user-filter-empty]");
    const query = String(adminUserFilterState.query || "").trim().toLowerCase();
    const status = String(adminUserFilterState.status || "all");
    let visible = 0;

    cards.forEach(card => {
      const searchText = String(card.dataset.psAdminSearch || "").toLowerCase();
      const matchesQuery = !query || searchText.includes(query);
      const matchesStatus = adminUserMatchesStatus(card, status);
      const shouldShow = matchesQuery && matchesStatus;

      card.hidden = !shouldShow;
      card.classList.toggle("is-filtered-out", !shouldShow);

      if (shouldShow) visible += 1;
    });

    if (count) {
      count.textContent = cards.length === visible ? `${cards.length} total` : `${visible} of ${cards.length} shown`;
    }

    if (empty) {
      empty.hidden = visible > 0 || cards.length === 0;
    }
  }

  function bindAdminUserFilters() {
    const filter = root.querySelector("[data-ps-admin-user-filter]");
    if (!filter) return;

    const searchInput = filter.querySelector("[data-ps-admin-user-search]");
    const statusSelect = filter.querySelector("[data-ps-admin-user-status]");
    const resetButton = filter.querySelector("[data-ps-admin-user-filter-reset]");

    if (searchInput) {
      searchInput.value = adminUserFilterState.query || "";
      searchInput.addEventListener("input", () => {
        adminUserFilterState.query = searchInput.value || "";
        applyAdminUserFilters();
      });
    }

    if (statusSelect) {
      statusSelect.value = adminUserFilterState.status || "all";
      statusSelect.addEventListener("change", () => {
        adminUserFilterState.status = statusSelect.value || "all";
        applyAdminUserFilters();
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        adminUserFilterState = { query: "", status: "all" };
        if (searchInput) searchInput.value = "";
        if (statusSelect) statusSelect.value = "all";
        applyAdminUserFilters();
      });
    }
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
        <span data-ps-admin-users-count>${list.length} total</span>
      </div>
      <div class="ps-admin-user-filter" data-ps-admin-user-filter>
        <label>
          <span>Search users</span>
          <input type="search" value="${escapeHtml(adminUserFilterState.query || "")}" placeholder="Username, badge, admin..." autocomplete="off" data-ps-admin-user-search />
        </label>
        <label>
          <span>Filter status</span>
          <select data-ps-admin-user-status>
            ${adminUserFilterStatusOptionsHtml()}
          </select>
        </label>
        <button type="button" data-ps-admin-user-filter-reset>Reset</button>
      </div>
      <div class="ps-admin-user-list">
        ${list.map(user => {
          const isDisabled = Boolean(user.is_disabled);
          const isAdmin = Boolean(user.is_admin);
          const badge = user.badge_label || "";
          const userBadges = splitBadgeLabels(badge);
          const isPremium = Boolean(user.is_premium) || userBadges.some(label => normalizeBadgeValue(label) === "premium");
          const visibleBadgePills = userBadges.filter(label => normalizeBadgeValue(label) !== "premium");

          return `
            <article class="ps-admin-user-card ${isDisabled ? "is-disabled" : ""}" data-ps-admin-user-card data-user-id="${escapeHtml(user.id)}" data-ps-admin-is-admin="${isAdmin ? "true" : "false"}" data-ps-admin-is-disabled="${isDisabled ? "true" : "false"}" data-ps-admin-is-premium="${isPremium ? "true" : "false"}" data-ps-admin-filter-active="${isPublicSpaceUserActive(user) ? "true" : "false"}" data-ps-admin-search="${escapeHtml(adminUserFilterText(user, badge, isAdmin, isDisabled, isPremium))}">
              <div class="ps-admin-user-main">
                <div>
                  ${renderPublicSpaceUsernameStrong(user, user.username || "user")}
                  <span>${isPublicSpaceUserActive(user) ? "Active now" : "Last seen " + escapeHtml(formatDate(user.last_seen_at) || "not yet")}</span>
                  <span>Joined ${escapeHtml(formatDate(user.created_at) || "recently")}</span>
                </div>
                <div class="ps-admin-user-pills" data-ps-admin-user-pills>
                  ${adminUserPillsHtml({ isAdmin, isDisabled, isPremium, badgeLabel: badge })}
                </div>
              </div>

              <div class="ps-admin-user-controls">
                <div class="ps-admin-inline-form ps-admin-badge-form">
                  <label>
                    <span>Badge presets</span>
                    <input type="hidden" value="${escapeHtml(badge)}" data-ps-user-badge data-ps-badge-input />
                  </label>
                  <button type="button" data-ps-user-action="badge" data-user-id="${escapeHtml(user.id)}">Save badges</button>
                </div>

                <div class="ps-admin-reset-actions" aria-label="Account controls">
                  <button type="button" data-ps-user-action="password" data-user-id="${escapeHtml(user.id)}">Reset password</button>
                  <button type="button" data-ps-user-action="disable" data-user-id="${escapeHtml(user.id)}" data-next-disabled="${isDisabled ? "false" : "true"}">
                    ${isDisabled ? "Enable account" : "Disable account"}
                  </button>
                  <button type="button" data-ps-user-action="pin" data-user-id="${escapeHtml(user.id)}">Reset PIN/key</button>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <article class="ps-admin-empty ps-admin-user-filter-empty" data-ps-admin-user-filter-empty hidden>
        <strong>No users match this filter.</strong>
        <span>Try a different username, badge, or status.</span>
      </article>
    `;

    enforceNumericPinFields();
    enhanceAdminBadgeSelectors();
    bindAdminUserFilters();
    applyAdminUserFilters();
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

  function closeAdminUserResetModal(modal) {
    const target = modal || root.querySelector("[data-ps-user-reset-modal]");
    if (target) target.remove();
  }

  function openAdminUserResetModal(button, action) {
    const card = button.closest("[data-ps-admin-user-card]");
    if (!card) return;

    closeAdminUserResetModal();

    const isPin = action === "pin";
    const userLabel = card.querySelector(".ps-admin-user-main strong")?.textContent || "this user";
    const modal = document.createElement("div");

    modal.className = "ps-admin-reset-modal";
    modal.setAttribute("data-ps-user-reset-modal", "");
    modal.dataset.resetAction = action;
    modal.innerHTML = `
      <div class="ps-admin-reset-dialog" role="dialog" aria-modal="true" aria-label="${isPin ? "Reset PIN/key" : "Reset password"}">
        <div class="ps-admin-reset-head">
          <span>${isPin ? "Security PIN/key" : "Account password"}</span>
          <strong>${isPin ? "Reset PIN/key" : "Reset password"}</strong>
          <p>Enter the new ${isPin ? "4-digit PIN/key" : "6 to 8 character password"} for ${escapeHtml(userLabel)}.</p>
        </div>
        <label class="ps-admin-reset-field">
          <span>${isPin ? "New PIN/key" : "New password"}</span>
          <input type="text" class="${isPin ? "ps-admin-pin-segmented" : "ps-admin-reset-text"}" maxlength="${isPin ? LIMITS.pinLength : LIMITS.passwordMax}" ${isPin ? "inputmode=\"numeric\" pattern=\"[0-9]*\" data-ps-pin-only" : ""} data-ps-user-reset-value autocomplete="off" placeholder="${isPin ? "0000" : "6 to 8 chars"}" />
        </label>
        <p class="ps-admin-reset-message" data-ps-reset-message></p>
        <div class="ps-admin-reset-buttons">
          <button type="button" data-ps-user-reset-cancel>Cancel</button>
          <button type="button" data-ps-user-reset-confirm>Confirm reset</button>
        </div>
      </div>
    `;

    card.appendChild(modal);
    if (isPin) enforceNumericPinFields();

    const input = modal.querySelector("[data-ps-user-reset-value]");
    if (input) window.setTimeout(() => input.focus(), 0);
  }

  async function handleAdminUserResetConfirm(button) {
    const modal = button.closest("[data-ps-user-reset-modal]");
    const card = modal ? modal.closest("[data-ps-admin-user-card]") : null;
    const userId = card ? card.dataset.userId : "";
    const action = modal ? modal.dataset.resetAction : "";
    const input = modal ? modal.querySelector("[data-ps-user-reset-value]") : null;
    const modalMessage = modal ? modal.querySelector("[data-ps-reset-message]") : null;
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const value = input ? input.value.trim() : "";
    const isPin = action === "pin";
    const error = isPin ? validatePin(value) : validatePassword(value);

    if (!userId || (action !== "password" && action !== "pin")) return;

    if (error) {
      setMessage(modalMessage, error, "error");
      return;
    }

    const params = {
      input_session_token: sessionToken(),
      input_user_id: userId,
      input_is_premium: null,
      input_badge_label: null,
      input_is_disabled: null,
      input_new_password: isPin ? null : value,
      input_new_pin: isPin ? value : null
    };

    try {
      button.disabled = true;
      setMessage(modalMessage, isPin ? "Resetting PIN/key..." : "Resetting password...", "info");
      await rpc("admin_update_public_space_user", params);
      closeAdminUserResetModal(modal);
      await refreshAdminUsers("User updated.");
    } catch (error) {
      setMessage(modalMessage, getErrorMessage(error), "error");
      setMessage(messageNode, getErrorMessage(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  function handleAdminUserResetClick(event) {
    const modalBackdrop = event.target.matches && event.target.matches("[data-ps-user-reset-modal]") ? event.target : null;
    const cancelButton = event.target.closest("[data-ps-user-reset-cancel]");
    const confirmButton = event.target.closest("[data-ps-user-reset-confirm]");

    if (modalBackdrop) {
      closeAdminUserResetModal(modalBackdrop);
      return;
    }

    if (cancelButton) {
      event.preventDefault();
      closeAdminUserResetModal(cancelButton.closest("[data-ps-user-reset-modal]"));
      return;
    }

    if (confirmButton) {
      event.preventDefault();
      handleAdminUserResetConfirm(confirmButton);
    }
  }

  async function handleAdminUserAction(button) {
    const messageNode = root.querySelector("[data-ps-admin-message]");
    const card = button.closest("[data-ps-admin-user-card]");
    const userId = button.dataset.userId;
    const action = button.dataset.psUserAction;
    const userLabel = card ? (card.querySelector(".ps-admin-user-main strong")?.textContent || "this user") : "this user";

    if (!userId || !action) return;

    if (action === "password" || action === "pin") {
      openAdminUserResetModal(button, action);
      return;
    }

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
      const nextPremium = button.dataset.nextPremium === "true";
      params.input_is_premium = nextPremium;

      const badgeInput = card ? card.querySelector("[data-ps-user-badge]") : null;
      if (badgeInput) {
        const currentBadges = splitBadgeLabels(badgeInput.value);
        const withoutPremium = currentBadges.filter(value => normalizeBadgeValue(value) !== "premium");
        const nextBadges = nextPremium
          ? ["Premium", ...withoutPremium].slice(0, PUBLIC_SPACE_BADGE_LIMIT)
          : withoutPremium;

        params.input_badge_label = nextBadges.join(", ");
        badgeInput.value = params.input_badge_label;
      }
    }

    if (action === "disable") {
      const nextDisabled = button.dataset.nextDisabled === "true";
      const confirmText = nextDisabled
        ? `Disable ${userLabel}? This will block login until the account is enabled again.`
        : `Enable ${userLabel}? This will allow the account to login again.`;

      if (!window.confirm(confirmText)) return;

      params.input_is_disabled = nextDisabled;
    }

    if (action === "badge") {
      const badgeInput = card ? card.querySelector("[data-ps-user-badge]") : null;
      const selectedBadges = splitBadgeLabels(badgeInput ? badgeInput.value : "");
      params.input_badge_label = selectedBadges.join(", ");
      params.input_is_premium = selectedBadges.some(label => normalizeBadgeValue(label) === "premium");
      syncAdminUserCardBadgePreview(card, params.input_badge_label);
    }

    if (action === "password") {
      const passwordInput = card ? card.querySelector("[data-ps-user-password]") : null;
      const newPassword = passwordInput ? passwordInput.value.trim() : "";
      const passwordError = validatePassword(newPassword);

      if (passwordError) {
        setMessage(messageNode, passwordError, "error");
        return;
      }

      if (!window.confirm(`Reset password for ${userLabel}? The user will need the new password on next login.`)) return;

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

      if (!window.confirm(`Reset PIN/key for ${userLabel}? The user will need the new PIN/key for recovery.`)) return;

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
        const isAdminModerationAction = Boolean(postMenuAction.closest("[data-ps-admin-post-list]"));
        closePostMenus();
        await handleFeedClick(event);

        if (isAdminModerationAction) {
          await loadPosts();
          renderPostModerationAdmin();
        }

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
        await renderAdminOverview();
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
  document.addEventListener("click", handleCommentsModalClick);
  document.addEventListener("submit", handleCommentsSubmit);
  document.addEventListener("input", handleCommentsModalInput);
  document.addEventListener("keydown", handleCommentsModalKeydown);
  document.addEventListener("focusin", handleMobileTypingFocus);
  document.addEventListener("focusout", handleMobileTypingBlur);
  window.addEventListener("resize", handleMobileTypingViewportChange, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleMobileTypingViewportChange, { passive: true });
    window.visualViewport.addEventListener("scroll", handleMobileTypingViewportChange, { passive: true });
  }

  updateMobileViewportState();

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
  root.addEventListener("change", handlePublicUserProfileFilterChange);
  root.addEventListener("click", handlePostFilterClick);
  root.addEventListener("click", handlePublicProfileBackClick);
  root.addEventListener("click", handlePublicUserProfileClick);


  if (bellButton) {
    bellButton.addEventListener("click", handleBellNotificationClick, true);
  }

  document.addEventListener("click", handleNotificationPanelClick);
  document.addEventListener("keydown", handleNotificationPanelKeydown);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!currentSession || !sessionToken()) return;

    refreshPublicSpaceLiveData();
  });

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

  // Bell click is handled by handleBellNotificationClick only.
  // Use the panel "Open Notifications" action for the full notification history.

  root.addEventListener("click", handleAdminAction);
  root.addEventListener("click", handleAdminUserResetClick);
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
    closeCommentsModal();
    closeAdminUserResetModal();
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
