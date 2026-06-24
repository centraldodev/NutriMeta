import generalFoodDatabase from '../.data/base_alimentos_geral_taco_estimativas.json';
import preparedDishesDatabase from '../.data/pratos_feitos_brasileiros.json';
import { FoodItem, FoodNutrition, QuantityUnit } from '../types';

type GeneralFoodRecord = {
  id: string;
  nome: string;
  categoria?: string | null;
  subcategoria?: string | null;
  porcao_referencia?: string | null;
  nutrientes: {
    energia_kcal?: number | null;
    carboidratos_g?: number | null;
    proteinas_g?: number | null;
    gorduras_totais_g?: number | null;
    gorduras_saturadas_g?: number | null;
    fibra_alimentar_g?: number | null;
    acucares_totais_g?: number | null;
    sodio_mg?: number | null;
    calcio_mg?: number | null;
    ferro_mg?: number | null;
    potassio_mg?: number | null;
    magnesio_mg?: number | null;
    zinco_mg?: number | null;
    vitamina_A_mcg?: number | null;
    vitamina_c_mg?: number | null;
    vitamina_D_mcg?: number | null;
    vitamina_E_mg?: number | null;
    vitamina_B12_mcg?: number | null;
    folato_mcg?: number | null;
  };
  fonte?: string;
  observacoes?: string;
  tags?: string[];
};

type PreparedDishRecord = {
  id: number | string;
  nome: string;
  categoria?: string;
  descricao?: string;
  porcao_g: number;
  ingredientes?: { nome: string; quantidade_g?: number }[];
  macronutrientes: {
    calorias_kcal?: number;
    proteinas_g?: number;
    carboidratos_g?: number;
    gorduras_totais_g?: number;
    fibras_g?: number;
    sodio_mg?: number;
    acucares_g?: number;
  };
  micronutrientes?: {
    vitamina_A_mcg?: number;
    vitamina_C_mg?: number;
    vitamina_D_mcg?: number;
    vitamina_E_mg?: number;
    vitamina_B12_mcg?: number;
    calcio_mg?: number;
    ferro_mg?: number;
    potassio_mg?: number;
    magnesio_mg?: number;
    zinco_mg?: number;
    folato_mcg?: number;
  };
};

type GeneralFoodDatabase = {
  metadata: Record<string, unknown>;
  schema: Record<string, unknown>;
  alimentos: GeneralFoodRecord[];
};

type PreparedDishDatabase = {
  titulo: string;
  descricao: string;
  fonte: string;
  unidade_porcao: string;
  pratos: PreparedDishRecord[];
  legenda_nutrientes?: Record<string, unknown>;
  referencias_IDR?: Record<string, unknown>;
};

