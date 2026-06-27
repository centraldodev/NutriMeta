import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from '@firebase/auth';
import {
  getAuth,
  initializeAuth,
  Auth,
} from '@firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
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
if (Platform.OS === 'web') {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

storage = getStorage(app);

export { app, auth, db, storage };

// ─── Firestore Collection Paths ──────────────────────────────────────────────
// Centralise collection names to avoid typos across services.

export const COLLECTIONS = {
  users:      'users',
  nicknames:  'nicknames',
  profiles:   'profiles',
  dailyLogs:  'dailyLogs',
  globalFoods:'globalFoods',
  savedMeals: 'savedMeals',
  groups:     'groups',
  groupStats: 'groupStats',
  communityComments: 'communityComments',
  communityPosts: 'communityPosts',
  communityFollows: 'communityFollows',
  nutritionistLinks: 'nutritionistLinks',
  nutritionistMessages: 'nutritionistMessages',
  foodPlans: 'foodPlans',
  notifications: 'notifications',
} as const;

// ─── Firestore Rules (copy to Firebase Console) ───────────────────────────────
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'nutritionist'
      );
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }

    match /nicknames/{nickname} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
      allow delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }

    // Users can only read/write their own profile
    match /profiles/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId ||
        get(/databases/$(database)/documents/nutritionistLinks/$(request.auth.uid + '_' + userId)).data.status == 'accepted'
      );
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Daily logs: only owner
    match /dailyLogs/{logId} {
      allow read: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        get(/databases/$(database)/documents/nutritionistLinks/$(request.auth.uid + '_' + resource.data.userId)).data.status == 'accepted'
      );
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid
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
      allow read: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId == request.auth.uid;
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

    match /nutritionistLinks/{linkId} {
      allow read: if request.auth != null && (
        resource.data.nutritionistId == request.auth.uid ||
        resource.data.patientId == request.auth.uid
      );
      allow create: if request.auth != null
        && request.resource.data.nutritionistId == request.auth.uid
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'nutritionist';
      allow update: if request.auth != null && (
        resource.data.nutritionistId == request.auth.uid ||
        resource.data.patientId == request.auth.uid
      );
    }

    match /nutritionistMessages/{messageId} {
      allow read: if request.auth != null && (
        resource.data.nutritionistId == request.auth.uid ||
        resource.data.patientId == request.auth.uid
      );
      allow create: if request.auth != null
        && request.resource.data.senderId == request.auth.uid
        && get(/databases/$(database)/documents/nutritionistLinks/$(request.resource.data.linkId)).data.status == 'accepted';
      allow update: if request.auth != null && (
        resource.data.nutritionistId == request.auth.uid ||
        resource.data.patientId == request.auth.uid
      );
    }

    match /foodPlans/{planId} {
      allow read: if request.auth != null && (
        resource.data.patientId == request.auth.uid ||
        resource.data.nutritionistId == request.auth.uid
      );
      allow create: if request.auth != null
        && request.resource.data.nutritionistId == request.auth.uid
        && get(/databases/$(database)/documents/nutritionistLinks/$(request.resource.data.nutritionistId + '_' + request.resource.data.patientId)).data.status == 'accepted';
      allow update: if request.auth != null
        && resource.data.nutritionistId == request.auth.uid
        && request.resource.data.nutritionistId == request.auth.uid;
    }

    // Notifications: users read their own; nutritionists can notify linked patients
    match /notifications/{notifId} {
      allow read: if request.auth != null && (
        request.auth.uid in resource.data.targetUserIds ||
        resource.data.groupId != null
      );
      allow create: if request.auth != null && (
        request.resource.data.userId == request.auth.uid ||
        request.auth.uid in request.resource.data.targetUserIds
      );
      allow update: if request.auth != null
        && request.auth.uid in resource.data.targetUserIds;
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
