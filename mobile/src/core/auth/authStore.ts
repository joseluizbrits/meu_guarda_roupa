import { create } from 'zustand';

import { api } from '@/src/core/api/client';
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
    await tokenStorage.clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // The stored access token may have expired — apiRequest's own
      // refresh-and-retry logic handles that transparently.
      const user = await api.get<User>('/api/v1/users/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await tokenStorage.clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
