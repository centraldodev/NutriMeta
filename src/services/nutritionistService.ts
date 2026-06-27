import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { DailyLog, FoodPlan, GroupNotification, UserProfile } from '../types';
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

async function notifyPatientFoodPlan(plan: FoodPlan, type: 'food_plan_created' | 'food_plan_updated'): Promise<void> {
  const id = `${type}_${plan.patientId}_${plan.id}_${Date.now()}`;
  const notification: GroupNotification = {
    id,
    userId: plan.nutritionistId,
    userName: plan.nutritionistName,
    targetUserIds: [plan.patientId],
    type,
    message: type === 'food_plan_created'
      ? `${plan.nutritionistName} criou um novo plano alimentar: ${plan.title}.`
      : `${plan.nutritionistName} atualizou seu plano alimentar: ${plan.title}.`,
    createdAt: new Date(),
    read: false,
  };

  await setDoc(doc(db, COLLECTIONS.notifications, id), withoutUndefined({
    ...notification,
    createdAt: serverTimestamp(),
  }));
}

export async function updatePatientProfile(profile: UserProfile): Promise<void> {
  await setDoc(
    doc(db, COLLECTIONS.profiles, profile.userId),
    {
      age: profile.age,
      weight: profile.weight,
      height: profile.height,
      sex: profile.sex,
      goal: profile.goal,
      activityLevel: profile.activityLevel,
      onboardingComplete: profile.onboardingComplete,
      groupIds: profile.groupIds,
      macroGoals: profile.macroGoals,
      communityPrivacy: profile.communityPrivacy,
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

  await setDoc(doc(db, COLLECTIONS.foodPlans, id), withoutUndefined({
    ...nextPlan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  try {
    await notifyPatientFoodPlan(nextPlan, 'food_plan_created');
  } catch (error) {
    console.warn('Failed to notify patient about new food plan', error);
  }

  return nextPlan;
}

export async function updateFoodPlan(
  plan: FoodPlan
): Promise<FoodPlan> {
  const nextPlan: FoodPlan = {
    ...plan,
    updatedAt: new Date(),
  };

  await updateDoc(doc(db, COLLECTIONS.foodPlans, plan.id), withoutUndefined({
    ...nextPlan,
    updatedAt: serverTimestamp(),
  }));

  try {
    await notifyPatientFoodPlan(nextPlan, 'food_plan_updated');
  } catch (error) {
    console.warn('Failed to notify patient about food plan update', error);
  }

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
