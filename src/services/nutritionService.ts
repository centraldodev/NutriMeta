import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  DailyLog,
  MealEntry,
  SavedMeal,
  MacroGoals,
  FoodNutrition,
} from '../types';
import {
  sumNutrition,
  getCompletedGoals,
  formatDate,
  generateId,
} from '../utils/nutrition';

// ─── Daily Log ───────────────────────────────────────────────────────────────

function dailyLogId(userId: string, date: string) {
  return `${userId}_${date}`;
}

function sumEntryWater(entries: MealEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.waterMl ?? 0), 0);
}

export async function getDailyLog(
  userId: string,
  date: string
): Promise<DailyLog | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.dailyLogs, dailyLogId(userId, date)));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    ...d,
    updatedAt: d.updatedAt?.toDate() ?? new Date(),
    entries: (d.entries ?? []).map((e: MealEntry) => ({
      ...e,
      addedAt: (e.addedAt as unknown as { toDate(): Date })?.toDate?.() ?? new Date(),
    })),
  } as DailyLog;
}

export async function getRecentDailyLogs(
  userId: string,
  days = 31
): Promise<DailyLog[]> {
  const q = query(
    collection(db, COLLECTIONS.dailyLogs),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      ...d,
      updatedAt: d.updatedAt?.toDate() ?? new Date(),
      entries: (d.entries ?? []).map((e: MealEntry) => ({
        ...e,
        addedAt: (e.addedAt as unknown as { toDate(): Date })?.toDate?.() ?? new Date(),
      })),
    } as DailyLog;
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, days);
}

export function subscribeDailyLog(
  userId: string,
  date: string,
  onUpdate: (log: DailyLog | null) => void
): Unsubscribe {
  const ref = doc(db, COLLECTIONS.dailyLogs, dailyLogId(userId, date));
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) { onUpdate(null); return; }
    const d = snap.data();
    onUpdate({
      ...d,
      updatedAt: d.updatedAt?.toDate() ?? new Date(),
      entries: (d.entries ?? []).map((e: MealEntry) => ({
        ...e,
        addedAt: (e.addedAt as any)?.toDate?.() ?? new Date(),
      })),
    } as DailyLog);
  });
}

export async function addMealEntry(
  userId: string,
  goals: MacroGoals,
  entry: Omit<MealEntry, 'id' | 'userId' | 'addedAt'> & Partial<Pick<MealEntry, 'id' | 'userId' | 'addedAt'>>
): Promise<MealEntry> {
  const date  = formatDate(new Date());
  const logId = dailyLogId(userId, date);
  const ref   = doc(db, COLLECTIONS.dailyLogs, logId);

  const newEntry: MealEntry = {
    ...entry,
    id:      entry.id ?? generateId(),
    userId,
    addedAt: entry.addedAt ? new Date(entry.addedAt) : new Date(),
  };

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);

    if (!existing.exists()) {
      const total = newEntry.nutrition;
      const log: DailyLog = {
        id:              logId,
        userId,
        date,
        entries:         [newEntry],
        totalNutrition:  total,
        waterMl:         newEntry.waterMl ?? 0,
        goals,
        completedGoals:  getCompletedGoals(total, goals),
        updatedAt:       new Date(),
      };
      transaction.set(ref, { ...log, updatedAt: serverTimestamp() });
      return;
    }

    const data = existing.data() as DailyLog;
    const previousEntries = data.entries ?? [];
    const allEntries = previousEntries.some((item) => item.id === newEntry.id)
      ? previousEntries
      : [...previousEntries, newEntry];
    const total = sumNutrition(allEntries);
    const legacyWaterMl = Math.max(0, ((data.waterMl ?? 0) as number) - sumEntryWater(previousEntries));
    const waterMl = legacyWaterMl + sumEntryWater(allEntries);

    transaction.update(ref, {
      entries:        allEntries,
      totalNutrition: total,
      waterMl,
      goals,
      completedGoals: getCompletedGoals(total, goals),
      updatedAt:      serverTimestamp(),
    });
  });

  return newEntry;
}

