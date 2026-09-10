import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import { createDownloadResumable } from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import { getAppLatest, type AppLatest } from '@/src/core/api/appInfo';

export type UpdateStatus =
  | 'idle'
  | 'checking_ota'
  | 'checking_apk'
  | 'ota_available'
  | 'update_available'
  | 'downloading'
  | 'ready_to_install'
  | 'installing'
  | 'up_to_date'
  | 'error';

type UpdateState = {
  status: UpdateStatus;
  latest: AppLatest | null;
  progress: number | null;
  error: string | null;
  isChecking: boolean;

  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  reset: () => void;
};

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  latest: null,
  progress: null,
  error: null,
  isChecking: false,

  reset: () => {
    set({ status: 'idle', latest: null, progress: null, error: null, isChecking: false });
  },

  check: async () => {
    const { isChecking } = get();
    if (isChecking) return;

    set({ isChecking: true, error: null });

    try {
      // Check for native APK update first
      set({ status: 'checking_apk' });

      const latest = await getAppLatest();
      const currentVersionCode = parseInt(Application.nativeBuildVersion || '0', 10);
      const latestVersionCode = parseInt(String(latest.version_code), 10);

      if (latestVersionCode > currentVersionCode) {
        // Native update available - skip OTA check
        set({ status: 'update_available', latest });
        return;
      }

      // No native update - check OTA
      set({ status: 'checking_ota' });

      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        set({ status: 'ota_available', latest: null });
      } else {
        set({ status: 'up_to_date', latest: null });
      }
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Check failed' });
    } finally {
      set({ isChecking: false });
    }
  },

  download: async () => {
    const { latest, status } = get();

    if (!latest || status !== 'update_available') {
      return;
    }

    set({ status: 'downloading', progress: 0, error: null });

    try {
      const downloadResumable = createDownloadResumable(
        latest.download_url,
        `${FileSystem.cacheDirectory}${latest.filename}`,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          set({ progress: Math.round(progress * 100) });
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (!result) {
        throw new Error('Download failed - no result');
      }

      // Verify file size
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (fileInfo.exists && fileInfo.size !== latest.size_bytes) {
        throw new Error(`Size mismatch: expected ${latest.size_bytes}, got ${fileInfo.size}`);
      }

      set({ status: 'ready_to_install', progress: 100 });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Download failed', progress: null });
    }
  },

  install: async () => {
    const { status, latest } = get();

    if (status !== 'ready_to_install' || !latest) {
      return;
    }

    if (Platform.OS !== 'android') {
      set({ error: 'Install only supported on Android' });
      return;
    }

    set({ status: 'installing', error: null });

    try {
      const fileUri = `${FileSystem.cacheDirectory}${latest.filename}`;
      const contentUri = await FileSystem.getContentUriAsync(fileUri);

      await startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });

      // The app will be backgrounded during install, so we don't set a final status
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Install failed' });
    }
  },
}));