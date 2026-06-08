const adminClient = window.safeAdminClient;
const adminConfig = window.SAFESPACE_SUPABASE;

const authView = document.querySelector("#authView");
const dashboardView = document.querySelector("#dashboardView");
const emailForm = document.querySelector("#emailForm");
const verifyForm = document.querySelector("#verifyForm");
const profileForm = document.querySelector("#profileForm");
const emailInput = document.querySelector("#emailInput");
const codeInput = document.querySelector("#codeInput");
const authMessage = document.querySelector("#authMessage");
const adminIdentity = document.querySelector("#adminIdentity");
const logoutBtn = document.querySelector("#logoutBtn");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const authTitle = document.querySelector("#authTitle");
const emailSubmitBtn = document.querySelector("#emailSubmitBtn");

const CODE_LENGTH = 8;

let authMode = sessionStorage.getItem("safespace_auth_mode") || "login";
let pendingEmail = "";
let isVerifyingCode = false;
let suppressAuthRefresh = false;

sessionStorage.removeItem("safespace_auth_mode");

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message || "";
  element.classList.remove("success", "error");

  if (type) {
    element.classList.add(type);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCode(code) {
  return String(code || "").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

function isAllowedAdminEmail(email) {
  return normalizeEmail(email) === normalizeEmail(adminConfig.adminEmail);
}

function setAuthModeUI() {
  const label = authMode === "signup" ? "Sign-up" : "Sign-in";

  if (authTitle) authTitle.textContent = label;
  if (emailSubmitBtn) emailSubmitBtn.textContent = label;

  authTabs.forEach(tab => {
    const tabMode = tab.dataset.authMode || "login";
    tab.classList.toggle("active", tabMode === authMode);
  });
}

function showAuth() {
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
}

function showEmailStep(message = "", type = "") {
  showAuth();

  emailForm.classList.remove("hidden");
  verifyForm.classList.add("hidden");

  if (profileForm) {
    profileForm.classList.add("hidden");
  }

  if (codeInput) {
    codeInput.value = "";
  }

  pendingEmail = "";
  isVerifyingCode = false;

  setAuthModeUI();
  setMessage(authMessage, message, type);
}

function showCodeStep(message = "Code sent.") {
  showAuth();

  emailForm.classList.remove("hidden");
  verifyForm.classList.remove("hidden");

  if (profileForm) {
    profileForm.classList.add("hidden");
  }

  codeInput.value = "";
  isVerifyingCode = false;

  setMessage(authMessage, message, "success");

  setTimeout(() => {
    codeInput.focus();
  }, 80);
}

function showDashboard(profile) {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  if (adminIdentity) {
    adminIdentity.textContent = profile ? profile.username : "";
  }

  if (typeof window.loadAdminDashboard === "function") {
    window.loadAdminDashboard();
  }
}

async function getAdminProfile() {
  const { data: sessionData } = await adminClient.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) return null;

  const { data, error } = await adminClient
    .from("admin_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function emailAlreadyRegistered(email) {
  const { data, error } = await adminClient.rpc("admin_profile_exists", {
    check_email: normalizeEmail(email)
  });

  if (error) throw error;

  return Boolean(data);
}

async function createQuietProfile() {
  const { data: sessionData } = await adminClient.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    throw new Error("Session expired.");
  }

  const profile = {
    user_id: user.id,
    email: normalizeEmail(user.email),
    username: "Owner",
    phone: ""
  };

  const { error } = await adminClient
    .from("admin_profiles")
    .insert(profile);

  if (error) {
    const lowerMessage = String(error.message || "").toLowerCase();

    if (
      lowerMessage.includes("duplicate") ||
      lowerMessage.includes("already")
    ) {
      throw new Error("Email already exist.");
    }

    throw error;
  }
}

async function verifyOtpForCurrentMode(email, token) {
  const otpTypes = authMode === "signup"
    ? ["email", "signup"]
    : ["email"];

  let lastError = null;

  for (const type of otpTypes) {
    const { error } = await adminClient.auth.verifyOtp({
      email,
      token,
      type
    });

    if (!error) {
      return null;
    }

    lastError = error;
  }

  return lastError;
}

async function refreshAuthState() {
  if (suppressAuthRefresh) return;

  try {
    const { data } = await adminClient.auth.getSession();
    const user = data?.session?.user;

    if (!user) {
      showAuth();
      setAuthModeUI();
      return;
    }

    if (!isAllowedAdminEmail(user.email)) {
      await adminClient.auth.signOut();
      showEmailStep("This email is not allowed.", "error");
      return;
    }

    const profile = await getAdminProfile();

    if (!profile) {
      await adminClient.auth.signOut();
      showEmailStep("");
      return;
    }

    showDashboard(profile);
  } catch (error) {
    showAuth();
    setAuthModeUI();
    setMessage(authMessage, error.message || "Could not continue.", "error");
  }
}

authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.authMode || "login";
    showEmailStep("");
  });
});

emailForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = normalizeEmail(emailInput.value);

  if (!isAllowedAdminEmail(email)) {
    setMessage(authMessage, "This email is not allowed.", "error");
    return;
  }

  try {
    if (authMode === "signup") {
      const exists = await emailAlreadyRegistered(email);

      if (exists) {
        setMessage(authMessage, "Email already exist.", "error");
        return;
      }
    }
  } catch (error) {
    setMessage(authMessage, error.message || "Could not check email.", "error");
    return;
  }

  pendingEmail = email;
  setMessage(authMessage, "Sending code...", "");

  const { error } = await adminClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: authMode === "signup",
      emailRedirectTo: window.location.href
    }
  });

  if (error) {
    const lowerMessage = String(error.message || "").toLowerCase();

    if (authMode === "signup" && lowerMessage.includes("already")) {
      setMessage(authMessage, "Email already exist.", "error");
      return;
    }

    setMessage(authMessage, error.message || "Could not send code.", "error");
    return;
  }

  showCodeStep("Code sent.");
});

async function verifyCodeIfReady() {
  if (isVerifyingCode) return;

  const token = normalizeCode(codeInput.value);
  codeInput.value = token;

  if (token.length !== CODE_LENGTH) return;

  if (!pendingEmail) {
    setMessage(authMessage, "Enter email first.", "error");
    return;
  }

  isVerifyingCode = true;
  suppressAuthRefresh = true;
  setMessage(authMessage, "Checking code...", "");

  const verifyError = await verifyOtpForCurrentMode(pendingEmail, token);

  if (verifyError) {
    isVerifyingCode = false;
    suppressAuthRefresh = false;
    codeInput.value = "";
    codeInput.focus();
    setMessage(authMessage, "Incorrect code.", "error");
    return;
  }

  if (authMode === "signup") {
    try {
      await createQuietProfile();
      await adminClient.auth.signOut();

      sessionStorage.setItem("safespace_auth_mode", "login");
      window.location.href = "admin.html";
      return;
    } catch (error) {
      isVerifyingCode = false;
      suppressAuthRefresh = false;
      codeInput.value = "";
      codeInput.focus();
      setMessage(authMessage, error.message || "Setup failed.", "error");
      return;
    }
  }

  try {
    const profile = await getAdminProfile();

    if (!profile) {
      await adminClient.auth.signOut();
      suppressAuthRefresh = false;
      showEmailStep("Use Sign-up first.", "error");
      return;
    }

    suppressAuthRefresh = false;
    showDashboard(profile);
  } catch (error) {
    isVerifyingCode = false;
    suppressAuthRefresh = false;
    setMessage(authMessage, error.message || "Could not continue.", "error");
  }
}

codeInput.addEventListener("input", verifyCodeIfReady);

verifyForm.addEventListener("submit", event => {
  event.preventDefault();
  verifyCodeIfReady();
});

if (profileForm) {
  profileForm.classList.add("hidden");
}

logoutBtn.addEventListener("click", async () => {
  await adminClient.auth.signOut();

  authMode = "login";
  showEmailStep("Logged out.", "success");
});

adminClient.auth.onAuthStateChange(() => {
  if (suppressAuthRefresh) return;
  refreshAuthState();
});

setAuthModeUI();
refreshAuthState();

