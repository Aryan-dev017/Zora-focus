// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// context/RevenueCatProvider.tsx  â€”  Owl Reflection Engine
//
// Global RevenueCat state via React Context.
// Wrap the entire app with <RevenueCatProvider> (done inside app/_layout.tsx).
//
// Exposes via useRevenueCat():
//   isPro         â€” boolean, reactive entitlement state
//   customerInfo  â€” raw RC CustomerInfo object
//   offering      â€” { monthly, yearly, lifetime } packages
//   loading       â€” true while initial fetch is in flight
//   purchase()    â€” purchase a package, returns PurchaseResult
//   restore()     â€” restore purchases, returns RestoreResult
//   refreshStatus â€” manually re-fetch customer info
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { CustomerInfo } from 'react-native-purchases';
import {
  configureRevenueCat,
  getCustomerInfo,
  getOwlOffering,
  isPro as checkIsPro,
  listenForCustomerInfoUpdates,
  purchasePackage as rcPurchase,
  restorePurchases as rcRestore,
  type OwlOffering,
  type PurchaseResult,
  type RestoreResult,
} from '@/lib/purchases';
import type { PurchasesPackage } from 'react-native-purchases';

// â”€â”€â”€ Context shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RevenueCatContextValue {
  isPro:          boolean;
  customerInfo:   CustomerInfo | null;
  offering:       OwlOffering;
  loading:        boolean;
  purchase:       (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  restore:        () => Promise<RestoreResult>;
  refreshStatus:  () => Promise<void>;
}

const EMPTY_OFFERING: OwlOffering = {
  monthly: null, yearly: null, lifetime: null, raw: null,
};

const RevenueCatContext = createContext<RevenueCatContextValue>({
  isPro:         false,
  customerInfo:  null,
  offering:      EMPTY_OFFERING,
  loading:       true,
  purchase:      async () => ({ success:false, customerInfo:null, error:'Not ready', cancelled:false }),
  restore:       async () => ({ success:false, customerInfo:null, error:'Not ready' }),
  refreshStatus: async () => {},
});

// â”€â”€â”€ Provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering,     setOffering]     = useState<OwlOffering>(EMPTY_OFFERING);
  const [loading,      setLoading]      = useState(true);

  // â”€â”€ Initial fetch on mount
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await configureRevenueCat();

        let info = null;
        let off = EMPTY_OFFERING;

        try {
          info = await getCustomerInfo();
          off  = await getOwlOffering();
        } catch (e) {
          console.warn('[RC] Initial load failed:', e);
        }

        if (!mounted) return;

        setCustomerInfo(info);
        setOffering(off);
      } catch (e) {
        console.warn('[RC] Provider bootstrap failed:', e);
        if (!mounted) return;
        setCustomerInfo(null);
        setOffering(EMPTY_OFFERING);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  // â”€â”€ Live updates â€” RC fires this whenever subscription state changes
  useEffect(() => {
    let mounted = true;
    let unsub = () => {};

    const setupListener = async () => {
      try {
        await configureRevenueCat();
        if (!mounted) return;
        unsub = listenForCustomerInfoUpdates((info) => {
          setCustomerInfo(info);
        });
      } catch (e) {
        console.warn('[RC] Customer info listener setup failed:', e);
      }
    };

    void setupListener();

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // â”€â”€ Purchase
  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
    const result = await rcPurchase(pkg);
    if (result.customerInfo) setCustomerInfo(result.customerInfo);
    return result;
  }, []);

  // â”€â”€ Restore
  const restore = useCallback(async (): Promise<RestoreResult> => {
    const result = await rcRestore();
    if (result.customerInfo) setCustomerInfo(result.customerInfo);
    return result;
  }, []);

  // â”€â”€ Manual refresh (pull-to-refresh, backgroundâ†’foreground, etc.)
  const refreshStatus = useCallback(async () => {
    try {
      await configureRevenueCat();
      const [info, off] = await Promise.all([
        getCustomerInfo(),
        getOwlOffering(),
      ]);

      setCustomerInfo(info);
      setOffering(off);
    } catch (e) {
      console.warn('[RC] refreshStatus failed:', e);
      setCustomerInfo(null);
      setOffering(EMPTY_OFFERING);
    }
  }, []);

  const value: RevenueCatContextValue = {
    isPro:         checkIsPro(customerInfo),
    customerInfo,
    offering,
    loading,
    purchase,
    restore,
    refreshStatus,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

// â”€â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useRevenueCat(): RevenueCatContextValue {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) {
    throw new Error('useRevenueCat must be used inside <RevenueCatProvider>');
  }
  return ctx;
}

export default RevenueCatProvider;
