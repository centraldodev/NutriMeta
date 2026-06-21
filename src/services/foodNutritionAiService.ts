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

function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .trim();
}

function roundNutrition(value: number) {
  return Math.round(value * 10) / 10;
}

function inferServingMl(query: string, servingQuantity?: unknown): number {
  const parsedServing = Number(servingQuantity);
  if (Number.isFinite(parsedServing) && parsedServing > 0 && parsedServing <= 2000) {
    return parsedServing;
  }
  if (/\blata\b|\bcan\b/.test(query)) return 350;
  if (/\bgarrafa\b/.test(query)) return 500;
  return 200;
}

function hasZeroSugarIntent(query: string) {
  return /\bzero\b|\bdiet\b|sem acucar|zero acucar|zero sugar/.test(query);
}

function isGenericTermOnly(query: string, terms: string[]) {
  const words = query.split(/\s+/).filter(Boolean);
  return words.length <= 3 && terms.some((term) => query.includes(term));
}

function withAliases(name: string, foodName: string, aliases: string[]) {
  return Array.from(new Set([name.toLowerCase(), foodName.toLowerCase(), ...aliases]));
}

function knownFoodShortcut(foodName: string): FoodItem | null {
  const query = normalizeQuery(foodName);
  if (/\bagua\b|\bwater\b/.test(query)) {
    return {
      id: customFoodId('Água'),
      name: 'Água',
      emoji: '💧',
      aliases: ['água', 'agua', 'copo de água', 'garrafa de água'],
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
        litro: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
      },
    };
  }

  if ((query.includes('coca') || query.includes('cola')) && hasZeroSugarIntent(query)) {
    const servingMl = inferServingMl(query);
    const perMl = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0.14, sugar: 0 };
    return {
      id: customFoodId(query.includes('lata') ? 'Coca-Cola Zero lata' : 'Coca-Cola Zero'),
      name: query.includes('lata') ? 'Coca-Cola Zero lata' : 'Coca-Cola Zero',
      emoji: '🥤',
      aliases: ['coca cola zero', 'coca-cola zero', 'coca zero', 'refrigerante zero', 'coca cola lata zero'],
      defaultUnit: query.includes('lata') ? 'unidade' : 'mililitro',
      nutritionPer: {
        unidade: {
          kcal: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sodium: roundNutrition(perMl.sodium * servingMl),
          sugar: 0,
        },
        mililitro: perMl,
        litro: {
          kcal: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sodium: roundNutrition(perMl.sodium * 1000),
          sugar: 0,
        },
      },
    };
  }

  return null;
}

