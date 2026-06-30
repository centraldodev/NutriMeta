import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { COLLECTIONS, db } from './firebase';

export type FoodPlanMealStatus = {
  id: string;
  userId: string;
  date: string;
  mealKey: string;
  status: 'pending' | 'skipped' | 'completed';
  selectedOptionId?: string;
  updatedAt: Date;
};

function readDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function mealStatusId(userId: string, date: string, mealKey: string) {
  let hash = 0;
  for (let i = 0; i < mealKey.length; i += 1) {
    hash = Math.imul(31, hash) + mealKey.charCodeAt(i);
  }
  return `${userId}_${date}_${Math.abs(hash).toString(36)}`;
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefined(item)) as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)])
    ) as T;
  }
  return value;
}

export function subscribeFoodPlanMealStatuses(
  userId: string,
  date: string,
  onUpdate: (statuses: FoodPlanMealStatus[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.foodPlanMealStatuses),
    where('userId', '==', userId),
    where('date', '==', date)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        updatedAt: readDate(data.updatedAt),
      } as FoodPlanMealStatus;
    }));
  });
}

export async function setFoodPlanMealStatus({
  userId,
  date,
  mealKey,
  status,
  selectedOptionId,
}: {
  userId: string;
  date: string;
  mealKey: string;
  status: FoodPlanMealStatus['status'];
  selectedOptionId?: string;
}): Promise<void> {
  const id = mealStatusId(userId, date, mealKey);
  await setDoc(doc(db, COLLECTIONS.foodPlanMealStatuses, id), withoutUndefined({
    id,
    userId,
    date,
    mealKey,
    status,
    selectedOptionId,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}
