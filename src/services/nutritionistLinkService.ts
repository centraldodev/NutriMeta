import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { NutritionistPatientLink, UserProfile } from '../types';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapLink(id: string, data: any): NutritionistPatientLink {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  } as NutritionistPatientLink;
}

async function findUserByEmail(email: string): Promise<{ id: string; name: string; email: string; role?: string } | null> {
  const normalized = normalizeEmail(email);
  let snap = await getDocs(query(collection(db, COLLECTIONS.users), where('email', '==', normalized)));
  if (snap.empty && normalized !== email.trim()) {
    snap = await getDocs(query(collection(db, COLLECTIONS.users), where('email', '==', email.trim())));
  }
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: data.name ?? 'Paciente',
    email: data.email ?? normalized,
    role: data.role ?? 'user',
  };
}

export async function sendNutritionistInvite({
  nutritionistId,
  nutritionistName,
  nutritionistEmail,
  patientEmail,
}: {
  nutritionistId: string;
  nutritionistName: string;
  nutritionistEmail: string;
  patientEmail: string;
}): Promise<NutritionistPatientLink> {
  const patient = await findUserByEmail(patientEmail);
  if (!patient) throw new Error('patient_not_found');
  if (patient.role === 'nutritionist') throw new Error('patient_is_nutritionist');
  if (patient.id === nutritionistId) throw new Error('self_invite');

  const linkId = `${nutritionistId}_${patient.id}`;
  const ref = doc(db, COLLECTIONS.nutritionistLinks, linkId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const current = mapLink(existing.id, existing.data());
    if (current.status === 'accepted') throw new Error('already_accepted');
  }

  const link: NutritionistPatientLink = {
    id: linkId,
    nutritionistId,
    nutritionistName,
    nutritionistEmail,
    patientId: patient.id,
    patientName: patient.name,
    patientEmail: patient.email,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(ref, {
    ...link,
    patientEmail: normalizeEmail(patient.email),
    nutritionistEmail: normalizeEmail(nutritionistEmail),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return link;
}

export function subscribePatientNutritionistInvites(
  patientId: string,
  onUpdate: (links: NutritionistPatientLink[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistLinks),
    where('patientId', '==', patientId),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((docSnap) => mapLink(docSnap.id, docSnap.data()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  });
}

export function subscribePatientAcceptedNutritionistLinks(
  patientId: string,
  onUpdate: (links: NutritionistPatientLink[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistLinks),
    where('patientId', '==', patientId),
    where('status', '==', 'accepted')
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((docSnap) => mapLink(docSnap.id, docSnap.data()))
      .sort((a, b) => a.nutritionistName.localeCompare(b.nutritionistName)));
  });
}

export function subscribeNutritionistAcceptedLinks(
  nutritionistId: string,
  onUpdate: (links: NutritionistPatientLink[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistLinks),
    where('nutritionistId', '==', nutritionistId),
    where('status', '==', 'accepted')
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((docSnap) => mapLink(docSnap.id, docSnap.data()))
      .sort((a, b) => a.patientName.localeCompare(b.patientName)));
  });
}

export async function respondNutritionistInvite(
  linkId: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.nutritionistLinks, linkId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function getLinkedPatientProfiles(nutritionistId: string): Promise<UserProfile[]> {
  const q = query(
    collection(db, COLLECTIONS.nutritionistLinks),
    where('nutritionistId', '==', nutritionistId),
    where('status', '==', 'accepted')
  );
  const snap = await getDocs(q);
  const profiles = await Promise.all(snap.docs.map(async (docSnap) => {
    const link = mapLink(docSnap.id, docSnap.data());
    const profileSnap = await getDoc(doc(db, COLLECTIONS.profiles, link.patientId));
    if (!profileSnap.exists()) return null;
    const data = profileSnap.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    } as UserProfile;
  }));
  return profiles
    .filter(Boolean)
    .sort((a, b) => a!.name.localeCompare(b!.name)) as UserProfile[];
}

export function subscribeLinkedPatientProfiles(
  nutritionistId: string,
  onUpdate: (profiles: UserProfile[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.nutritionistLinks),
    where('nutritionistId', '==', nutritionistId),
    where('status', '==', 'accepted')
  );
  return onSnapshot(q, (snap) => {
    Promise.all(snap.docs.map(async (docSnap) => {
      const link = mapLink(docSnap.id, docSnap.data());
      const profileSnap = await getDoc(doc(db, COLLECTIONS.profiles, link.patientId));
      if (!profileSnap.exists()) return null;
      const data = profileSnap.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      } as UserProfile;
    }))
      .then((profiles) => {
        onUpdate(profiles
          .filter(Boolean)
          .sort((a, b) => a!.name.localeCompare(b!.name)) as UserProfile[]);
      })
      .catch((error) => onError?.(error));
  }, onError);
}