function genericFoodFallback(foodName: string): FoodItem | null {
  const query = normalizeQuery(foodName);

  if (isGenericTermOnly(query, ['refrigerante', 'coca', 'guarana', 'soda', 'refri'])) {
    return {
      id: customFoodId('Refrigerante'),
      name: 'Refrigerante',
      emoji: '🥤',
      aliases: withAliases('Refrigerante', foodName, ['refrigerante', 'refri', 'coca', 'guaraná', 'guarana', 'soda']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0.42, protein: 0, carbs: 0.105, fat: 0, fiber: 0, sodium: 0.05, sugar: 0.105 },
        litro: { kcal: 420, protein: 0, carbs: 105, fat: 0, fiber: 0, sodium: 50, sugar: 105 },
      },
    };
  }

  if (query.includes('cerveja') || query.includes('chopp') || query.includes('pilsen') || query.includes('ipa') || query.includes('lager')) {
    return {
      id: customFoodId('Cerveja'),
      name: 'Cerveja',
      emoji: '🍺',
      aliases: withAliases('Cerveja', foodName, ['cerveja', 'chopp', 'pilsen', 'ipa', 'lager']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0.43, protein: 0.005, carbs: 0.036, fat: 0, fiber: 0, sodium: 0.04, sugar: 0 },
        litro: { kcal: 430, protein: 5, carbs: 36, fat: 0, fiber: 0, sodium: 40, sugar: 0 },
        unidade: { kcal: 151, protein: 1.8, carbs: 12.6, fat: 0, fiber: 0, sodium: 14, sugar: 0 },
      },
    };
  }

  if (query.includes('vinho') || query.includes('espumante') || query.includes('champagne')) {
    const isSweet = query.includes('suave') || query.includes('doce');
    const sugarPerMl = isSweet ? 0.045 : 0.006;
    return {
      id: customFoodId(isSweet ? 'Vinho suave' : 'Vinho'),
      name: isSweet ? 'Vinho suave' : 'Vinho',
      emoji: '🍷',
      aliases: withAliases(isSweet ? 'Vinho suave' : 'Vinho', foodName, ['vinho', 'vinho tinto', 'vinho branco', 'espumante', 'champagne']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: isSweet ? 0.95 : 0.83, protein: 0, carbs: sugarPerMl, fat: 0, fiber: 0, sodium: 0.04, sugar: sugarPerMl },
        litro: { kcal: isSweet ? 950 : 830, protein: 0, carbs: sugarPerMl * 1000, fat: 0, fiber: 0, sodium: 40, sugar: sugarPerMl * 1000 },
        porcao: { kcal: isSweet ? 143 : 125, protein: 0, carbs: roundNutrition(sugarPerMl * 150), fat: 0, fiber: 0, sodium: 6, sugar: roundNutrition(sugarPerMl * 150) },
      },
    };
  }

  if (query.includes('vodka') || query.includes('whisky') || query.includes('gin') || query.includes('rum') || query.includes('tequila') || query.includes('cachaca') || query.includes('cachaça')) {
    const name = query.includes('whisky') ? 'Whisky' : query.includes('gin') ? 'Gin' : query.includes('rum') ? 'Rum' : query.includes('tequila') ? 'Tequila' : query.includes('cachaca') || query.includes('cachaça') ? 'Cachaça' : 'Vodka';
    return {
      id: customFoodId(name),
      name,
      emoji: '🥃',
      aliases: withAliases(name, foodName, ['vodka', 'whisky', 'gin', 'rum', 'tequila', 'cachaça', 'cachaca', 'destilado']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 2.3, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
        porcao: { kcal: 115, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
      },
    };
  }

  if (query.includes('energetico') || query.includes('energético') || query.includes('red bull') || query.includes('monster')) {
    const zero = hasZeroSugarIntent(query);
    return {
      id: customFoodId(zero ? 'Energético zero' : 'Energético'),
      name: zero ? 'Energético zero' : 'Energético',
      emoji: '⚡',
      aliases: withAliases(zero ? 'Energético zero' : 'Energético', foodName, ['energetico', 'energético', 'red bull', 'monster', 'bebida energética']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: zero
          ? { kcal: 0.02, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0.23, sugar: 0 }
          : { kcal: 0.45, protein: 0, carbs: 0.11, fat: 0, fiber: 0, sodium: 0.23, sugar: 0.11 },
        litro: zero
          ? { kcal: 20, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 230, sugar: 0 }
          : { kcal: 450, protein: 0, carbs: 110, fat: 0, fiber: 0, sodium: 230, sugar: 110 },
        unidade: zero
          ? { kcal: 5, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 58, sugar: 0 }
          : { kcal: 113, protein: 0, carbs: 27.5, fat: 0, fiber: 0, sodium: 58, sugar: 27.5 },
      },
    };
  }

  if (query.includes('cafe') || query.includes('café')) {
    const withSugar = query.includes('acucar') || query.includes('açucar') || query.includes('açúcar') || query.includes('adoçado') || query.includes('adocado');
    return {
      id: customFoodId(withSugar ? 'Café adoçado' : 'Café'),
      name: withSugar ? 'Café adoçado' : 'Café',
      emoji: '☕',
      aliases: withAliases(withSugar ? 'Café adoçado' : 'Café', foodName, ['cafe', 'café', 'cafe preto', 'café preto']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: withSugar
          ? { kcal: 0.22, protein: 0, carbs: 0.055, fat: 0, fiber: 0, sodium: 0.02, sugar: 0.055 }
          : { kcal: 0.02, protein: 0.001, carbs: 0, fat: 0, fiber: 0, sodium: 0.02, sugar: 0 },
        xicara: withSugar
          ? { kcal: 44, protein: 0, carbs: 11, fat: 0, fiber: 0, sodium: 4, sugar: 11 }
          : { kcal: 4, protein: 0.2, carbs: 0, fat: 0, fiber: 0, sodium: 4, sugar: 0 },
      },
    };
  }

  if (query.includes('cha') || query.includes('chá')) {
    return {
      id: customFoodId('Chá'),
      name: 'Chá',
      emoji: '🍵',
      aliases: withAliases('Chá', foodName, ['cha', 'chá', 'cha quente', 'chá quente', 'cha gelado', 'chá gelado']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0.01, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0.01, sugar: 0 },
        xicara: { kcal: 2, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 2, sugar: 0 },
      },
    };
  }

  if (query.includes('leite')) {
    const skimmed = query.includes('desnatado');
    return {
      id: customFoodId(skimmed ? 'Leite desnatado' : 'Leite'),
      name: skimmed ? 'Leite desnatado' : 'Leite',
      emoji: '🥛',
      aliases: withAliases(skimmed ? 'Leite desnatado' : 'Leite', foodName, ['leite', 'leite integral', 'leite desnatado']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: skimmed
          ? { kcal: 0.34, protein: 0.034, carbs: 0.05, fat: 0.001, fiber: 0, sodium: 0.42, sugar: 0.05, calcium: 1.2 }
          : { kcal: 0.61, protein: 0.032, carbs: 0.047, fat: 0.033, fiber: 0, sodium: 0.43, sugar: 0.047, calcium: 1.13 },
        xicara: skimmed
          ? { kcal: 68, protein: 6.8, carbs: 10, fat: 0.2, fiber: 0, sodium: 84, sugar: 10, calcium: 240 }
          : { kcal: 122, protein: 6.4, carbs: 9.4, fat: 6.6, fiber: 0, sodium: 86, sugar: 9.4, calcium: 226 },
      },
    };
  }

  if (query.includes('isotonico') || query.includes('isotônico') || query.includes('gatorade')) {
    return {
      id: customFoodId('Isotônico'),
      name: 'Isotônico',
      emoji: '🧃',
      aliases: withAliases('Isotônico', foodName, ['isotonico', 'isotônico', 'gatorade', 'bebida esportiva']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0.24, protein: 0, carbs: 0.06, fat: 0, fiber: 0, sodium: 0.45, sugar: 0.035 },
        litro: { kcal: 240, protein: 0, carbs: 60, fat: 0, fiber: 0, sodium: 450, sugar: 35 },
        unidade: { kcal: 120, protein: 0, carbs: 30, fat: 0, fiber: 0, sodium: 225, sugar: 17.5 },
      },
    };
  }

  if (query.includes('suco')) {
    return {
      id: customFoodId('Suco'),
      name: 'Suco',
      emoji: '🧃',
      aliases: withAliases('Suco', foodName, ['suco', 'suco natural', 'suco de fruta']),
      defaultUnit: 'mililitro',
      nutritionPer: {
        mililitro: { kcal: 0.45, protein: 0.005, carbs: 0.11, fat: 0, fiber: 0.002, sodium: 0.01, sugar: 0.085, potassium: 1.8, vitaminC: 0.25 },
        litro: { kcal: 450, protein: 5, carbs: 110, fat: 0, fiber: 2, sodium: 10, sugar: 85, potassium: 1800, vitaminC: 250 },
      },
    };
  }

  if (query.includes('salgadinho') || query.includes('chips') || query.includes('batata frita pacote') || query.includes('doritos') || query.includes('ruffles') || query.includes('cheetos')) {
    return {
      id: customFoodId('Salgadinho de pacote'),
      name: 'Salgadinho de pacote',
      emoji: '🥨',
      aliases: withAliases('Salgadinho de pacote', foodName, ['salgadinho', 'chips', 'batata chips', 'doritos', 'ruffles', 'cheetos']),
      defaultUnit: 'grama',
      nutritionPer: {
        grama: { kcal: 5.2, protein: 0.07, carbs: 0.57, fat: 0.3, fiber: 0.04, sodium: 6.5, sugar: 0.03 },
        porcao: { kcal: 156, protein: 2.1, carbs: 17.1, fat: 9, fiber: 1.2, sodium: 195, sugar: 0.9 },
      },
    };
  }

  if (query.includes('bolacha') || query.includes('biscoito') || query.includes('cookie') || query.includes('wafer') || query.includes('oreo')) {
    const stuffed = query.includes('rechead') || query.includes('wafer') || query.includes('oreo');
    return {
      id: customFoodId(stuffed ? 'Biscoito recheado' : 'Biscoito'),
      name: stuffed ? 'Biscoito recheado' : 'Biscoito',
      emoji: '🍪',
      aliases: withAliases(stuffed ? 'Biscoito recheado' : 'Biscoito', foodName, ['bolacha', 'biscoito', 'cookie', 'wafer', 'oreo']),
      defaultUnit: 'grama',
      nutritionPer: {
        grama: stuffed
          ? { kcal: 4.8, protein: 0.06, carbs: 0.68, fat: 0.2, fiber: 0.025, sodium: 3.5, sugar: 0.38 }
          : { kcal: 4.3, protein: 0.08, carbs: 0.72, fat: 0.12, fiber: 0.025, sodium: 4.2, sugar: 0.22 },
        unidade: stuffed
          ? { kcal: 58, protein: 0.7, carbs: 8.2, fat: 2.4, fiber: 0.3, sodium: 42, sugar: 4.6 }
          : { kcal: 30, protein: 0.6, carbs: 5, fat: 0.8, fiber: 0.2, sodium: 29, sugar: 1.5 },
        porcao: stuffed
          ? { kcal: 144, protein: 1.8, carbs: 20.4, fat: 6, fiber: 0.8, sodium: 105, sugar: 11.4 }
          : { kcal: 129, protein: 2.4, carbs: 21.6, fat: 3.6, fiber: 0.8, sodium: 126, sugar: 6.6 },
      },
    };
  }

  if (query.includes('chocolate') || query.includes('bombom') || query.includes('doce') || query.includes('brigadeiro')) {
    return {
      id: customFoodId('Chocolate/doce'),
      name: 'Chocolate/doce',
      emoji: '🍫',
      aliases: withAliases('Chocolate/doce', foodName, ['chocolate', 'bombom', 'doce', 'brigadeiro']),
      defaultUnit: 'grama',
      nutritionPer: {
        grama: { kcal: 5.3, protein: 0.07, carbs: 0.57, fat: 0.3, fiber: 0.03, sodium: 0.8, sugar: 0.48 },
        unidade: { kcal: 110, protein: 1.5, carbs: 12, fat: 6.3, fiber: 0.6, sodium: 17, sugar: 10 },
        porcao: { kcal: 160, protein: 2.1, carbs: 17.1, fat: 9, fiber: 0.9, sodium: 24, sugar: 14.4 },
      },
    };
  }

  if (query.includes('banana')) return fruitFood(foodName, 'Banana', '🍌', 89, 1.1, 22.8, 0.3, 2.6, 1, 12.2, 358, 8.7);
  if (query.includes('maca') || query.includes('maçã')) return fruitFood(foodName, 'Maçã', '🍎', 52, 0.3, 13.8, 0.2, 2.4, 1, 10.4, 107, 4.6);
  if (query.includes('laranja')) return fruitFood(foodName, 'Laranja', '🍊', 47, 0.9, 11.8, 0.1, 2.4, 0, 9.4, 181, 53.2);
  if (query.includes('uva')) return fruitFood(foodName, 'Uva', '🍇', 69, 0.7, 18.1, 0.2, 0.9, 2, 15.5, 191, 3.2);
  if (query.includes('morango')) return fruitFood(foodName, 'Morango', '🍓', 32, 0.7, 7.7, 0.3, 2, 1, 4.9, 153, 58.8);
  if (query.includes('abacate')) return fruitFood(foodName, 'Abacate', '🥑', 160, 2, 8.5, 14.7, 6.7, 7, 0.7, 485, 10);

  return null;
}

