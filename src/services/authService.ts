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
  runTransaction,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, COLLECTIONS } from './firebase';
import { User, UserProfile } from '../types';

const NICKNAME_MIN_LENGTH = 3;
const NICKNAME_MAX_LENGTH = 20;

export function normalizeNickname(value: string): string {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '');
}

export function validateNickname(value: string): string | null {
  const nickname = normalizeNickname(value);
  if (nickname.length < NICKNAME_MIN_LENGTH) return 'O nickname precisa ter pelo menos 3 caracteres.';
  if (nickname.length > NICKNAME_MAX_LENGTH) return 'O nickname pode ter no máximo 20 caracteres.';
  if (!/^[a-z0-9]/.test(nickname) || !/[a-z0-9]$/.test(nickname)) {
    return 'Use letras ou números no início e no fim do nickname.';
  }
  return null;
}

function randomNicknameSeed(): string {
  return `nutri${Math.random().toString(36).slice(2, 8)}`;
}

async function reserveNickname(
  userId: string,
  desiredNickname: string,
  displayName: string,
  previousNickname?: string
): Promise<string> {
  const nickname = normalizeNickname(desiredNickname);
  const validationError = validateNickname(nickname);
  if (validationError) throw new Error('invalid_nickname');

  const nickRef = doc(db, COLLECTIONS.nicknames, nickname);
  const userRef = doc(db, COLLECTIONS.users, userId);
  const profileRef = doc(db, COLLECTIONS.profiles, userId);
  const previous = previousNickname ? normalizeNickname(previousNickname) : undefined;
  const previousRef = previous && previous !== nickname
    ? doc(db, COLLECTIONS.nicknames, previous)
    : null;

  await runTransaction(db, async (transaction) => {
    const nickSnap = await transaction.get(nickRef);
    if (nickSnap.exists() && nickSnap.data().userId !== userId) {
      throw new Error('nickname_taken');
    }

    if (previousRef) {
      const previousSnap = await transaction.get(previousRef);
      if (previousSnap.exists() && previousSnap.data().userId === userId) {
        transaction.delete(previousRef);
      }
    }

    transaction.set(nickRef, {
      userId,
      nickname,
      displayName,
      searchable: nickname,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(userRef, {
      nickname,
      name: displayName,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(profileRef, {
      nickname,
      name: displayName,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  return nickname;
}

async function createUniqueRandomNickname(userId: string, displayName: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await reserveNickname(userId, randomNicknameSeed(), displayName);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'nickname_taken') throw error;
    }
  }
  return reserveNickname(userId, `nutri${Date.now().toString(36).slice(-8)}`, displayName);
}

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
  const nickname = await createUniqueRandomNickname(credential.user.uid, displayName);

  const user: User = {
    id:        credential.user.uid,
    name:      displayName,
    email:     credential.user.email!,
    nickname,
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
    user.nickname = await createUniqueRandomNickname(user.id, user.name);
    await setDoc(userRef, {
      ...user,
      createdAt: serverTimestamp(),
    }, { merge: true });
  } else {
    const data = existing.data();
    user.role = data.role ?? 'user';
    user.nickname = data.nickname ?? await createUniqueRandomNickname(user.id, user.name);
  }

  return user;
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export async function saveUserProfile(profile: UserProfile): Promise<string> {
  const currentProfile = await getDoc(doc(db, COLLECTIONS.profiles, profile.userId));
  const currentUser = await getDoc(doc(db, COLLECTIONS.users, profile.userId));
  const previousNickname = (
    currentProfile.data()?.nickname ??
    currentUser.data()?.nickname ??
    ''
  ) as string;
  const nickname = profile.nickname
    ? await reserveNickname(profile.userId, profile.nickname, profile.name, previousNickname)
    : await createUniqueRandomNickname(profile.userId, profile.name);

  await setDoc(
    doc(db, COLLECTIONS.profiles, profile.userId),
    {
      ...profile,
      nickname,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await setDoc(
    doc(db, COLLECTIONS.users, profile.userId),
    {
      name: profile.name,
      nickname,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return nickname;
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
    nickname: data.nickname ?? mapped.nickname,
    role: data.role ?? 'user',
    createdAt: data.createdAt?.toDate?.() ?? mapped.createdAt,
  };
}

export function mapFirebaseUser(fbUser: FirebaseUser): User {
  return {
    id:         fbUser.uid,
    name:       fbUser.displayName ?? 'Usuário',
    email:      fbUser.email!,
    nickname:   undefined,
    role:       'user',
    avatarUrl:  fbUser.photoURL ?? undefined,
    createdAt:  new Date(),
  };
}
