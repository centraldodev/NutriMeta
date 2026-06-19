import AsyncStorage from '@react-native-async-storage/async-storage';

import { MacroGoals, User, UserProfile } from '../types';

const SESSION_KEY = '@nutrimeta/session';

type StoredSession = {
  user: User | null;
  profile: UserProfile | null;
  goals: MacroGoals | null;
};

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function reviveProfile(profile: UserProfile | null): UserProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  };
}

function reviveUser(user: User | null): User | null {
  if (!user) return null;
  return {
    ...user,
    createdAt: new Date(user.createdAt),
  };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...session,
      user: session.user
        ? { ...session.user, createdAt: serializeDate(session.user.createdAt) }
        : null,
      profile: session.profile
        ? {
            ...session.profile,
            createdAt: serializeDate(session.profile.createdAt),
            updatedAt: serializeDate(session.profile.updatedAt),
          }
        : null,
    })
  );
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredSession;
  return {
    user: reviveUser(parsed.user),
    profile: reviveProfile(parsed.profile),
    goals: parsed.goals,
  };
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
