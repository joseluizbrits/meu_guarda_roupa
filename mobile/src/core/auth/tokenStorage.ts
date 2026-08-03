import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// expo-secure-store has no web implementation (SDK 57) — there's no
// Keychain/Keystore in a browser. Web doesn't need one here either: the
// backend sets the access/refresh tokens as httpOnly cookies instead (see
// `auth_service.set_auth_cookies` and `client.ts`'s `credentials: 'include'`
// fetches) — never readable by JS at all, which is strictly better than
// anything this module could do client-side (an earlier version fell back
// to localStorage, readable by any JS on the page — a real XSS exposure).
// So on web these are all no-ops; native (iOS/Android) uses the real secure
// enclave as before.
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([setItem(ACCESS_TOKEN_KEY, accessToken), setItem(REFRESH_TOKEN_KEY, refreshToken)]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
}
