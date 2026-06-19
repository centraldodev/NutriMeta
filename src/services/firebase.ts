import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from '@firebase/auth';
import {
  getAuth,
  initializeAuth,
  Auth,
} from '@firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { firebaseConfig, isFirebaseConfigured } from '../config';

// ─── Initialize (singleton-safe) ─────────────────────────────────────────────

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (!isFirebaseConfigured) {
  console.warn(
    'Firebase is not configured. Fill EXPO_PUBLIC_FIREBASE_* values or app.json extra before using auth/database features.'
  );
}

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence
        ? getReactNativePersistence(AsyncStorage)
        : undefined,
    });
  } catch {
    auth = getAuth(app);
  }
}
db = getFirestore(app);
storage = getStorage(app);

if (Platform.OS === 'web') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence: not supported in this environment');
    }
  });
}

export { app, auth, db, storage };

// ─── Firestore Collection Paths ──────────────────────────────────────────────
// Centralise collection names to avoid typos across services.

export const COLLECTIONS = {
  users:      'users',
  profiles:   'profiles',
  dailyLogs:  'dailyLogs',
  globalFoods:'globalFoods',
  savedMeals: 'savedMeals',
  groups:     'groups',
  groupStats: 'groupStats',
  communityComments: 'communityComments',
  communityPosts: 'communityPosts',
  communityFollows: 'communityFollows',
  notifications: 'notifications',
} as const;

// ─── Firestore Rules (copy to Firebase Console) ───────────────────────────────
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own profile
    match /profiles/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'nutritionist'
      );
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Daily logs: only owner
    match /dailyLogs/{logId} {
      allow read: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'nutritionist'
      );
      allow write: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    // Saved meals: only owner
    match /globalFoods/{foodId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }

    // Saved meals: only owner
    match /savedMeals/{mealId} {
      allow read, write: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Groups: members can read; only owner can write metadata
    match /groups/{groupId} {
      allow read: if request.auth != null
        && request.auth.uid in resource.data.memberIds;
      allow write: if request.auth != null
        && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null;
    }

    // Group stats: members can read; only owner of stat can write
    match /groupStats/{statId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }

    // Community posts: members/authenticated users can share meal photos
    match /communityPosts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.authorId == request.auth.uid;
    }

    match /communityFollows/{followId} {
      allow read: if request.auth != null;
      allow create, delete: if request.auth != null;
    }

    // Notifications: members can read; system/cloud functions write
    match /notifications/{notifId} {
      allow read: if request.auth != null
        && request.auth.uid in resource.data.targetUserIds;
      allow write: if false; // Cloud Functions only
    }

    // Community comments: public inside the group, authored by signed-in users
    match /communityComments/{commentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.authorId == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.authorId == request.auth.uid;
    }
  }
}
*/
