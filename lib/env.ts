const PROCESS_ENV = process.env as Record<string, string | undefined>;

function readEnv(name: string, fallback = ''): string {
  const value = PROCESS_ENV[name];
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = PROCESS_ENV[name];
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return fallback;
}

const DEFAULTS = {
  SUPABASE_URL: 'https://ilsyvemhdpdizdasubub.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsc3l2ZW1oZHBkaXpkYXN1YnViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjM0NTgsImV4cCI6MjA4NzQzOTQ1OH0.cUBNVx5QLLRdC3iDzT0mx2FuCRFn2yYg1To4Y9zXje4',
  SENTRY_DSN:
    'https://d3f429a52f0c090b2b5a100e108f641a@o4510933453701120.ingest.de.sentry.io/4511211310481488',
  POSTHOG_HOST: 'https://app.posthog.com',
  ADMOB_ANDROID_APP_ID: 'ca-app-pub-3940256099942544~3347511713',
  ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511',
};

export const ENV = {
  supabaseUrl: readEnv('EXPO_PUBLIC_SUPABASE_URL', DEFAULTS.SUPABASE_URL),
  supabaseAnonKey: readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', DEFAULTS.SUPABASE_ANON_KEY),
  sentryDsn: readEnv('EXPO_PUBLIC_SENTRY_DSN', DEFAULTS.SENTRY_DSN),
  sentrySendDefaultPii: readBooleanEnv('EXPO_PUBLIC_SENTRY_SEND_DEFAULT_PII', false),
  posthogApiKey: readEnv('EXPO_PUBLIC_POSTHOG_KEY', ''),
  posthogHost: readEnv('EXPO_PUBLIC_POSTHOG_HOST', DEFAULTS.POSTHOG_HOST),
  revenueCatIosApiKey: readEnv('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', ''),
  revenueCatAndroidApiKey: readEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY', ''),
  admobAndroidAppId: readEnv('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', DEFAULTS.ADMOB_ANDROID_APP_ID),
  admobIosAppId: readEnv('EXPO_PUBLIC_ADMOB_IOS_APP_ID', DEFAULTS.ADMOB_IOS_APP_ID),
  supabaseAuthRedirectUrl: readEnv('EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL', ''),
} as const;

let startupWarningsLogged = false;

export function logStartupConfigWarnings(): void {
  if (startupWarningsLogged) {
    return;
  }
  startupWarningsLogged = true;

  const missing: string[] = [];
  if (!ENV.revenueCatAndroidApiKey) missing.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  if (!ENV.revenueCatIosApiKey) missing.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  if (!ENV.posthogApiKey) missing.push('EXPO_PUBLIC_POSTHOG_KEY');

  if (missing.length > 0) {
    console.warn(
      `[Env] Missing optional vars: ${missing.join(', ')}. Related services will run in safe mode.`
    );
  }

  if (ENV.admobAndroidAppId === DEFAULTS.ADMOB_ANDROID_APP_ID) {
    console.warn(
      '[Env] EXPO_PUBLIC_ADMOB_ANDROID_APP_ID is not set. Using Google test App ID for launch safety.'
    );
  }
}

