import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

import { isFirebaseConfigured } from '../config';
import { FoodItem } from '../types';
import { COLLECTIONS, db } from './firebase';
import { isLocalFood, LOCAL_FOODS } from './localFoodDatabase';

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
  const localFoods = [...LOCAL_FOODS];

  if (isFirebaseConfigured && userId !== 'dev_user') {
    const snap = await getDocs(collection(db, COLLECTIONS.globalFoods));
    const firebaseFoods = snap.docs.flatMap((docSnap) => {
      const { createdBy, updatedAt: _updatedAt, ...food } = docSnap.data();
      return createdBy ? [food as FoodItem] : [];
    });
    return mergeFoods(localFoods, firebaseFoods);
  }
  return localFoods;
}

export async function saveCustomFood(userId: string, food: FoodItem): Promise<FoodItem[]> {
  const foods = await getCustomFoods(userId);
  const normalizedName = normalizeFoodKey(food.name);
  const customFood = {
    ...food,
    id: customFoodId(food.name),
    source: food.source ?? 'user',
    aliases: Array.from(new Set([food.name.toLowerCase(), ...food.aliases])),
  };
  const next = [
    customFood,
    ...foods.filter((item) => normalizeFoodKey(item.name) !== normalizedName),
  ];

  if (isFirebaseConfigured && userId !== 'dev_user' && !isLocalFood(food)) {
    await setDoc(doc(db, COLLECTIONS.globalFoods, customFood.id), {
      ...customFood,
      createdBy: userId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  return next;
}

function mergeFoods(localFoods: FoodItem[], firebaseFoods: FoodItem[]) {
  const foodsByName = new Map<string, FoodItem>();
  localFoods.forEach((food) => {
    foodsByName.set(normalizeFoodKey(food.name), food);
  });
  firebaseFoods.forEach((food) => {
    foodsByName.set(normalizeFoodKey(food.name), food);
  });
  return Array.from(foodsByName.values());
}
