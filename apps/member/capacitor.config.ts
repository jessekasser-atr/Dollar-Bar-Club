import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.barglance.dollarbarclub",
  appName: "Dollar Bar Club",
  webDir: "public",
  server: {
    // In production the native app hits Render directly (no Vercel proxy).
    // During development you can override this with a local URL.
    url: undefined,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "Dollar Bar Club",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
  },
};

export default config;
