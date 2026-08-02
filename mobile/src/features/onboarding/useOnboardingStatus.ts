import { useEffect, useState } from 'react';

import { getAvatar } from '@/src/core/api/avatar';
import { getMeasurements } from '@/src/core/api/measurements';

export type OnboardingStatus = 'unknown' | 'incomplete' | 'complete';

/**
 * Whether the current user still needs to go through onboarding
 * (measurements + avatar both need to exist). Re-checked whenever
 * `isAuthenticated` flips to `true`. Stays `'unknown'` (callers should keep
 * showing a loading state) until both GETs resolve.
 */
export function useOnboardingStatus(isAuthenticated: boolean): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>('unknown');

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('unknown');
      return;
    }

    let cancelled = false;
    setStatus('unknown');
    Promise.all([getMeasurements(), getAvatar()])
      .then(([measurements, avatar]) => {
        if (!cancelled) {
          setStatus(measurements && avatar ? 'complete' : 'incomplete');
        }
      })
      .catch(() => {
        // Don't strand the user on a spinner forever if the check itself
        // fails (e.g. a network hiccup) — send them into onboarding, whose
        // own submit flow will surface a real error if the backend is
        // actually unreachable.
        if (!cancelled) {
          setStatus('incomplete');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return status;
}
