import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { FoodItem, FoodNutrition, FoodPlanMeal, MacroGoals, ShoppingListItem, UserProfile } from '../types';
import { customFoodId, saveCustomFood } from './customFoodService';
import { sumNutrition } from '../utils/nutrition';

export type FoodPlanAiAnalysis = {
  meals: FoodPlanMeal[];
  shoppingList: ShoppingListItem[];
  totalNutrition: FoodNutrition;
};

const nutritionSchema = Schema.object({
  properties: {
    kcal: Schema.number(),
    protein: Schema.number(),
    carbs: Schema.number(),
    fat: Schema.number(),
    fiber: Schema.number(),
    sodium: Schema.number(),
    sugar: Schema.number(),
    calcium: Schema.number(),
    iron: Schema.number(),
    potassium: Schema.number(),
    magnesium: Schema.number(),
    zinc: Schema.number(),
    vitaminA: Schema.number(),
    vitaminC: Schema.number(),
    vitaminD: Schema.number(),
    vitaminE: Schema.number(),
    vitaminB12: Schema.number(),
    folate: Schema.number(),
  },
  optionalProperties: [
    'sodium',
    'sugar',
    'calcium',
    'iron',
    'potassium',
    'magnesium',
    'zinc',
    'vitaminA',
    'vitaminC',
    'vitaminD',
    'vitaminE',
    'vitaminB12',
    'folate',
  ],
});

const mealItemNutritionSchema = Schema.object({
  properties: {
    mealIndex: Schema.number({ description: 'Indice da refeicao, iniciando em 0.' }),
    itemIndex: Schema.number({ description: 'Indice do item dentro da refeicao, iniciando em 0.' }),
    nutrition: nutritionSchema,
  },
});

const shoppingItemSchema = Schema.object({
  properties: {
    name: Schema.string({ description: 'Nome do item de compra em portugues do Brasil.' }),
    quantity: Schema.string({ description: 'Quantidade total consolidada, por exemplo 500, 12, 1.' }),
    unit: Schema.string({ description: 'Unidade de compra, por exemplo g, kg, ml, L, unidades, pacote.' }),
  },
  optionalProperties: ['unit'],
});

const shoppingListSchema = Schema.object({
  properties: {
    items: Schema.array({ items: shoppingItemSchema }),
    mealItemNutrition: Schema.array({ items: mealItemNutritionSchema }),
    totalNutrition: nutritionSchema,
  },
  optionalProperties: ['mealItemNutrition', 'totalNutrition'],
});

function cleanText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeShoppingItem(item: any): ShoppingListItem | null {
  const name = cleanText(item?.name);
  if (!name) return null;
  return {
    name,
    quantity: cleanText(item?.quantity),
    unit: cleanText(item?.unit) || undefined,
  };
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeNutrition(value: any): FoodNutrition {
  return {
    kcal: Math.round(numberOrZero(value?.kcal)),
    protein: numberOrZero(value?.protein),
    carbs: numberOrZero(value?.carbs),
    fat: numberOrZero(value?.fat),
    fiber: numberOrZero(value?.fiber),
    sodium: numberOrZero(value?.sodium),
    sugar: numberOrZero(value?.sugar),
    calcium: numberOrZero(value?.calcium),
    iron: numberOrZero(value?.iron),
    potassium: numberOrZero(value?.potassium),
    magnesium: numberOrZero(value?.magnesium),
    zinc: numberOrZero(value?.zinc),
    vitaminA: numberOrZero(value?.vitaminA),
    vitaminC: numberOrZero(value?.vitaminC),
    vitaminD: numberOrZero(value?.vitaminD),
    vitaminE: numberOrZero(value?.vitaminE),
    vitaminB12: numberOrZero(value?.vitaminB12),
    folate: numberOrZero(value?.folate),
  };
}

function aiFoodFromPlanItem(name: string, quantity: string, nutrition: FoodNutrition): FoodItem {
  const quantityAlias = `${quantity} ${name}`.trim().toLowerCase();
  return {
    id: customFoodId(name),
    name,
    emoji: '🍽️',
    aliases: Array.from(new Set([name.toLowerCase(), quantityAlias])),
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao: nutrition,
    },
  };
}