export async function removeMealEntry(
  userId: string,
  goals: MacroGoals,
  entry: MealEntry
): Promise<void> {
  const date  = formatDate(new Date());
  const ref   = doc(db, COLLECTIONS.dailyLogs, dailyLogId(userId, date));
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data() as DailyLog;
    const previousEntries = data.entries ?? [];
    const allEntries = previousEntries.filter((e) => e.id !== entry.id);
    const total = sumNutrition(allEntries);
    const legacyWaterMl = Math.max(0, ((data.waterMl ?? 0) as number) - sumEntryWater(previousEntries));
    const waterMl = legacyWaterMl + sumEntryWater(allEntries);

    transaction.update(ref, {
      entries:        allEntries,
      totalNutrition: total,
      waterMl,
      goals,
      completedGoals: getCompletedGoals(total, goals),
      updatedAt:      serverTimestamp(),
    });
  });
}

export async function updateMealEntry(
  userId: string,
  goals: MacroGoals,
  entry: MealEntry
): Promise<void> {
  const date = formatDate(new Date(entry.addedAt));
  const ref = doc(db, COLLECTIONS.dailyLogs, dailyLogId(userId, date));
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data() as DailyLog;
    const previousEntries = data.entries ?? [];
    const allEntries = previousEntries.map((item) => item.id === entry.id ? entry : item);
    const total = sumNutrition(allEntries);
    const waterMl = sumEntryWater(allEntries);

    transaction.update(ref, {
      entries: allEntries,
      totalNutrition: total,
      waterMl,
      goals,
      completedGoals: getCompletedGoals(total, goals),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function addWaterIntake(
  userId: string,
  goals: MacroGoals,
  amountMl: number
): Promise<number> {
  const date = formatDate(new Date());
  const logId = dailyLogId(userId, date);
  const ref = doc(db, COLLECTIONS.dailyLogs, logId);
  let nextWaterMl = amountMl;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      const log: DailyLog = {
        id: logId,
        userId,
        date,
        entries: [],
        totalNutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
        waterMl: amountMl,
        goals,
        completedGoals: [],
        updatedAt: new Date(),
      };
      transaction.set(ref, { ...log, updatedAt: serverTimestamp() });
      nextWaterMl = amountMl;
      return;
    }

    const current = (snap.data().waterMl ?? 0) as number;
    nextWaterMl = current + amountMl;
    transaction.update(ref, {
      waterMl: nextWaterMl,
      goals,
      updatedAt: serverTimestamp(),
    });
  });

  return nextWaterMl;
}

// ─── Saved Meals ─────────────────────────────────────────────────────────────

export async function getSavedMeals(userId: string): Promise<SavedMeal[]> {
  const q = query(
    collection(db, COLLECTIONS.savedMeals),
    where('userId', '==', userId),
    orderBy('usageCount', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
    } as SavedMeal;
  }).filter((meal) => !(meal as SavedMeal & { deleted?: boolean }).deleted);
}

export async function saveMeal(
  userId: string,
  name: string,
  emoji: string,
  entries: MealEntry[]
): Promise<SavedMeal> {
  const id    = generateId();
  const total = sumNutrition(entries);
  const meal: SavedMeal = {
    id,
    userId,
    name,
    emoji,
    entries: entries.map(({ id: _id, userId: _uid, addedAt: _at, savedMealId: _smid, ...rest }) => rest),
    totalNutrition: total,
    usageCount: 0,
    createdAt:  new Date(),
    updatedAt:  new Date(),
  };
  await setDoc(doc(db, COLLECTIONS.savedMeals, id), {
    ...meal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return meal;
}

export async function deleteSavedMeal(mealId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.savedMeals, mealId);
  await updateDoc(ref, { deleted: true, updatedAt: serverTimestamp() });
}

export async function incrementMealUsage(mealId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.savedMeals, mealId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    usageCount: (snap.data().usageCount ?? 0) + 1,
    updatedAt:  serverTimestamp(),
  });
}
