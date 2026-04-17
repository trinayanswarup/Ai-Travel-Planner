import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

const assertSupabase = () => {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const client = assertSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const client = assertSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

export const signInWithEmail = async (email: string, password: string) => {
  const client = assertSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOutUser = async () => {
  const client = assertSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
};

export const onAuthStateChanged = (callback: (session: Session | null) => void) => {
  const client = assertSupabase();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => subscription.unsubscribe();
};
