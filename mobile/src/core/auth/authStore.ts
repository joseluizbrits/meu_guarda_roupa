import { Platform } from 'react-native';
import { create } from 'zustand';

import { api, onSessionExpired } from '@/src/core/api/client';
import * as tokenStorage from '@/src/core/auth/tokenStorage';

export type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
};

type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const data = await api.post<AuthTokenResponse>(
      '/api/v1/auth/login',
      { email, password },
      { auth: false }
    );
    await tokenStorage.setTokens(data.access_token, data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  register: async (email, password, fullName) => {
    const data = await api.post<AuthTokenResponse>(
      '/api/v1/auth/register',
      { email, password, full_name: fullName },
      { auth: false }
    );
    await tokenStorage.setTokens(data.access_token, data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    // Clears the web session's httpOnly cookies server-side — tokenStorage
    // alone can't do that (JS can't touch an httpOnly cookie at all).
    // Native has nothing for this endpoint to clear, but calling it is
    // harmless. Best-effort: a network failure shouldn't block logging out
    // locally.
    try {
      await api.post('/api/v1/auth/logout', undefined, { auth: false });
    } catch {
      // Ignored — see comment above.
    }
    await tokenStorage.clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  hydrate: async () => {
    set({ isLoading: true });
    try {
      // Native only: skip the network round-trip when there's provably no
      // stored access token. Web can't do this check at all anymore — the
      // token lives in an httpOnly cookie (tokenStorage's web reads always
      // return null now, on purpose, see tokenStorage.ts) — so on web this
      // has to just attempt the request every time and let the cookie (or
      // lack of one) answer the question; skipping it here was the actual
      // bug behind "refreshing the page loses the session".
      if (Platform.OS !== 'web') {
        const accessToken = await tokenStorage.getAccessToken();
        if (!accessToken) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }
      }

      // The access token may have expired — apiRequest's own
      // refresh-and-retry logic handles that transparently.
      const user = await api.get<User>('/api/v1/users/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await tokenStorage.clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

// `apiRequest` (client.ts) clears storage but has no reference to this
// store — it fires this event instead so the reactive `isAuthenticated`
// flag actually flips when a refresh attempt fails, instead of going stale.
onSessionExpired(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
