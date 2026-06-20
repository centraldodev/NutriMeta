import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyLog, MealEntry } from '../types';
import { dateDaysAgoBrasilia } from '../utils/nutrition';

const DAILY_LOG_PREFIX = '@nutrimeta/dailyLog/';

function key(userId: string, date: string) {
  return `${DAILY_LOG_PREFIX}${userId}/${date}`;
}

function serializeLog(log: DailyLog): DailyLog {
  return {
    ...log,
    updatedAt: log.updatedAt instanceof Date ? log.updatedAt.toISOString() as unknown as Date : log.updatedAt,
    entries: log.entries.map((entry) => ({
      ...entry,
      addedAt: entry.addedAt instanceof Date ? entry.addedAt.toISOString() as unknown as Date : entry.addedAt,
    })),
  };
}

function reviveLog(log: DailyLog): DailyLog {
  return {
    ...log,
    updatedAt: new Date(log.updatedAt),
    entries: (log.entries ?? []).map((entry: MealEntry) => ({
      ...entry,
      addedAt: new Date(entry.addedAt),
    })),
  };
}

export async function saveCachedDailyLog(log: DailyLog): Promise<void> {
  await AsyncStorage.setItem(key(log.userId, log.date), JSON.stringify(serializeLog(log)));
}

export async function getCachedDailyLog(userId: string, date: string): Promise<DailyLog | null> {
  const raw = await AsyncStorage.getItem(key(userId, date));
  if (!raw) return null;
  return reviveLog(JSON.parse(raw) as DailyLog);
}

export async function getCachedRecentDailyLogs(userId: string, days = 31): Promise<DailyLog[]> {
  const logs: DailyLog[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const cached = await getCachedDailyLog(userId, dateDaysAgoBrasilia(offset));
    if (cached) logs.push(cached);
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}
