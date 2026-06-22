import Constants from 'expo-constants';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const extra = Constants.expoConfig?.extra ?? {};

// This app uses the Firebase JS SDK on both web and Expo native builds.
// The JS SDK must be initialized with the Firebase Web app credentials, even
// when the bundle is running on Android/iOS.
const firebaseJsApiKey =
  process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY ??
  String(extra.firebaseWebApiKey ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.firebaseApiKey ?? '');

const firebaseJsAppId =
  process.env.EXPO_PUBLIC_FIREBASE_WEB_APP_ID ??
  String(extra.firebaseWebAppId ?? process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.firebaseAppId ?? '');

export const firebaseConfig: FirebaseConfig = {
  apiKey: firebaseJsApiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? String(extra.firebaseAuthDomain ?? ''),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? String(extra.firebaseProjectId ?? ''),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? String(extra.firebaseStorageBucket ?? ''),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? String(extra.firebaseMessagingSenderId ?? ''),
  appId: firebaseJsAppId,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? String(extra.firebaseMeasurementId ?? ''),
};

export const isFirebaseConfigured =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.projectId) &&
  Boolean(firebaseConfig.appId);

export const googleAuthConfig = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? String(extra.googleWebClientId ?? ''),
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? String(extra.googleAndroidClientId ?? ''),
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? String(extra.googleIosClientId ?? ''),
};