export function fallbackShoppingListFromMeals(meals: FoodPlanMeal[]): ShoppingListItem[] {
  const byName = new Map<string, ShoppingListItem>();
  meals.forEach((meal) => {
    meal.items.forEach((item) => {
      const name = cleanText(item.name);
      if (!name) return;
      const key = name.toLowerCase();
      const current = byName.get(key);
      if (!current) {
        byName.set(key, { name, quantity: cleanText(item.quantity) });
        return;
      }
      byName.set(key, {
        ...current,
        quantity: [current.quantity, cleanText(item.quantity)].filter(Boolean).join(' + '),
      });
    });
  });
  return Array.from(byName.values());
}

export function fallbackFoodPlanAnalysis(meals: FoodPlanMeal[]): FoodPlanAiAnalysis {
  return {
    meals,
    shoppingList: fallbackShoppingListFromMeals(meals),
    totalNutrition: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
  };
}

export async function analyzeFoodPlanWithAi({
  profile,
  goals,
  meals,
}: {
  profile: UserProfile;
  goals: MacroGoals;
  meals: FoodPlanMeal[];
}): Promise<FoodPlanAiAnalysis> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: shoppingListSchema,
    },
  });

  const mealText = meals.map((meal) => `
- ${meal.title} (${meal.period}${meal.time ? `, ${meal.time}` : ''})
  Itens: ${meal.items.map((item) => `${item.quantity} ${item.name}`.trim()).join('; ')}
  Observacoes: ${meal.instructions ?? 'nenhuma'}
`).join('\n');

  const prompt = `
Voce e um assistente de nutricao para um app brasileiro.
Gere uma lista de compras consolidada a partir das refeicoes planejadas.
Otimize para compra pratica em mercado: agrupe itens iguais, use unidades comuns, arredonde quantidades de forma util e evite duplicados.
Nao invente alimentos que nao aparecem no plano. Se uma quantidade estiver ambigua, use a quantidade informada como texto.
Tambem estime nutrientes totais de cada item e do plano inteiro, incluindo macronutrientes, sodio, acucar, minerais e vitaminas quando fizer sentido.
As estimativas devem ser realistas para a quantidade informada.

Paciente:
- Idade: ${profile.age}
- Peso: ${profile.weight} kg
- Altura: ${profile.height} cm
- Objetivo: ${profile.goal}
- Meta kcal: ${goals.kcal}
- Proteina: ${goals.protein} g
- Carboidratos: ${goals.carbs} g
- Gorduras: ${goals.fat} g

Refeicoes planejadas:
${mealText}

Responda apenas com JSON seguindo o schema.
`;

  const result = await model.generateContent(prompt);
  const raw = JSON.parse(result.response.text());
  const items = Array.isArray(raw.items) ? raw.items : [];
  const shoppingList = items.map(normalizeShoppingItem).filter(Boolean) as ShoppingListItem[];
  const mealsWithNutrition = meals.map((meal, mealIndex) => {
    const mealItems = meal.items.map((item, itemIndex) => {
      const match = (raw.mealItemNutrition ?? []).find((entry: any) => (
        Number(entry?.mealIndex) === mealIndex && Number(entry?.itemIndex) === itemIndex
      ));
      return {
        ...item,
        nutrition: match?.nutrition ? normalizeNutrition(match.nutrition) : item.nutrition,
      };
    });
    const totalNutrition = sumNutrition(mealItems
      .filter((item) => item.nutrition)
      .map((item) => ({ nutrition: item.nutrition as FoodNutrition })));
    return { ...meal, items: mealItems, totalNutrition };
  });
  const totalNutrition = raw.totalNutrition
    ? normalizeNutrition(raw.totalNutrition)
    : sumNutrition(mealsWithNutrition
      .filter((meal) => meal.totalNutrition)
      .map((meal) => ({ nutrition: meal.totalNutrition as FoodNutrition })));

  return {
    meals: mealsWithNutrition,
    shoppingList: shoppingList.length > 0 ? shoppingList : fallbackShoppingListFromMeals(meals),
    totalNutrition,
  };
}

export async function saveAiPlanFoodsToFirebase(
  userId: string,
  meals: FoodPlanMeal[]
): Promise<void> {
  const foods = meals.flatMap((meal) => (
    meal.items
      .filter((item) => item.nutrition && item.name.trim())
      .map((item) => aiFoodFromPlanItem(item.name.trim(), item.quantity, item.nutrition as FoodNutrition))
  ));
  const uniqueFoods = Array.from(new Map(foods.map((food) => [food.id, food])).values());
  await Promise.all(uniqueFoods.map((food) => saveCustomFood(userId, food)));
}
