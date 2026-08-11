// ─────────────────────────────────────────────────────────────────────────────
// lib/purchases.ts  —  Owl Reflection Engine
//
// Central RevenueCat service:
//   • configure() — call once on app launch (in _layout.tsx)
//   • identifyUser() — tie RC customer to Supabase userId
//   • getOfferings() — fetch Monthly / Yearly / Lifetime packages
//   • purchasePackage() — execute a purchase
//   • restorePurchases() — restore previous purchases
//   • getCustomerInfo() — current entitlement state
//   • isPro() — quick boolean entitlement check
//   • listenForCustomerInfoUpdates() — subscribe to live updates
// ─────────────────────────────────────────────────────────────────────────────

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesError,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { ENV } from './env';

// ─── Constants ────────────────────────────────────────────────────────────────

export const isExpoGo =
  Constants.executionEnvironment === 'storeClient';

// Public SDK keys from RevenueCat dashboard:
// Project Settings -> API keys -> App specific keys
// In release builds, keep these in EXPO_PUBLIC_REVENUECAT_*_API_KEY.
const DEV_FALLBACK_RC_KEYS = {
  ios: 'test_gAKEhkBMTjBQjrPFqIKkjonsuMl',
  android: 'goog_uydQKrvxwxKQNHuaYSASSkbjZGh',
};

const RC_KEYS = {
  ios: ENV.revenueCatIosApiKey || (__DEV__ ? DEV_FALLBACK_RC_KEYS.ios : ''),
  android: ENV.revenueCatAndroidApiKey || (__DEV__ ? DEV_FALLBACK_RC_KEYS.android : ''),
};

let revenueCatConfigured = false;
let revenueCatInitializing = false;
let revenueCatConfigurePromise: Promise<void> | null = null;

// Entitlement identifier — must match EXACTLY what you set in the RC dashboard
export const ENTITLEMENT_ID = 'Zora Pro';

// Product identifiers — must match the identifiers you created in the RC dashboard
export const PACKAGE_IDS = {
  monthly: '$rc_monthly',
  yearly: '$rc_annual',
  lifetime: '$rc_lifetime',
} as const;

// ─── Configure ────────────────────────────────────────────────────────────────

/**
 * Call this ONCE at app startup, before any other RC method.
 * Best place: useEffect in app/_layout.tsx
 */
export async function configureRevenueCat(): Promise<void> {
  if (isExpoGo) {
    console.log('[RC] Skipped in Expo Go');
    return;
  }
  if (revenueCatConfigured) {
    return;
  }
  if (revenueCatInitializing) {
    if (revenueCatConfigurePromise) {
      await revenueCatConfigurePromise;
    }
    return;
  }

  revenueCatInitializing = true;
  revenueCatConfigurePromise = (async () => {
    try {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.INFO);

      const apiKey = Platform.OS === 'ios' ? RC_KEYS.ios : RC_KEYS.android;
      if (!apiKey) {
        console.warn(
          `[RC] Missing RevenueCat API key for ${Platform.OS}. Purchases will stay disabled in this build.`
        );
        return;
      }
      if (!__DEV__ && apiKey.startsWith('test_')) {
        console.warn(
          '[RC] Test RevenueCat key detected in a release build. Set EXPO_PUBLIC_REVENUECAT_*_API_KEY.'
        );
      }

      Purchases.configure({ apiKey });
      revenueCatConfigured = true;
      console.log('[RC] Configured successfully');
    } catch (e) {
      console.error('[RC] configureRevenueCat error:', e);
    } finally {
      revenueCatInitializing = false;
    }
  })();

  if (revenueCatConfigurePromise) {
    await revenueCatConfigurePromise;
  }
}

function shouldSkipRevenueCatCall(): boolean {
  if (isExpoGo) {
    console.log('[RC] Skipped in Expo Go');
    return true;
  }
  if (!revenueCatConfigured) {
    console.log('[RC] Not configured yet');
    return true;
  }
  return false;
}

// ─── User Identity ────────────────────────────────────────────────────────────

/**
 * Link a Supabase userId to the RevenueCat customer.
 * Call this after successful sign-in and after loading the profile.
 * RC will merge anonymous purchases with this identity.
 */
export async function identifyUser(userId: string): Promise<CustomerInfo | null> {
  if (!userId) {
    return null;
  }
  if (shouldSkipRevenueCatCall()) {
    return null;
  }

  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (e) {
    console.error('[RC] identifyUser error:', e);
    return null;
  }
}

