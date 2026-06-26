import { create } from 'zustand';
import {
  User,
  UserProfile,
  DailyLog,
  MacroGoals,
  SavedMeal,
  Group,
  GroupMemberStats,
  GroupNotification,
  MealEntry,
} from '../types';
import { formatDate, getCompletedGoals, sumNutrition } from '../utils/nutrition';

// ─── Auth Slice ───────────────────────────────────────────────────────────────

interface AuthSlice {
  user:            User | null;
  profile:         UserProfile | null;
  authLoading:     boolean;
  isAuthenticated: boolean;
  setUser:         (user: User | null) => void;
  setProfile:      (profile: UserProfile | null) => void;
  setAuthLoading:  (v: boolean) => void;
  clearAuth:       () => void;
}

// ─── Nutrition Slice ──────────────────────────────────────────────────────────

interface NutritionSlice {
  todayLog:     DailyLog | null;
  goals:        MacroGoals | null;
  savedMeals:   SavedMeal[];
  nutritionLoading: boolean;
  setTodayLog:  (log: DailyLog | null) => void;
  setGoals:     (goals: MacroGoals) => void;
  setSavedMeals:(meals: SavedMeal[]) => void;
  addEntry:     (entry: MealEntry) => void;
  updateEntry:  (entry: MealEntry) => void;
  removeEntry:  (entryId: string) => void;
  addWater:     (amountMl: number) => void;
  setNutritionLoading: (v: boolean) => void;
}

// ─── Group Slice ──────────────────────────────────────────────────────────────

interface GroupSlice {
  groups:        Group[];
  memberStats:   GroupMemberStats[];
  notifications: GroupNotification[];
  unreadCount:   number;
  groupLoading: boolean;
  setGroups:     (groups: Group[]) => void;
  setMemberStats:(stats: GroupMemberStats[]) => void;
  setNotifications: (notifs: GroupNotification[]) => void;
  markRead:      (ids: string[]) => void;
  setGroupLoading: (v: boolean) => void;
}

// ─── Combined Store ───────────────────────────────────────────────────────────

type AppStore = AuthSlice & NutritionSlice & GroupSlice;

