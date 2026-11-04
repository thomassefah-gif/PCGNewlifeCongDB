import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type { UserRole } from '../../types/auth';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  assigned_group: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  role: Profile['role'] | null;
  userGroup: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(currentUser: User | null): Promise<Profile | null> {
  if (!currentUser) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,is_active,assigned_group')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) throw error;
  if (data?.role !== 'admin' && data?.role !== 'user' && data?.role !== 'viewer' && data?.role !== 'group_leader') return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionVersion = useRef(0);

  const applySession = useCallback(async (session: Session | null) => {
    const version = ++sessionVersion.current;
    const nextUser = session?.user ?? null;
    setUser(nextUser);
    if (!nextUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextProfile = await fetchProfile(nextUser);
      if (sessionVersion.current === version) setProfile(nextProfile);
    } catch (error) {
      console.error('Unable to load the signed-in profile.', error);
      if (sessionVersion.current === version) setProfile(null);
    } finally {
      if (sessionVersion.current === version) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) void applySession(session);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (mounted) return applySession(data.session);
        return undefined;
      })
      .catch((error: unknown) => {
        console.error('Unable to restore the authentication session.', error);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      sessionVersion.current += 1;
      authListener.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
  }, [applySession]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
    if (error) throw new Error(error.message);
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = user;
    setProfile(await fetchProfile(currentUser));
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    role: profile?.role ?? null,
    userGroup: profile?.assigned_group?.trim() || null,
    loading,
    signIn,
    signOut,
    refreshProfile,
  }), [user, profile, loading, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
