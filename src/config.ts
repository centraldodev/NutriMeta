import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

export const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? String(
    Platform.OS === 'web' ? extra.firebaseWebApiKey ?? extra.firebaseApiKey ?? '' : extra.firebaseApiKey ?? ''
  ),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? String(extra.firebaseAuthDomain ?? ''),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? String(extra.firebaseProjectId ?? ''),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? String(extra.firebaseStorageBucket ?? ''),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? String(extra.firebaseMessagingSenderId ?? ''),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? String(
    Platform.OS === 'web' ? extra.firebaseWebAppId ?? extra.firebaseAppId ?? '' : extra.firebaseAppId ?? ''
  ),
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
