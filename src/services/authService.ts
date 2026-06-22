import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  User as FirebaseUser,
  sendPasswordResetEmail,
} from '@firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, COLLECTIONS } from './firebase';
import { User, UserProfile } from '../types';

// ─── Auth state listener ──────────────────────────────────────────────────────

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
  role: User['role'] = 'user'
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });

  const user: User = {
    id:        credential.user.uid,
    name:      displayName,
    email:     credential.user.email!,
    role,
    createdAt: new Date(),
  };

  // Create user document
  await setDoc(doc(db, COLLECTIONS.users, user.id), {
    ...user,
    createdAt: serverTimestamp(),
  });

  return user;
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return getUserAccount(credential.user);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ─── Google Sign-in (works with expo-auth-session) ───────────────────────────

export async function loginWithGoogleToken(idToken: string): Promise<User> {
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const credential = await signInWithCredential(auth, googleCredential);

  const user = mapFirebaseUser(credential.user);

  // Upsert user doc
  const userRef = doc(db, COLLECTIONS.users, user.id);
  const existing = await getDoc(userRef);
  if (!existing.exists()) {
    await setDoc(userRef, {
      ...user,
      createdAt: serverTimestamp(),
    });
  } else {
    const data = existing.data();
    user.role = data.role ?? 'user';
  }

  return user;
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await setDoc(
    doc(db, COLLECTIONS.profiles, profile.userId),
    {
      ...profile,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.profiles, userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  } as UserProfile;
}

export function subscribeUserProfile(
  userId: string,
  onUpdate: (profile: UserProfile | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, COLLECTIONS.profiles, userId), (snap) => {
    if (!snap.exists()) {
      onUpdate(null);
      return;
    }
    const data = snap.data();
    onUpdate({
      ...data,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
    } as UserProfile);
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────────

export async function getUserAccount(fbUser: FirebaseUser): Promise<User> {
  const mapped = mapFirebaseUser(fbUser);
  const snap = await getDoc(doc(db, COLLECTIONS.users, mapped.id));
  if (!snap.exists()) return mapped;
  const data = snap.data();
  return {
    ...mapped,
    name: data.name ?? mapped.name,
    role: data.role ?? 'user',
    createdAt: data.createdAt?.toDate?.() ?? mapped.createdAt,
  };
}

export function mapFirebaseUser(fbUser: FirebaseUser): User {
  return {
    id:         fbUser.uid,
    name:       fbUser.displayName ?? 'Usuário',
    email:      fbUser.email!,
    role:       'user',
    avatarUrl:  fbUser.photoURL ?? undefined,
    createdAt:  new Date(),
  };
}
