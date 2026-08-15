// TypeScript-only declaration for the platform-split '@/lib/adMob' module.
//
// There is deliberately NO plain lib/adMob.ts file. Metro resolves the real
// implementation at bundle time via its own platform-specific extension
// resolution:
//   - lib/adMob.native.ts → Android/iOS (real react-native-google-mobile-ads)
//   - lib/adMob.web.ts    → web (safe no-ops, keeps the native-only package
//                            out of the web bundle)
//
// This file only exists so TypeScript can resolve '@/lib/adMob'. Metro never
// bundles it ('.d.ts' files are ignored by the bundler), so it cannot pull
// react-native-google-mobile-ads into the web dependency graph.

export declare function showRewardedAd(): Promise<boolean>;
export declare function showInterstitialAd(): void;
export declare function showTasksInterstitial(): void;
