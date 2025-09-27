import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, firstName?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: any | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const upsertProfileFromUser = async (u: User | null) => {
    try {
      if (!u) return;
      const displayName = (u.user_metadata as any)?.display_name
        || (u.user_metadata as any)?.name
        || (u.user_metadata as any)?.full_name
        || (u.user_metadata as any)?.given_name
        || (u.user_metadata as any)?.first_name
        || (u.email ? u.email.split('@')[0] : null)
        || 'User';
      const email = u.email || null;
      
      // First try to insert, then update if needed
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ user_id: u.id, display_name: displayName, email });
      
      if (insertError && insertError.code === '23505') {
        // User already exists, update instead
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ display_name: displayName, email })
          .eq('user_id', u.id);
        if (updateError) console.warn('profiles update warning:', updateError.message);
      } else if (insertError) {
        console.warn('profiles insert warning:', insertError.message);
      }
    } catch (e) {
      console.warn('profiles upsert failed (non-fatal):', (e as Error).message);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        // Synchronous state updates to prevent deadlocks
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Handle session refresh
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully');
        } else if (event === 'SIGNED_OUT') {
          console.log('User signed out');
        } else if (event === 'SIGNED_IN') {
          console.log('User signed in');
          upsertProfileFromUser(session?.user ?? null);
          // If the user signed in with Google, set a flag to check Gmail connection
          (async () => {
            try {
              const provider = (session?.user?.app_metadata as any)?.provider;
              console.log('SIGNED_IN event - provider:', provider, 'user:', session?.user?.email);
              if (provider === 'google' && session?.user) {
                console.log('Checking Gmail connection for Google user:', session.user.id);
                
                // For new Google users, always set the prompt flag initially
                localStorage.setItem('prompt_gmail_connect', '1');
                console.log('Set initial prompt flag for Google user');
                
                const { data, error } = await supabase
                  .from('gmail_connections')
                  .select('id')
                  .eq('user_id', session.user.id)
                  .eq('is_active', true)
                  .maybeSingle();
                
                if (error) {
                  console.warn('Gmail connection check error:', error.message, '- keeping prompt flag');
                  // Keep the prompt flag on error
                } else if (!data) {
                  console.log('No Gmail connection found, keeping prompt flag');
                  // Keep the prompt flag - already set above
                  console.log('Flag confirmed, localStorage contains:', localStorage.getItem('prompt_gmail_connect'));
                } else {
                  console.log('Gmail connection found, removing prompt flag');
                  // Clear the prompt flag since Gmail is already connected
                  localStorage.removeItem('prompt_gmail_connect');
                }
              }
            } catch (e) {
              console.warn('Auto Gmail connect check failed:', (e as Error).message);
              // On error, assume no connection and show prompt
              localStorage.setItem('prompt_gmail_connect', '1');
            }
          })();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signUp = async (email: string, password: string, firstName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName
        }
      }
    });
    return { error };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error (continuing anyway):', error);
      }
    } catch (error) {
      console.error('Logout failed (continuing anyway):', error);
    } finally {
      // Always clear local state and storage regardless of API response
      localStorage.clear();
      setSession(null);
      setUser(null);
      window.location.href = '/auth';
    }
  };

  const signInWithGoogle = async () => {
    // Force localhost redirect during development
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const redirectTo = isLocalhost ? `${window.location.origin}/` : `${window.location.origin}/`;
    console.log('Google OAuth redirect will go to:', redirectTo, 'isLocalhost:', isLocalhost);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) {
      console.error('Google OAuth error:', error);
      return { error };
    }
    return { error: null };
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithGoogle
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};