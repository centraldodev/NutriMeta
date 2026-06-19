import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { DailyLog, UserProfile } from '../types';

export async function getAllPatientProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.profiles));
  return snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      } as UserProfile;
    })
    .filter((profile) => profile.onboardingComplete)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPatientRecentLogs(userId: string, days = 14): Promise<DailyLog[]> {
  const q = query(
    collection(db, COLLECTIONS.dailyLogs),
    where('userId', '==', userId),
    orderBy('date', 'desc'),
    limit(days)
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      entries: (data.entries ?? []).map((entry: any) => ({
        ...entry,
        addedAt: entry.addedAt?.toDate?.() ?? new Date(),
      })),
    } as DailyLog;
  });
}
