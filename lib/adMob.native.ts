import {
  RewardedAd,
  RewardedAdEventType,
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// ─── Ad unit IDs ─────────────────────────────────────────────────────────────

const REWARDED_AD_ID = __DEV__
  ? TestIds.REWARDED
  : 'ca-app-pub-3821213948228348/7274366301';

const INTERSTITIAL_AD_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-3821213948228348/7547711977';

// ─── Rewarded ad ─────────────────────────────────────────────────────────────

export async function showRewardedAd(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const ad = RewardedAd.createForAdRequest(REWARDED_AD_ID, {
        requestNonPersonalizedAdsOnly: true,
      });

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const done = (value: boolean) => {
        if (settled) return;
        settled = true;

        try {
          unsubscribeLoaded();
          unsubscribeReward();
          unsubscribeClosed();
          unsubscribeError();
        } catch {}

        if (timeoutId !== null) clearTimeout(timeoutId);

        resolve(value);
      };

      timeoutId = setTimeout(() => done(false), 60_000);

      const unsubscribeReward = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => done(true)
      );

      const unsubscribeClosed = ad.addAdEventListener(
        AdEventType.CLOSED,
        () => done(false)
      );

      const unsubscribeError = ad.addAdEventListener(
        AdEventType.ERROR,
        () => done(false)
      );

      const unsubscribeLoaded = ad.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => {
          try {
            ad.show();
          } catch {
            done(false);
          }
        }
      );

      ad.load();
    } catch {
      resolve(false);
    }
  });
}

// ─── Interstitial ────────────────────────────────────────────────────────────

export function showInterstitialAd(): void {
  try {
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = ad.addAdEventListener(
      AdEventType.LOADED,
      () => {
        try {
          unsubscribeLoaded();
          ad.show();
        } catch {}
      }
    );

    ad.addAdEventListener(
      AdEventType.ERROR,
      () => {
        try {
          unsubscribeLoaded();
        } catch {}
      }
    );

    ad.load();
  } catch {}
}

// ─── Tasks interstitial ──────────────────────────────────────────────────────

export function showTasksInterstitial(): void {
  showInterstitialAd();
}