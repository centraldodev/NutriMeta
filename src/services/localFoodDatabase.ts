import generalFoodDatabase from '../.data/base_alimentos_geral_taco_estimativas.json';
import preparedDishesDatabase from '../.data/pratos_feitos_brasileiros.json';
import { FoodItem, FoodNutrition, QuantityUnit } from '../types';

type GeneralFoodRecord = {
  id: string;
  nome: string;
  categoria?: string | null;
  subcategoria?: string | null;
  porcao_referencia?: string | null;
  ingredientes?: { nome: string; quantidade_g?: number }[];
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
    fosforo_mg?: number | null;
    selenio_mcg?: number | null;
    manganes_mg?: number | null;
    cobre_mg?: number | null;
  };
  fonte?: string;
  observacoes?: string;
  tags?: string[];
};

type GeneralFoodDatabase = {
  metadata: Record<string, unknown>;
  schema: Record<string, unknown>;
  alimentos: GeneralFoodRecord[];
};

function localFoodId(prefix: string, rawId: string, name: string) {
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

function amountFromReference(reference?: string | null) {
  const match = (reference ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  const amount = match ? Number(match[1]) : 100;
  return Number.isFinite(amount) && amount > 0 ? amount : 100;
}

function normalizeSearchText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function emojiForFood(record: GeneralFoodRecord) {
  const text = normalizeSearchText(record.nome);

  if (includesAny(text, ['pizza'])) return '🍕';
  if (includesAny(text, ['coxinha', 'pastel', 'empada', 'esfiha', 'kibe', 'risole', 'croquete', 'bolinha de queijo', 'salgado'])) return '🥟';
  if (includesAny(text, ['pao de queijo'])) return '🧀';
  if (includesAny(text, ['pao', 'torrada', 'panetone', 'croissant', 'misto quente', 'bauru', 'sanduiche', 'beirute', 'cachorro-quente', 'hamburguer', 'x-salada', 'x-bacon', 'x-egg', 'x-tudo'])) return '🥪';
  if (includesAny(text, ['macarrao', 'massa', 'lasanha', 'nhoque', 'espaguete'])) return '🍝';
  if (includesAny(text, ['batata frita', 'fritas', 'chips', 'salgadinho', 'nuggets'])) return '🍟';
  if (includesAny(text, ['biscoito agua e sal', 'bolacha maisena', 'cereal matinal', 'barra de cereal'])) return '🌾';
  if (includesAny(text, ['bolo', 'torta', 'quiche'])) return '🍰';
  if (includesAny(text, ['biscoito recheado', 'brigadeiro', 'chocolate', 'cacau', 'bombom', 'doce', 'acucar', 'goiabada', 'sorvete', 'chantilly', 'leite condensado', 'bolacha', 'biscoito'])) return '🍬';
  if (includesAny(text, ['azeitona', 'maionese'])) return '🫒';

  if (includesAny(text, ['agua', 'cha ', 'cha-', 'cafe', 'refrigerante', 'suco', 'vitamina', 'achocolatado', 'caldo de cana'])) return '🥤';
  if (includesAny(text, ['cerveja', 'vinho', 'cachaca', 'caipirinha', 'vodka', 'whisky', 'licor'])) return '🍺';
  if (includesAny(text, ['acai'])) return '🫐';
  if (includesAny(text, ['banana'])) return '🍌';
  if (includesAny(text, ['laranja', 'mexerica', 'tangerina'])) return '🍊';
  if (includesAny(text, ['maca'])) return '🍎';
  if (includesAny(text, ['uva'])) return '🍇';
  if (includesAny(text, ['abacaxi'])) return '🍍';
  if (includesAny(text, ['manga'])) return '🥭';
  if (includesAny(text, ['mamao'])) return '🧡';
  if (includesAny(text, ['morango'])) return '🍓';
  if (includesAny(text, ['melancia'])) return '🍉';
  if (includesAny(text, ['coco', 'leite de coco'])) return '🥥';
  if (includesAny(text, ['fruta', 'goiaba', 'pera', 'pessego', 'ameixa', 'kiwi', 'abacate'])) return '🍎';

  if (includesAny(text, ['alface', 'couve', 'agriao', 'rucula', 'espinafre', 'repolho', 'acelga', 'almeirao', 'chicoria', 'taioba', 'serralha', 'mostarda folha'])) return '🥬';
  if (includesAny(text, ['tomate'])) return '🍅';
  if (includesAny(text, ['cenoura'])) return '🥕';
  if (includesAny(text, ['batata', 'mandioca', 'macaxeira', 'inhame', 'cara', 'mandioquinha', 'batata baroa'])) return '🥔';
  if (includesAny(text, ['abobora', 'moranga'])) return '🎃';
  if (includesAny(text, ['milho', 'pamonha', 'curau', 'canjica', 'cuscuz'])) return '🌽';
  if (includesAny(text, ['brocolis'])) return '🥦';
  if (includesAny(text, ['pimentao', 'pimenta'])) return '🌶️';
  if (includesAny(text, ['cebola', 'alho', 'alho-poro'])) return '🧅';
  if (includesAny(text, ['berinjela'])) return '🍆';
  if (includesAny(text, ['cogumelo', 'champignon'])) return '🍄';
  if (includesAny(text, ['verdura', 'legume', 'hortalica', 'quiabo', 'chuchu', 'vagem', 'pepino', 'beterraba', 'jilo', 'nabo', 'rabanete', 'palmito', 'aspargo', 'alcachofra'])) return '🥬';

  if (includesAny(text, ['arroz', 'risoto', 'galinhada', 'carreteiro', 'baiao', 'yakisoba'])) return '🍚';
  if (includesAny(text, ['feijao', 'lentilha', 'grao de bico', 'ervilha', 'tropeiro', 'tutu', 'virado'])) return '🫘';
  if (includesAny(text, ['tapioca', 'polvilho'])) return '🫓';
  if (includesAny(text, ['farinha', 'farofa', 'aveia', 'granola', 'cereal matinal', 'barra de cereal'])) return '🌾';

  if (includesAny(text, ['frango', 'galinha', 'peru', 'ave'])) return '🍗';
  if (includesAny(text, ['bife', 'carne', 'picanha', 'alcatra', 'contrafile', 'cupim', 'costela bovina', 'file ', 'filet', 'medalhao', 'picadinho', 'rabada', 'mocoto', 'figado', 'bovina', 'boi'])) return '🥩';
  if (includesAny(text, ['porco', 'suino', 'bisteca', 'costelinha', 'lombo', 'bacon', 'paio', 'calabresa', 'linguica', 'presunto', 'mortadela', 'salsicha'])) return '🥓';
  if (includesAny(text, ['peixe', 'tilapia', 'salmao', 'sardinha', 'atum', 'bacalhau', 'merluza', 'robalo', 'badejo'])) return '🐟';
  if (includesAny(text, ['camarao', 'caranguejo', 'marisco', 'lula', 'frutos do mar'])) return '🦐';
  if (includesAny(text, ['ovo', 'omelete'])) return '🥚';

  if (includesAny(text, ['leite', 'iogurte', 'coalhada', 'requeijao', 'creme de leite'])) return '🥛';
  if (includesAny(text, ['queijo', 'mussarela', 'parmesao', 'minas', 'coalho', 'quatro queijos'])) return '🧀';
  if (includesAny(text, ['azeite', 'oleo', 'manteiga', 'margarina', 'gordura', 'maionese'])) return '🫒';
  if (includesAny(text, ['castanha', 'amendoim', 'nozes', 'semente', 'chia', 'linhaca', 'gergelim'])) return '🥜';

  if (includesAny(text, ['sopa', 'caldo', 'canja', 'creme de'])) return '🍲';
  if (includesAny(text, ['salada'])) return '🥗';
  if (includesAny(text, ['moqueca', 'bobo', 'vatapa', 'acaraje', 'tacaca', 'maniçoba', 'manicoba', 'feijoada', 'dobradinha', 'sarapatel', 'barreado', 'vaca atolada', 'escondidinho', 'strogonoff', 'estrogonofe', 'parmegiana', 'panqueca', 'polenta', 'angu', 'canjiquinha', 'empadao'])) return '🍽️';
  if (includesAny(text, ['whey', 'creatina', 'proteina vegetal', 'suplemento'])) return '💪';

  return emojiForCategory(record.categoria);
}

function emojiForCategory(category?: string | null) {
  const text = (category ?? '').toLowerCase();
  if (text.includes('bebida')) return '🥤';
  if (text.includes('fruta')) return '🍎';
  if (text.includes('verdura') || text.includes('legume')) return '🥬';
  if (text.includes('cereal') || text.includes('grão') || text.includes('massa')) return '🌾';
  if (text.includes('leguminosa')) return '🫘';
  if (text.includes('carne') || text.includes('peixe') || text.includes('ovo')) return '🍗';
  if (text.includes('leite') || text.includes('latic')) return '🥛';
  if (text.includes('óleo') || text.includes('gordura')) return '🫒';
  if (text.includes('doce') || text.includes('açúcar')) return '🍬';
  if (text.includes('prato')) return '🍽️';
  return '🍽️';
}

function mapFoodRecord(
  record: GeneralFoodRecord,
  database: GeneralFoodDatabase,
  options: { idPrefix: string; source: string }
): FoodItem {
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
  const referenceAmount = amountFromReference(record.porcao_referencia);
  const ingredientAliases = record.ingredientes?.map((ingredient) => ingredient.nome) ?? [];

  return {
    id: localFoodId(options.idPrefix, record.id, record.nome),
    name: record.nome,
    emoji: emojiForFood(record),
    aliases: aliasesFor([record.nome, record.categoria, record.subcategoria, record.observacoes, ...(record.tags ?? []), ...ingredientAliases]),
    defaultUnit,
    nutritionPer: {
      [defaultUnit]: divideNutrition(nutrition, referenceAmount),
      porcao: nutrition,
    },
    source: options.source,
    category: record.categoria ?? undefined,
    portionReference: record.porcao_referencia ?? undefined,
    ingredients: record.ingredientes,
    originalData: {
      metadata: database.metadata,
      schema: database.schema,
      alimento: record,
    },
  };
}

const generalDatabase = generalFoodDatabase as GeneralFoodDatabase;
const preparedDatabase = preparedDishesDatabase as GeneralFoodDatabase;

export const LOCAL_FOODS: FoodItem[] = [
  ...generalDatabase.alimentos.map((record) => mapFoodRecord(record, generalDatabase, {
    idPrefix: 'alimento',
    source: 'json:base_alimentos_geral_taco_estimativas',
  })),
  ...preparedDatabase.alimentos.map((record) => mapFoodRecord(record, preparedDatabase, {
    idPrefix: 'prato',
    source: 'json:pratos_feitos_brasileiros',
  })),
];

export function isLocalFood(food: Pick<FoodItem, 'source'>) {
  return typeof food.source === 'string' && food.source.startsWith('json:');
}