function fruitFood(
  foodName: string,
  name: string,
  emoji: string,
  kcal100: number,
  protein100: number,
  carbs100: number,
  fat100: number,
  fiber100: number,
  sodium100: number,
  sugar100: number,
  potassium100: number,
  vitaminC100: number
): FoodItem {
  const perGram = normalizeAiNutrition({
    kcal: roundNutrition(kcal100 / 100),
    protein: roundNutrition(protein100 / 100),
    carbs: roundNutrition(carbs100 / 100),
    fat: roundNutrition(fat100 / 100),
    fiber: roundNutrition(fiber100 / 100),
    sodium: roundNutrition(sodium100 / 100),
    sugar: roundNutrition(sugar100 / 100),
    potassium: roundNutrition(potassium100 / 100),
    vitaminC: roundNutrition(vitaminC100 / 100),
  });
  return {
    id: customFoodId(name),
    name,
    emoji,
    aliases: withAliases(name, foodName, [normalizeQuery(name)]),
    defaultUnit: 'unidade',
    nutritionPer: {
      grama: perGram,
      unidade: normalizeAiNutrition({
        kcal: roundNutrition(perGram.kcal * 100),
        protein: roundNutrition(perGram.protein * 100),
        carbs: roundNutrition(perGram.carbs * 100),
        fat: roundNutrition(perGram.fat * 100),
        fiber: roundNutrition(perGram.fiber * 100),
        sodium: roundNutrition((perGram.sodium ?? 0) * 100),
        sugar: roundNutrition((perGram.sugar ?? 0) * 100),
        potassium: roundNutrition((perGram.potassium ?? 0) * 100),
        vitaminC: roundNutrition((perGram.vitaminC ?? 0) * 100),
      }),
      porcao: normalizeAiNutrition({
        kcal: roundNutrition(perGram.kcal * 100),
        protein: roundNutrition(perGram.protein * 100),
        carbs: roundNutrition(perGram.carbs * 100),
        fat: roundNutrition(perGram.fat * 100),
        fiber: roundNutrition(perGram.fiber * 100),
        sodium: roundNutrition((perGram.sodium ?? 0) * 100),
        sugar: roundNutrition((perGram.sugar ?? 0) * 100),
        potassium: roundNutrition((perGram.potassium ?? 0) * 100),
        vitaminC: roundNutrition((perGram.vitaminC ?? 0) * 100),
      }),
    },
  };
}

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_pt?: string;
  generic_name?: string;
  generic_name_pt?: string;
  brands?: string;
  serving_quantity?: unknown;
  serving_size?: string;
  nutriments?: Record<string, unknown>;
};