export const useStore = create<AppStore>((set) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  user:            null,
  profile:         null,
  authLoading:     true,
  isAuthenticated: false,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, authLoading: false }),

  setProfile: (profile) => set({ profile }),

  setAuthLoading: (v) => set({ authLoading: v }),

  clearAuth: () =>
    set({
      user: null, profile: null,
      isAuthenticated: false, authLoading: false,
      todayLog: null, goals: null, savedMeals: [],
      groups: [], memberStats: [], notifications: [], unreadCount: 0,
      nutritionLoading: false, groupLoading: false,
    }),

  // ── Nutrition ─────────────────────────────────────────────────────────────
  todayLog:    null,
  goals:       null,
  savedMeals:  [],
  nutritionLoading: false,

  setTodayLog: (log) =>
    set((state) => {
      if (!log || !state.todayLog || state.todayLog.id !== log.id) {
        return { todayLog: log };
      }

      const incomingUpdatedAt = new Date(log.updatedAt).getTime();
      const currentUpdatedAt = new Date(state.todayLog.updatedAt).getTime();
      if (Number.isFinite(incomingUpdatedAt) && Number.isFinite(currentUpdatedAt) && incomingUpdatedAt < currentUpdatedAt) {
        return {};
      }

      return { todayLog: log };
    }),

  setGoals: (goals) => set({ goals }),

  setSavedMeals: (meals) => set({ savedMeals: meals }),

  addEntry: (entry) =>
    set((state) => {
      if (state.todayLog?.entries.some((item) => item.id === entry.id)) {
        return {};
      }

      const entries = [...(state.todayLog?.entries ?? []), entry];
      const totalNutrition = sumNutrition(entries);
      const completedGoals = state.goals
        ? getCompletedGoals(totalNutrition, state.goals)
        : [];

      if (!state.todayLog) {
        const date = formatDate(new Date());
        return {
          todayLog: {
            id: `${entry.userId}_${date}`,
            userId: entry.userId,
            date,
            entries,
            totalNutrition,
            waterMl: entry.waterMl ?? 0,
            goals: state.goals ?? {
              kcal: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              fiber: 0,
              water: 0,
              sugar: 0,
              sodium: 0,
            },
            completedGoals,
            updatedAt: new Date(),
          },
        };
      }

      return {
        todayLog: {
          ...state.todayLog,
          entries,
          totalNutrition,
          waterMl: (state.todayLog.waterMl ?? 0) + (entry.waterMl ?? 0),
          completedGoals,
          updatedAt: new Date(),
        },
      };
    }),

  updateEntry: (entry) =>
    set((state) => {
      if (!state.todayLog?.entries.some((item) => item.id === entry.id)) return {};
      const entries = state.todayLog.entries.map((item) => item.id === entry.id ? entry : item);
      const totalNutrition = sumNutrition(entries);
      return {
        todayLog: {
          ...state.todayLog,
          entries,
          totalNutrition,
          waterMl: entries.reduce((sum, item) => sum + (item.waterMl ?? 0), 0),
          completedGoals: state.goals ? getCompletedGoals(totalNutrition, state.goals) : [],
          updatedAt: new Date(),
        },
      };
    }),

  removeEntry: (entryId) =>
    set((state) => {
      if (!state.todayLog) return {};
      const removedEntry = state.todayLog.entries.find((e) => e.id === entryId);
      const entries = state.todayLog.entries.filter((e) => e.id !== entryId);
      const totalNutrition = sumNutrition(entries);
      return {
        todayLog: {
          ...state.todayLog,
          entries,
          totalNutrition,
          waterMl: Math.max(0, (state.todayLog.waterMl ?? 0) - (removedEntry?.waterMl ?? 0)),
          completedGoals: state.goals
            ? getCompletedGoals(totalNutrition, state.goals)
            : [],
          updatedAt: new Date(),
        },
      };
    }),

  addWater: (amountMl) =>
    set((state) => {
      const current = state.todayLog;
      const date = formatDate(new Date());
      const goals = state.goals ?? {
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        water: 0,
        sugar: 0,
        sodium: 0,
      };
      if (!current) {
        return {
          todayLog: {
            id: `${state.user?.id ?? 'local'}_${date}`,
            userId: state.user?.id ?? 'local',
            date,
            entries: [],
            totalNutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
            waterMl: amountMl,
            goals,
            completedGoals: [],
            updatedAt: new Date(),
          },
        };
      }
      return {
        todayLog: {
          ...current,
          waterMl: (current.waterMl ?? 0) + amountMl,
          updatedAt: new Date(),
        },
      };
    }),

  setNutritionLoading: (v) => set({ nutritionLoading: v }),

  // ── Groups ────────────────────────────────────────────────────────────────
  groups:        [],
  memberStats:   [],
  notifications: [],
  unreadCount:   0,
  groupLoading:   false,

  setGroups: (groups) => set({ groups }),

  setMemberStats: (stats) => set({ memberStats: stats }),

  setNotifications: (notifs) =>
    set({
      notifications: notifs,
      unreadCount:   notifs.filter((n) => !n.read).length,
    }),

  markRead: (ids) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        ids.includes(n.id) ? { ...n, read: true } : n
      ),
      unreadCount: state.notifications.filter(
        (n) => !n.read && !ids.includes(n.id)
      ).length,
    })),

  setGroupLoading: (v) => set({ groupLoading: v }),
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectUser         = (s: AppStore) => s.user;
export const selectProfile      = (s: AppStore) => s.profile;
export const selectTodayLog     = (s: AppStore) => s.todayLog;
export const selectGoals        = (s: AppStore) => s.goals;
export const selectSavedMeals   = (s: AppStore) => s.savedMeals;
export const selectGroups       = (s: AppStore) => s.groups;
export const selectMemberStats  = (s: AppStore) => s.memberStats;
export const selectNotifications= (s: AppStore) => s.notifications;
export const selectUnreadCount  = (s: AppStore) => s.unreadCount;
