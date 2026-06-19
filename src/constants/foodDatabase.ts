import { FoodItem, FoodNutrition, QuantityUnit } from '../types';

// This file intentionally keeps only generic nutrition helpers.
// Food records live in Firestore/globalFoods.

export function parseQuantityFromText(text: string): {
  quantity: number;
  unit: QuantityUnit;
} {
  const t = text.toLowerCase();

  if (t.includes('litro') || t.includes('litros')) {
    return { quantity: extractNumber(t) || 1, unit: 'litro' };
  }
  if (t.includes('ml') || t.includes('mililitro')) {
    return { quantity: extractNumber(t) || 200, unit: 'mililitro' };
  }
  if (/\b\d+\s*g\b/.test(t) || t.includes('grama')) {
    return { quantity: extractNumber(t) || 100, unit: 'grama' };
  }
  if (t.includes('colher de sopa') || t.includes('colheres de sopa')) {
    return { quantity: extractNumber(t) || 1, unit: 'colher_sopa' };
  }
  if (t.includes('colher de chá') || t.includes('colheres de chá')) {
    return { quantity: extractNumber(t) || 1, unit: 'colher_cha' };
  }
  if (t.includes('garrafa')) {
    return { quantity: (extractNumber(t) || 1) * 500, unit: 'mililitro' };
  }
  if (t.includes('lata')) {
    return { quantity: (extractNumber(t) || 1) * 350, unit: 'mililitro' };
  }
  if (t.includes('copo')) {
    return { quantity: (extractNumber(t) || 1) * 200, unit: 'mililitro' };
  }
  if (t.includes('xícara') || t.includes('xicara')) {
    return { quantity: extractNumber(t) || 1, unit: 'xicara' };
  }
  if (t.includes('concha')) {
    return { quantity: extractNumber(t) || 1, unit: 'concha' };
  }
  if (t.includes('fatia') || t.includes('fatias')) {
    return { quantity: extractNumber(t) || 1, unit: 'fatia' };
  }
  if (t.includes('filé') || t.includes('file')) {
    return { quantity: extractNumber(t) || 1, unit: 'file' };
  }
  if (t.includes('bife')) {
    if (t.includes('pequen')) return { quantity: 1, unit: 'bife_pequeno' };
    if (t.includes('grand') || t.includes('gordo')) return { quantity: 1, unit: 'bife_grande' };
    return { quantity: 1, unit: 'bife_medio' };
  }
  if (t.includes('ovo') || t.includes('ovos') || t.includes('unidade')) {
    return { quantity: extractNumber(t) || 1, unit: 'unidade' };
  }
  if (t.includes('porção') || t.includes('porcao') || t.includes('porco')) {
    return { quantity: extractNumber(t) || 1, unit: 'porcao' };
  }
  return { quantity: 1, unit: 'porcao' };
}

function extractNumber(text: string): number | null {
  const written: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
  };
  for (const [word, num] of Object.entries(written)) {
    if (text.includes(word)) return num;
  }
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export function calculateNutrition(
  food: FoodItem,
  quantity: number,
  unit: QuantityUnit
): FoodNutrition {
  const base = food.nutritionPer[unit] ?? food.nutritionPer[food.defaultUnit];
  if (!base) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  const result: FoodNutrition = {
    kcal: Math.round(base.kcal * quantity),
    protein: Math.round(base.protein * quantity * 10) / 10,
    carbs: Math.round(base.carbs * quantity * 10) / 10,
    fat: Math.round(base.fat * quantity * 10) / 10,
    fiber: Math.round(base.fiber * quantity * 10) / 10,
  };

  (Object.keys(base) as (keyof FoodNutrition)[]).forEach((key) => {
    if (key in result) return;
    const value = base[key];
    if (typeof value === 'number') {
      result[key] = Math.round(value * quantity * 10) / 10 as never;
    }
  });

  if (base.sodium != null) result.sodium = Math.round(base.sodium * quantity);
  if (base.sugar != null) result.sugar = Math.round(base.sugar * quantity * 10) / 10;

  return result;
}

export const UNIT_LABELS: Record<QuantityUnit, string> = {
  colher_sopa: 'colher(es) de sopa',
  colher_cha: 'colher(es) de chá',
  xicara: 'xícara(s)',
  concha: 'concha(s)',
  fatia: 'fatia(s)',
  unidade: 'unidade(s)',
  porcao: 'porção',
  file: 'filé',
  bife_pequeno: 'bife pequeno',
  bife_medio: 'bife médio',
  bife_grande: 'bife grande',
  mililitro: 'ml',
  litro: 'litro(s)',
  grama: 'g',
};