function nutrientNumber(nutriments: Record<string, unknown>, key: string) {
  const value = Number(nutriments[key]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function openFoodFactsNutrition(product: OpenFoodFactsProduct, query: string): FoodItem | null {
  const nutriments = product.nutriments ?? {};
  const kcal100 = nutrientNumber(nutriments, 'energy-kcal_100g') || nutrientNumber(nutriments, 'energy-kcal_100ml');
  const hasUsefulNutrition = kcal100 > 0 || hasZeroSugarIntent(query);
  if (!hasUsefulNutrition) return null;

  const protein100 = nutrientNumber(nutriments, 'proteins_100g') || nutrientNumber(nutriments, 'proteins_100ml');
  const carbs100 = nutrientNumber(nutriments, 'carbohydrates_100g') || nutrientNumber(nutriments, 'carbohydrates_100ml');
  const fat100 = nutrientNumber(nutriments, 'fat_100g') || nutrientNumber(nutriments, 'fat_100ml');
  const fiber100 = nutrientNumber(nutriments, 'fiber_100g') || nutrientNumber(nutriments, 'fiber_100ml');
  const sugar100 = nutrientNumber(nutriments, 'sugars_100g') || nutrientNumber(nutriments, 'sugars_100ml');
  const sodiumG100 = nutrientNumber(nutriments, 'sodium_100g') || nutrientNumber(nutriments, 'sodium_100ml');
  const sodiumMg100 = sodiumG100 * 1000;

  const queryNormalized = normalizeQuery(query);
  const servingMl = inferServingMl(queryNormalized, product.serving_quantity);
  const isLiquid = /\b(coca|cola|refrigerante|suco|agua|bebida|lata|ml|litro)\b/.test(queryNormalized);
  const divisor = isLiquid ? 100 : 100;
  const perBaseUnit: FoodNutrition = normalizeAiNutrition({
    kcal: roundNutrition(kcal100 / divisor),
    protein: roundNutrition(protein100 / divisor),
    carbs: roundNutrition(carbs100 / divisor),
    fat: roundNutrition(fat100 / divisor),
    fiber: roundNutrition(fiber100 / divisor),
    sodium: roundNutrition(sodiumMg100 / divisor),
    sugar: roundNutrition(sugar100 / divisor),
  });

  const name = normalizeName(
    product.product_name_pt ||
    product.product_name ||
    product.generic_name_pt ||
    product.generic_name ||
    query
  );
  const brand = normalizeName(product.brands?.split(',')[0] ?? '');
  const displayName = brand && !normalizeQuery(name).includes(normalizeQuery(brand))
    ? `${brand} ${name}`
    : name;
  const defaultUnit: QuantityUnit = isLiquid && /\blata\b|\bcan\b/.test(queryNormalized) ? 'unidade' : isLiquid ? 'mililitro' : 'grama';

  return {
    id: customFoodId(displayName),
    name: displayName,
    emoji: isLiquid ? '🥤' : '🍽️',
    aliases: Array.from(new Set([
      displayName.toLowerCase(),
      name.toLowerCase(),
      query.toLowerCase(),
      brand.toLowerCase(),
    ].filter(Boolean))),
    defaultUnit,
    nutritionPer: {
      [isLiquid ? 'mililitro' : 'grama']: perBaseUnit,
      ...(isLiquid
        ? {
            litro: normalizeAiNutrition({
              kcal: roundNutrition(perBaseUnit.kcal * 1000),
              protein: roundNutrition(perBaseUnit.protein * 1000),
              carbs: roundNutrition(perBaseUnit.carbs * 1000),
              fat: roundNutrition(perBaseUnit.fat * 1000),
              fiber: roundNutrition(perBaseUnit.fiber * 1000),
              sodium: roundNutrition((perBaseUnit.sodium ?? 0) * 1000),
              sugar: roundNutrition((perBaseUnit.sugar ?? 0) * 1000),
            }),
            unidade: normalizeAiNutrition({
              kcal: roundNutrition(perBaseUnit.kcal * servingMl),
              protein: roundNutrition(perBaseUnit.protein * servingMl),
              carbs: roundNutrition(perBaseUnit.carbs * servingMl),
              fat: roundNutrition(perBaseUnit.fat * servingMl),
              fiber: roundNutrition(perBaseUnit.fiber * servingMl),
              sodium: roundNutrition((perBaseUnit.sodium ?? 0) * servingMl),
              sugar: roundNutrition((perBaseUnit.sugar ?? 0) * servingMl),
            }),
          }
        : {
            porcao: normalizeAiNutrition({
              kcal: roundNutrition(perBaseUnit.kcal * 100),
              protein: roundNutrition(perBaseUnit.protein * 100),
              carbs: roundNutrition(perBaseUnit.carbs * 100),
              fat: roundNutrition(perBaseUnit.fat * 100),
              fiber: roundNutrition(perBaseUnit.fiber * 100),
              sodium: roundNutrition((perBaseUnit.sodium ?? 0) * 100),
              sugar: roundNutrition((perBaseUnit.sugar ?? 0) * 100),
            }),
          }),
    },
  };
}

async function lookupOpenFoodFacts(foodName: string): Promise<FoodItem | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const params = new URLSearchParams({
      search_terms: foodName,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '8',
      fields: 'product_name,product_name_pt,generic_name,generic_name_pt,brands,serving_quantity,serving_size,nutriments',
    });
    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json() as { products?: OpenFoodFactsProduct[] };
    for (const product of data.products ?? []) {
      const food = openFoodFactsNutrition(product, foodName);
      if (food) return food;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateFoodNutrition(
  foodName: string,
  preferredUnit: QuantityUnit = 'porcao'
): Promise<FoodItem> {
  const shortcut = knownFoodShortcut(foodName);
  if (shortcut) return shortcut;

  const publicLabelFood = await lookupOpenFoodFacts(foodName);
  if (publicLabelFood) return publicLabelFood;

  const fallback = genericFoodFallback(foodName);
  if (fallback) return fallback;

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
Aceite qualquer tipo de consumo diario: comida caseira, fruta, vegetal, carne, cereal, doce, salgadinho, bolacha, suplemento, agua, refrigerante, suco, energetico, cafe, cha, vinho, cerveja, destilado e bebida pronta.
Se for marca, produto industrializado, lata, garrafa, bebida, snack, biscoito, doce ou suplemento, priorize dados de rotulo nutricional publico e tabelas alimentares confiaveis.
Para produtos "zero", "diet" ou "sem acucar", nao use valores de refrigerante comum; preserve calorias e acucar proximos de zero quando o rotulo indicar isso.
Para bebidas alcoolicas, estime as calorias do alcool e carboidratos conforme o tipo; proteina, gordura e fibra normalmente ficam zero.
Inclua macros e, quando plausivel, micronutrientes: sodio mg, acucar g, calcio mg, ferro mg, potassio mg, magnesio mg, zinco mg, vitamina A mcg RAE, vitamina C mg, vitamina D mcg, vitamina E mg, vitamina B12 mcg e folato mcg.
Use nomes em portugues do Brasil e aliases comuns para busca.
Se o alimento for fruta ou alimento in natura, use composicao por unidade comum ou por 100 g.
Se o alimento for um prato preparado, estime uma porcao comum individual. Nunca rejeite um alimento comestivel ou bebida por nao estar na base local; retorne a melhor estimativa segura.
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

  if (!name || (nutrition.kcal <= 0 && !normalizeQuery(name).includes('agua'))) {
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
