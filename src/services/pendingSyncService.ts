import AsyncStorage from '@react-native-async-storage/async-storage';

import { MacroGoals, MealEntry } from '../types';
import { generateId } from '../utils/nutrition';
import { addMealEntry } from './nutritionService';

const PENDING_MEAL_ENTRIES_KEY = '@nutrimeta/pendingMealEntries/v1';

type MealEntryPayload = Omit<MealEntry, 'id' | 'userId' | 'addedAt'>;

export type PendingMealEntrySync = {
  id: string;
  userId: string;
  goals: MacroGoals;
  entry: MealEntry;
  createdAt: Date;
  lastError?: string;
};

type PendingSyncListener = (items: PendingMealEntrySync[]) => void;

const listeners = new Set<PendingSyncListener>();

function serializePending(item: PendingMealEntrySync) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    entry: {
      ...item.entry,
      addedAt: item.entry.addedAt.toISOString(),
    },
  };
}

function revivePending(raw: any): PendingMealEntrySync {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    entry: {
      ...raw.entry,
      addedAt: new Date(raw.entry.addedAt),
    },
  };
}

async function readPendingMealEntries(): Promise<PendingMealEntrySync[]> {
  const raw = await AsyncStorage.getItem(PENDING_MEAL_ENTRIES_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as any[];
  return parsed.map(revivePending);
}

async function writePendingMealEntries(items: PendingMealEntrySync[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_MEAL_ENTRIES_KEY, JSON.stringify(items.map(serializePending)));
  listeners.forEach((listener) => listener(items));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Erro desconhecido');
}

export async function getPendingMealEntries(userId?: string): Promise<PendingMealEntrySync[]> {
  const items = await readPendingMealEntries();
  return userId ? items.filter((item) => item.userId === userId) : items;
}

export async function getPendingMealEntryCount(userId?: string): Promise<number> {
  return (await getPendingMealEntries(userId)).length;
}

export function subscribePendingMealEntries(
  listener: PendingSyncListener,
  userId?: string
): () => void {
  const wrapped = userId
    ? (items: PendingMealEntrySync[]) => listener(items.filter((item) => item.userId === userId))
    : listener;
  listeners.add(wrapped);
  readPendingMealEntries()
    .then(wrapped)
    .catch((error) => console.warn('Failed to read pending meal entries', error));
  return () => {
    listeners.delete(wrapped);
  };
}

export async function enqueuePendingMealEntry({
  userId,
  goals,
  entry,
  error,
}: {
  userId: string;
  goals: MacroGoals;
  entry: MealEntry;
  error?: unknown;
}): Promise<void> {
  const items = await readPendingMealEntries();
  const pending: PendingMealEntrySync = {
    id: `meal_${entry.id}`,
    userId,
    goals,
    entry,
    createdAt: new Date(),
    lastError: error ? errorMessage(error) : undefined,
  };
  const nextItems = [...items.filter((item) => item.id !== pending.id), pending];
  await writePendingMealEntries(nextItems);
}

export async function removePendingMealEntryByEntryId(userId: string, entryId: string): Promise<boolean> {
  const items = await readPendingMealEntries();
  const nextItems = items.filter((item) => !(item.userId === userId && item.entry.id === entryId));
  if (nextItems.length !== items.length) {
    await writePendingMealEntries(nextItems);
    return true;
  }
  return false;
}

export async function saveMealEntryOrQueue({
  userId,
  goals,
  payload,
}: {
  userId: string;
  goals: MacroGoals;
  payload: MealEntryPayload;
}): Promise<{ entry: MealEntry; queued: boolean; error?: unknown }> {
  try {
    const entry = await addMealEntry(userId, goals, payload);
    return { entry, queued: false };
  } catch (error) {
    const entry: MealEntry = {
      ...payload,
      id: generateId(),
      userId,
      addedAt: new Date(),
    };
    await enqueuePendingMealEntry({ userId, goals, entry, error });
    return { entry, queued: true, error };
  }
}

export async function syncPendingMealEntries(userId?: string): Promise<number> {
  const items = await readPendingMealEntries();
  const candidates = userId ? items.filter((item) => item.userId === userId) : items;
  let syncedCount = 0;
  let currentItems = items;

  for (const pending of candidates) {
    try {
      await addMealEntry(pending.userId, pending.goals, pending.entry);
      syncedCount += 1;
      currentItems = currentItems.filter((item) => item.id !== pending.id);
      await writePendingMealEntries(currentItems);
    } catch (error) {
      currentItems = currentItems.map((item) => (
        item.id === pending.id ? { ...item, lastError: errorMessage(error) } : item
      ));
      await writePendingMealEntries(currentItems);
      break;
    }
  }

  return syncedCount;
}
