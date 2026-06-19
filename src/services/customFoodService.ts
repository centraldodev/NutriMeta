import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

import { isFirebaseConfigured } from '../config';
import { FoodItem } from '../types';
import { COLLECTIONS, db } from './firebase';

function normalizeFoodKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function customFoodId(name: string) {
  return `global_${normalizeFoodKey(name) || 'alimento'}`;
}

export async function getCustomFoods(userId: string): Promise<FoodItem[]> {
  if (isFirebaseConfigured && userId !== 'dev_user') {
    const snap = await getDocs(collection(db, COLLECTIONS.globalFoods));
    return snap.docs.map((docSnap) => {
      const { createdBy: _createdBy, updatedAt: _updatedAt, ...food } = docSnap.data();
      return food as FoodItem;
    });
  }
  return [];
}

export async function saveCustomFood(userId: string, food: FoodItem): Promise<FoodItem[]> {
  const foods = await getCustomFoods(userId);
  const normalizedName = normalizeFoodKey(food.name);
  const customFood = {
    ...food,
    id: customFoodId(food.name),
    aliases: Array.from(new Set([food.name.toLowerCase(), ...food.aliases])),
  };
  const next = [
    customFood,
    ...foods.filter((item) => normalizeFoodKey(item.name) !== normalizedName),
  ].slice(0, 80);

  if (isFirebaseConfigured && userId !== 'dev_user') {
    await setDoc(doc(db, COLLECTIONS.globalFoods, customFood.id), {
      ...customFood,
      createdBy: userId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  return next;
}