/**
 * Call on sign out to reset back to an anonymous RC customer.
 */
export async function resetUser(): Promise<void> {
  if (shouldSkipRevenueCatCall()) {
    return;
  }

  try {
    await Purchases.logOut();
    console.log('[RC] Logged out, reset to anonymous customer');
  } catch (e) {
    console.error('[RC] resetUser error:', e);
  }
}

// ─── Offerings ────────────────────────────────────────────────────────────────

export interface OwlOffering {
  monthly:  PurchasesPackage | null;
  yearly:   PurchasesPackage | null;
  lifetime: PurchasesPackage | null;
  raw:      PurchasesOffering | null;
}

/**
 * Fetch the current offering from the RC dashboard.
 * Falls back gracefully — missing packages return null.
 */
export async function getOwlOffering(): Promise<OwlOffering> {
  const empty: OwlOffering = { monthly: null, yearly: null, lifetime: null, raw: null };
  if (shouldSkipRevenueCatCall()) {
    return empty;
  }

  try {
    const offerings = await Purchases.getOfferings();
    const current   = offerings.current;

    if (!current) {
      console.warn('[RC] No current offering configured in dashboard');
      return empty;
    }

    // Find packages by their identifier (set in RC dashboard)
    const findPkg = (id: string): PurchasesPackage | null =>
      current.availablePackages.find(p => p.identifier === id) ?? null;

    return {
      raw:      current,
      monthly:  findPkg(PACKAGE_IDS.monthly),
      yearly:   findPkg(PACKAGE_IDS.yearly),
      lifetime: findPkg(PACKAGE_IDS.lifetime),
    };
  } catch (e) {
    console.error('[RC] getOwlOffering error:', e);
    return empty;
  }
}

// ─── Customer Info ────────────────────────────────────────────────────────────

/**
 * Get the current customer info (entitlement state, active subscriptions, etc.)
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (shouldSkipRevenueCatCall()) {
    return null;
  }

  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.error('[RC] getCustomerInfo error:', e);
    return null;
  }
}

/**
 * Quick boolean check — is "Zora Pro" entitlement active?
 */
export function isPro(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== 'undefined';
}

/**
 * Subscribe to live customerInfo updates (fires on purchase, restore, renewal).
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function listenForCustomerInfoUpdates(
  handler: (info: CustomerInfo) => void
): () => void {
  if (shouldSkipRevenueCatCall()) {
    return () => {};
  }

  Purchases.addCustomerInfoUpdateListener(handler);
  return () => Purchases.removeCustomerInfoUpdateListener(handler);
}


// ─── Purchase ────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  success:      boolean;
  customerInfo: CustomerInfo | null;
  error:        string | null;
  cancelled:    boolean;
}

/**
 * Execute a purchase for a specific package.
 * Handles user-cancelled state separately from hard errors.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (shouldSkipRevenueCatCall()) {
    return {
      success: false,
      customerInfo: null,
      error: 'Purchases unavailable in this build.',
      cancelled: false,
    };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return {
      success:      isPro(customerInfo),
      customerInfo,
      error:        null,
      cancelled:    false,
    };
  } catch (e: any) {
    const rcError = e as PurchasesError;

    // User cancelled — not a real error, don't show an alert
    if (rcError.userCancelled) {
      return { success: false, customerInfo: null, error: null, cancelled: true };
    }

    console.error('[RC] purchasePackage error:', rcError);
    return {
      success:      false,
      customerInfo: null,
      error:        rcError.message ?? 'Purchase failed. Please try again.',
      cancelled:    false,
    };
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export interface RestoreResult {
  success:      boolean;
  customerInfo: CustomerInfo | null;
  error:        string | null;
}

/**
 * Restore previous purchases (required by App Store guidelines).
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (shouldSkipRevenueCatCall()) {
    return {
      success: false,
      customerInfo: null,
      error: 'Restore unavailable in this build.',
    };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return {
      success:      isPro(customerInfo),
      customerInfo,
      error:        null,
    };
  } catch (e: any) {
    console.error('[RC] restorePurchases error:', e);
    return {
      success:      false,
      customerInfo: null,
      error:        (e as PurchasesError).message ?? 'Restore failed. Please try again.',
    };
  }
}
