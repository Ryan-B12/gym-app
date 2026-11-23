import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { DEMO, supabase } from '../lib/supabase';

interface SessionState { ready: boolean; session: Session | null }
export const useSession = create<SessionState>(() => ({ ready: DEMO, session: null }));

if (!DEMO) {
  supabase.auth.getSession().then(({ data }) => useSession.setState({ ready: true, session: data.session }));
  supabase.auth.onAuthStateChange((_e, session) => useSession.setState({ ready: true, session }));
}

export function useSignedIn(): boolean {
  const session = useSession((s) => s.session);
  return DEMO || !!session;
}
