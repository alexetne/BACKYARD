import type { ExpoConfig } from "expo/config";

const allowDevelopmentHttp = process.env.LAST_LOOP_ALLOW_HTTP === "1";

const config: ExpoConfig = {
  name: "Last Loop Tracker",
  slug: "last-loop-tracker",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  scheme: "lastloop",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "fr.lastloop.tracker",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Last Loop utilise votre position pour permettre à l’organisation de suivre votre progression pendant la course.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Last Loop utilise votre position en arrière-plan uniquement pendant le suivi de votre course.",
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        ...(allowDevelopmentHttp ? { NSAllowsArbitraryLoads: true } : {}),
      },
    },
  },
  android: {
    package: "fr.lastloop.tracker",
  },
  plugins: [
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Autoriser Last Loop à suivre votre position pendant la course, même lorsque l’écran est verrouillé.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    "expo-secure-store",
    ["expo-build-properties", { android: { usesCleartextTraffic: allowDevelopmentHttp } }],
  ],
  extra: {
    privacyNotice:
      "Le mode HTTP local est réservé au développement. Utilisez exclusivement HTTPS en production.",
  },
};

export default config;
