import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { DailyLog, FoodPlan, UserProfile } from '../types';
import { formatDate, generateId } from '../utils/nutrition';

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

export async function getPatientRecentLogs(userId: string, days = 31): Promise<DailyLog[]> {
  const firstAllowedDate = new Date();
  firstAllowedDate.setDate(firstAllowedDate.getDate() - Math.max(0, days - 1));
  const cutoff = formatDate(firstAllowedDate);
  const q = query(
    collection(db, COLLECTIONS.dailyLogs),
    where('userId', '==', userId)
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
  })
    .filter((log) => log.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);
}

function mapFoodPlan(id: string, data: any): FoodPlan {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  } as FoodPlan;
}

export async function updatePatientProfile(profile: UserProfile): Promise<void> {
  await setDoc(
    doc(db, COLLECTIONS.profiles, profile.userId),
    {
      ...profile,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createFoodPlan(
  plan: Omit<FoodPlan, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FoodPlan> {
  const id = generateId();
  const nextPlan: FoodPlan = {
    ...plan,
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(doc(db, COLLECTIONS.foodPlans, id), {
    ...nextPlan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return nextPlan;
}

export function subscribePatientFoodPlans(
  patientId: string,
  onUpdate: (plans: FoodPlan[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.foodPlans),
    where('patientId', '==', patientId)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs
      .map((docSnap) => mapFoodPlan(docSnap.id, docSnap.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  });
}
