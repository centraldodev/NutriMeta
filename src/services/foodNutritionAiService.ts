import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { FoodItem, FoodNutrition, QuantityUnit } from '../types';
import { customFoodId } from './customFoodService';

const UNIT_VALUES: QuantityUnit[] = [
  'colher_sopa',
  'colher_cha',
  'xicara',
  'concha',
  'fatia',
  'unidade',
  'porcao',
  'file',
  'bife_pequeno',
  'bife_medio',
  'bife_grande',
  'mililitro',
  'litro',
  'grama',
];

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

const foodSchema = Schema.object({
  properties: {
    name: Schema.string({ description: 'Nome curto do alimento em portugues do Brasil.' }),
    emoji: Schema.string({ description: 'Emoji simples que represente o alimento.' }),
    aliases: Schema.array({ items: Schema.string() }),
    defaultUnit: Schema.enumString({ enum: UNIT_VALUES }),
    nutritionPerUnit: nutritionSchema,
    confidence: Schema.number({ description: 'Confianca entre 0 e 1.' }),
    notes: Schema.string(),
  },
  optionalProperties: ['aliases', 'confidence', 'notes'],
});

function numberOrZero(n: unknown) {
  return Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : 0;
}

export function normalizeAiNutrition(value: FoodNutrition): FoodNutrition {
  return {
    kcal: numberOrZero(value.kcal),
    protein: numberOrZero(value.protein),
    carbs: numberOrZero(value.carbs),
    fat: numberOrZero(value.fat),
    fiber: numberOrZero(value.fiber),
    sodium: value.sodium == null ? undefined : numberOrZero(value.sodium),
    sugar: value.sugar == null ? undefined : numberOrZero(value.sugar),
    calcium: value.calcium == null ? undefined : numberOrZero(value.calcium),
    iron: value.iron == null ? undefined : numberOrZero(value.iron),
    potassium: value.potassium == null ? undefined : numberOrZero(value.potassium),
    magnesium: value.magnesium == null ? undefined : numberOrZero(value.magnesium),
    zinc: value.zinc == null ? undefined : numberOrZero(value.zinc),
    vitaminA: value.vitaminA == null ? undefined : numberOrZero(value.vitaminA),
    vitaminC: value.vitaminC == null ? undefined : numberOrZero(value.vitaminC),
    vitaminD: value.vitaminD == null ? undefined : numberOrZero(value.vitaminD),
    vitaminE: value.vitaminE == null ? undefined : numberOrZero(value.vitaminE),
    vitaminB12: value.vitaminB12 == null ? undefined : numberOrZero(value.vitaminB12),
    folate: value.folate == null ? undefined : numberOrZero(value.folate),
  };
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export async function generateFoodNutrition(
  foodName: string,
  preferredUnit: QuantityUnit = 'porcao'
): Promise<FoodItem> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: foodSchema,
    },
  });

  const result = await model.generateContent(`
Cadastre um alimento para uma base nutricional compartilhada.
Alimento informado pelo usuario: "${foodName}".
Unidade preferida: "${preferredUnit}".

Responda com valores nutricionais estimados para 1 unidade da defaultUnit escolhida.
Inclua macros e, quando plausivel, micronutrientes: sodio mg, acucar g, calcio mg, ferro mg, potassio mg, magnesio mg, zinco mg, vitamina A mcg RAE, vitamina C mg, vitamina D mcg, vitamina E mg, vitamina B12 mcg e folato mcg.
Use nomes em portugues do Brasil e aliases comuns para busca.
Se o alimento for um prato preparado, estime uma porcao comum individual.
`);

  const parsed = JSON.parse(result.response.text()) as {
    name: string;
    emoji?: string;
    aliases?: string[];
    defaultUnit?: QuantityUnit;
    nutritionPerUnit?: FoodNutrition;
  };
  const name = normalizeName(parsed.name || foodName);
  const unit = parsed.defaultUnit && UNIT_VALUES.includes(parsed.defaultUnit) ? parsed.defaultUnit : preferredUnit;
  const nutrition = normalizeAiNutrition(parsed.nutritionPerUnit ?? {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });

  if (!name || nutrition.kcal <= 0) {
    throw new Error('AI did not return valid food nutrition');
  }

  return {
    id: customFoodId(name),
    name,
    emoji: parsed.emoji?.trim() || '🍽️',
    aliases: Array.from(new Set([name.toLowerCase(), foodName.toLowerCase(), ...(parsed.aliases ?? [])])),
    defaultUnit: unit,
    nutritionPer: {
      [unit]: nutrition,
    },
  };
}
