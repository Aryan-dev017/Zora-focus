// AdMob is intentionally disabled on web.
// react-native-google-mobile-ads is a native-only package.

export async function showRewardedAd(): Promise<boolean> {
  return false;
}

export function showInterstitialAd(): void {
  // No-op on web.
}

export function showTasksInterstitial(): void {
  // No-op on web.
}