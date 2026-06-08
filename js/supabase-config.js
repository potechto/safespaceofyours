window.SAFESPACE_SUPABASE = {
  url: "https://hnycudafoyybmctxqfup.supabase.co",
  anonKey: "sb_publishable_6d4hoJf44l3BVln2d4kl5g_CTyz0M3d",
  adminEmail: "ralphjohnsantos5@gmail.com"
};

window.safeAdminClient = window.supabase.createClient(
  window.SAFESPACE_SUPABASE.url,
  window.SAFESPACE_SUPABASE.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