function localFoodId(prefix: string, rawId: string | number, name: string) {
  const sourceId = String(rawId || name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}_${sourceId || 'alimento'}`;
}

function normalizeAlias(value: string) {
  return value.trim().toLowerCase();
}

function aliasesFor(values: (string | null | undefined)[]) {
  const aliases = new Set<string>();
  values.filter(Boolean).forEach((value) => {
    const alias = normalizeAlias(String(value));
    aliases.add(alias);
    aliases.add(alias.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  });
  return Array.from(aliases).filter(Boolean);
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberOrUndefined(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function divideNutrition(nutrition: FoodNutrition, divisor: number): FoodNutrition {
  const result = {} as FoodNutrition;
  (Object.keys(nutrition) as (keyof FoodNutrition)[]).forEach((key) => {
    const value = nutrition[key];
    if (typeof value === 'number') {
      result[key] = round(value / divisor, key === 'kcal' ? 2 : 4) as never;
    }
  });
  return result;
}

function cleanNutrition(nutrition: FoodNutrition): FoodNutrition {
  return Object.fromEntries(
    Object.entries(nutrition).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
  ) as FoodNutrition;
}

function unitFromReference(reference?: string | null): QuantityUnit {
  const normalized = (reference ?? '').toLowerCase();
  if (normalized.includes('ml')) return 'mililitro';
  if (normalized.includes('g')) return 'grama';
  return 'porcao';
}

function emojiForCategory(category?: string | null) {
  const text = (category ?? '').toLowerCase();
  if (text.includes('bebida')) return '🥤';
  if (text.includes('fruta')) return '🍎';
  if (text.includes('verdura') || text.includes('legume')) return '🥬';
  if (text.includes('carne') || text.includes('peixe') || text.includes('ovo')) return '🍗';
  if (text.includes('leite') || text.includes('latic')) return '🥛';
  if (text.includes('óleo') || text.includes('gordura')) return '🫒';
  if (text.includes('doce') || text.includes('açúcar')) return '🍬';
  if (text.includes('prato')) return '🍽️';
  return '🍽️';
}

function mapGeneralFood(record: GeneralFoodRecord, metadata: Record<string, unknown>, schema: Record<string, unknown>): FoodItem {
  const nutrition = cleanNutrition({
    kcal: numberOrZero(record.nutrientes.energia_kcal),
    protein: numberOrZero(record.nutrientes.proteinas_g),
    carbs: numberOrZero(record.nutrientes.carboidratos_g),
    fat: numberOrZero(record.nutrientes.gorduras_totais_g),
    fiber: numberOrZero(record.nutrientes.fibra_alimentar_g),
    sodium: numberOrUndefined(record.nutrientes.sodio_mg),
    sugar: numberOrUndefined(record.nutrientes.acucares_totais_g),
    calcium: numberOrUndefined(record.nutrientes.calcio_mg),
    iron: numberOrUndefined(record.nutrientes.ferro_mg),
    potassium: numberOrUndefined(record.nutrientes.potassio_mg),
    magnesium: numberOrUndefined(record.nutrientes.magnesio_mg),
    zinc: numberOrUndefined(record.nutrientes.zinco_mg),
    vitaminA: numberOrUndefined(record.nutrientes.vitamina_A_mcg),
    vitaminC: numberOrUndefined(record.nutrientes.vitamina_c_mg),
    vitaminD: numberOrUndefined(record.nutrientes.vitamina_D_mcg),
    vitaminE: numberOrUndefined(record.nutrientes.vitamina_E_mg),
    vitaminB12: numberOrUndefined(record.nutrientes.vitamina_B12_mcg),
    folate: numberOrUndefined(record.nutrientes.folato_mcg),
  });
  const defaultUnit = unitFromReference(record.porcao_referencia);

  return {
    id: localFoodId('alimento', record.id, record.nome),
    name: record.nome,
    emoji: emojiForCategory(record.categoria),
    aliases: aliasesFor([record.nome, record.categoria, record.subcategoria, ...(record.tags ?? [])]),
    defaultUnit,
    nutritionPer: {
      [defaultUnit]: divideNutrition(nutrition, 100),
      porcao: nutrition,
    },
    source: 'json:base_alimentos_geral_taco_estimativas',
    category: record.categoria ?? undefined,
    portionReference: record.porcao_referencia ?? undefined,
    originalData: {
      metadata,
      schema,
      alimento: record,
    },
  };
}

function mapPreparedDish(record: PreparedDishRecord, database: PreparedDishDatabase): FoodItem {
  const nutrition = cleanNutrition({
    kcal: numberOrZero(record.macronutrientes.calorias_kcal),
    protein: numberOrZero(record.macronutrientes.proteinas_g),
    carbs: numberOrZero(record.macronutrientes.carboidratos_g),
    fat: numberOrZero(record.macronutrientes.gorduras_totais_g),
    fiber: numberOrZero(record.macronutrientes.fibras_g),
    sodium: numberOrUndefined(record.macronutrientes.sodio_mg),
    sugar: numberOrUndefined(record.macronutrientes.acucares_g),
    calcium: numberOrUndefined(record.micronutrientes?.calcio_mg),
    iron: numberOrUndefined(record.micronutrientes?.ferro_mg),
    potassium: numberOrUndefined(record.micronutrientes?.potassio_mg),
    magnesium: numberOrUndefined(record.micronutrientes?.magnesio_mg),
    zinc: numberOrUndefined(record.micronutrientes?.zinco_mg),
    vitaminA: numberOrUndefined(record.micronutrientes?.vitamina_A_mcg),
    vitaminC: numberOrUndefined(record.micronutrientes?.vitamina_C_mg),
    vitaminD: numberOrUndefined(record.micronutrientes?.vitamina_D_mcg),
    vitaminE: numberOrUndefined(record.micronutrientes?.vitamina_E_mg),
    vitaminB12: numberOrUndefined(record.micronutrientes?.vitamina_B12_mcg),
    folate: numberOrUndefined(record.micronutrientes?.folato_mcg),
  });
  const ingredientAliases = record.ingredientes?.map((ingredient) => ingredient.nome) ?? [];

  return {
    id: localFoodId('prato', record.id, record.nome),
    name: record.nome,
    emoji: '🍛',
    aliases: aliasesFor([record.nome, record.categoria, record.descricao, ...ingredientAliases]),
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao: nutrition,
      grama: divideNutrition(nutrition, record.porcao_g || 1),
    },
    source: 'json:pratos_feitos_brasileiros',
    category: record.categoria,
    portionReference: `${record.porcao_g}g`,
    ingredients: record.ingredientes,
    originalData: {
      titulo: database.titulo,
      descricao: database.descricao,
      fonte: database.fonte,
      unidade_porcao: database.unidade_porcao,
      legenda_nutrientes: database.legenda_nutrientes,
      referencias_IDR: database.referencias_IDR,
      prato: record,
    },
  };
}

const generalDatabase = generalFoodDatabase as GeneralFoodDatabase;
const preparedDatabase = preparedDishesDatabase as PreparedDishDatabase;

export const LOCAL_FOODS: FoodItem[] = [
  ...generalDatabase.alimentos.map((record) => mapGeneralFood(record, generalDatabase.metadata, generalDatabase.schema)),
  ...preparedDatabase.pratos.map((record) => mapPreparedDish(record, preparedDatabase)),
];

export function isLocalFood(food: Pick<FoodItem, 'source'>) {
  return typeof food.source === 'string' && food.source.startsWith('json:');
}
