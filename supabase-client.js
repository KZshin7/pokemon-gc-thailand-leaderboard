import { createClient } from "@supabase/supabase-js";

export function getSupabaseConfig(environment = import.meta.env) {
  const url = environment?.VITE_SUPABASE_URL?.trim();
  const anonKey = environment?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  try {
    const parsedUrl = new URL(url);
    const localHost = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !(localHost && parsedUrl.protocol === "http:")) return null;
  } catch {
    return null;
  }

  return { url, anonKey };
}

export function createSupabaseClient(config) {
  return createClient(config.url, config.anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
