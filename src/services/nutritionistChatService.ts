import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { NutritionistChatMessage, NutritionistPatientLink } from '../types';

function mapMessage(id: string, data: any): NutritionistChatMessage {
  return {
    id,
    ...data,
    readBy: data.readBy ?? [],
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
  } as NutritionistChatMessage;
}

export function subscribeChatMessages(
  linkId: string,
  onUpdate: (messages: NutritionistChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistMessages),
    where('linkId', '==', linkId)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs
      .map((docSnap) => mapMessage(docSnap.id, docSnap.data()))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  });
}

export async function sendChatMessage({
  link,
  senderId,
  senderName,
  text,
}: {
  link: NutritionistPatientLink;
  senderId: string;
  senderName: string;
  text: string;
}): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) return;
  const receiverId = senderId === link.nutritionistId ? link.patientId : link.nutritionistId;
  await addDoc(collection(db, COLLECTIONS.nutritionistMessages), {
    linkId: link.id,
    nutritionistId: link.nutritionistId,
    patientId: link.patientId,
    senderId,
    senderName,
    receiverId,
    text: cleanText.slice(0, 800),
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });

  // Push notification hook:
  // A Cloud Function can listen to this collection and send an Expo push
  // notification to receiverId using a stored device token.
}

export async function markChatMessagesRead(linkId: string, userId: string): Promise<void> {
  const q = query(
    collection(db, COLLECTIONS.nutritionistMessages),
    where('linkId', '==', linkId),
    where('receiverId', '==', userId)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((docSnap) => {
    const data = docSnap.data();
    if ((data.readBy ?? []).includes(userId)) return Promise.resolve();
    return updateDoc(doc(db, COLLECTIONS.nutritionistMessages, docSnap.id), {
      readBy: arrayUnion(userId),
    });
  }));
}

export function subscribeUnreadChatCount(
  userId: string,
  onUpdate: (count: number) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistMessages),
    where('receiverId', '==', userId)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.filter((docSnap) => !((docSnap.data().readBy ?? []) as string[]).includes(userId)).length);
  });
}

export function subscribeUnreadChatCountByLink(
  userId: string,
  onUpdate: (counts: Record<string, number>) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistMessages),
    where('receiverId', '==', userId)
  );
  return onSnapshot(q, (snap) => {
    const counts: Record<string, number> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (((data.readBy ?? []) as string[]).includes(userId)) return;
      counts[data.linkId] = (counts[data.linkId] ?? 0) + 1;
    });
    onUpdate(counts);
  });
}
