import { create } from 'zustand';

import { getAvatar } from '@/src/core/api/avatar';
import { getMeasurements } from '@/src/core/api/measurements';

export type OnboardingStatus = 'unknown' | 'incomplete' | 'complete';

type OnboardingStatusState = {
  status: OnboardingStatus;
  /** Re-fetches measurements+avatar and derives status from whether both exist. */
  check: () => Promise<void>;
  /**
   * Flips straight to 'complete' without a re-fetch — used right after the
   * onboarding flow's own save succeeds, so the root layout's route guard
   * can react immediately instead of waiting on (and racing) a fresh check.
   */
  markComplete: () => void;
  reset: () => void;
};

/**
 * Whether the current user still needs to go through onboarding (both
 * measurements and avatar must exist). A store (not a plain hook) so
 * `review.tsx` can update it directly the moment onboarding finishes,
 * instead of the root layout only ever learning about it via `isAuthenticated`
 * flipping — which never happens again within the same logged-in session.
 */
export const useOnboardingStatusStore = create<OnboardingStatusState>((set) => ({
  status: 'unknown',

  check: async () => {
    set({ status: 'unknown' });
    try {
      const [measurements, avatar] = await Promise.all([getMeasurements(), getAvatar()]);
      set({ status: measurements && avatar ? 'complete' : 'incomplete' });
    } catch {
      // Don't strand the user on a spinner forever if the check itself fails
      // (e.g. a network hiccup) — send them into onboarding, whose own
      // submit flow will surface a real error if the backend is actually
      // unreachable.
      set({ status: 'incomplete' });
    }
  },

  markComplete: () => set({ status: 'complete' }),

  reset: () => set({ status: 'unknown' }),
}));
