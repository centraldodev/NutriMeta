import {
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { getRecentDailyLogs } from './nutritionService';
import {
  Group,
  CommunityComment,
  CommunityPrivacy,
  GroupMemberStats,
  GroupNotification,
  MacroGoals,
  FoodNutrition,
} from '../types';
import {
  calcRankingPoints,
  calcGoalProgressPercent,
  getCompletedGoals,
  formatDate,
  generateId,
  getInitials,
} from '../utils/nutrition';
import { AvatarColors } from '../constants/theme';

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function createGroup(
  ownerId: string,
  name: string,
  emoji: string
): Promise<Group> {
  const id          = generateId();
  const inviteCode  = Math.random().toString(36).slice(2, 8).toUpperCase();
  const group: Group = {
    id,
    name,
    emoji,
    ownerId,
    memberIds:  [ownerId],
    inviteCode,
    createdAt:  new Date(),
  };
  await setDoc(doc(db, COLLECTIONS.groups, id), {
    ...group,
    createdAt: serverTimestamp(),
  });
  return group;
}

export async function joinGroupByCode(
  userId: string,
  inviteCode: string
): Promise<Group> {
  const q    = query(
    collection(db, COLLECTIONS.groups),
    where('inviteCode', '==', inviteCode.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Código de convite inválido');

  const groupDoc = snap.docs[0];
  const group    = { id: groupDoc.id, ...groupDoc.data() } as Group;

  if (group.memberIds.includes(userId)) return group;

  await updateDoc(doc(db, COLLECTIONS.groups, group.id), {
    memberIds: arrayUnion(userId),
  });

  return { ...group, memberIds: [...group.memberIds, userId] };
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.groups, groupId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Group;
}

export async function getUserGroups(userId: string): Promise<Group[]> {
  const q    = query(
    collection(db, COLLECTIONS.groups),
    where('memberIds', 'array-contains', userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group));
}

// ─── Group Stats (ranking) ────────────────────────────────────────────────────

function isConsistentDay(totalNutrition: FoodNutrition, goals: MacroGoals): boolean {
  const completed = getCompletedGoals(totalNutrition, goals);
  const kcalRatio = goals.kcal > 0 ? totalNutrition.kcal / goals.kcal : 0;
  return kcalRatio >= 0.85 && kcalRatio <= 1.1 && completed.length >= 3;
}

async function getCurrentStreakDays(userId: string, fallbackGoals: MacroGoals): Promise<number> {
  try {
    const logs = await getRecentDailyLogs(userId, 14);
    let streak = 0;
    const byDate = new Map(logs.map((log) => [log.date, log]));

    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const log = byDate.get(formatDate(date));
      if (!log) break;
      if (!isConsistentDay(log.totalNutrition, log.goals ?? fallbackGoals)) break;
      streak += 1;
    }
    return streak;
  } catch {
    return 0;
  }
}

export async function upsertMemberStats(
  userId: string,
  userName: string,
  groupId: string,
  totalNutrition: FoodNutrition,
  goals: MacroGoals,
  privacy?: CommunityPrivacy
): Promise<void> {
  const date    = formatDate(new Date());
  const statId  = `${groupId}_${userId}_${date}`;
  const completed = getCompletedGoals(totalNutrition, goals);
  const points    = calcRankingPoints(totalNutrition, goals, completed);
  const streakDays = await getCurrentStreakDays(userId, goals);
  const colorIdx  = Math.abs(userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AvatarColors.length;

  await setDoc(
    doc(db, COLLECTIONS.groupStats, statId),
    {
      userId,
      groupId,
      name:           userName,
      avatarInitials: getInitials(userName),
      avatarColor:    AvatarColors[colorIdx].bg,
      totalNutrition,
      goals,
      completedGoals: completed,
      streakDays,
      privacy,
      points,
      date,
      updatedAt:      serverTimestamp(),
    },
    { merge: true }
  );

  // Fire notifications for newly completed goals
  await checkAndFireNotifications(userId, userName, groupId, completed, date);
}

export async function addCommunityComment(
  groupId: string,
  targetUserId: string,
  authorId: string,
  authorName: string,
  message: string
): Promise<void> {
  await addDoc(collection(db, COLLECTIONS.communityComments), {
    groupId,
    targetUserId,
    authorId,
    authorName,
    message: message.trim().slice(0, 240),
    createdAt: serverTimestamp(),
  });
}

export function subscribeCommunityComments(
  groupId: string,
  onUpdate: (comments: CommunityComment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.communityComments),
    where('groupId', '==', groupId)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() ?? new Date(),
      } as CommunityComment;
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80));
  });
}

export function subscribeGroupRanking(
  groupId: string,
  onUpdate: (stats: GroupMemberStats[]) => void
): Unsubscribe {
  const date = formatDate(new Date());
  const q    = query(
    collection(db, COLLECTIONS.groupStats),
    where('groupId', '==', groupId),
    where('date',    '==', date)
  );
  return onSnapshot(q, (snap) => {
    const stats = snap.docs
      .map((d) => d.data() as GroupMemberStats)
      .sort(
        (a, b) =>
          calcGoalProgressPercent(b.totalNutrition, b.goals) -
          calcGoalProgressPercent(a.totalNutrition, a.goals)
      )
      .map((s, i) => ({ ...s, rank: i + 1 }));
    onUpdate(stats);
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  protein: 'proteína 💪',
  carbs:   'carboidratos 🌾',
  fat:     'gorduras 🫒',
  fiber:   'fibras 🥦',
  kcal:    'calorias ⚡',
};

async function checkAndFireNotifications(
  userId: string,
  userName: string,
  groupId: string,
  completedGoals: string[],
  date: string
): Promise<void> {
  for (const macro of completedGoals) {
    const notifId = `${groupId}_${userId}_${date}_${macro}`;
    const ref     = doc(db, COLLECTIONS.notifications, notifId);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;   // already sent

    const notif: Omit<GroupNotification, 'read'> = {
      id:       notifId,
      groupId,
      userId,
      userName,
      type:     'goal_hit',
      macro:    macro as any,
      message:  `🎉 ${userName} bateu a meta de ${GOAL_LABELS[macro] ?? macro} hoje!`,
      createdAt: new Date(),
    };

    await setDoc(ref, {
      ...notif,
      read:      false,
      createdAt: serverTimestamp(),
    });
  }
}

export function subscribeGroupNotifications(
  groupId: string,
  onUpdate: (notifs: GroupNotification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.notifications),
    where('groupId', '==', groupId)
  );
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate() ?? new Date(),
        } as GroupNotification;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);
    onUpdate(notifs);
  });
}

export async function markNotificationsRead(
  notifIds: string[]
): Promise<void> {
  await Promise.all(
    notifIds.map((id) =>
      updateDoc(doc(db, COLLECTIONS.notifications, id), { read: true })
    )
  );
}
