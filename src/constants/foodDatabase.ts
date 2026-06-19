import { FoodItem } from '../types';

// ─── Food Database ────────────────────────────────────────────────────────────
// All nutrition values are estimates per common household measure.
// Production version: integrate with TACO (Tabela Brasileira de Composição de Alimentos)
// or USDA FoodData Central API.

export const FOOD_DB: FoodItem[] = [
  // ── Grains & Carbs ──────────────────────────────────────────────────────────
  {
    id: 'arroz_branco',
    name: 'Arroz branco cozido',
    emoji: '🍚',
    aliases: ['arroz', 'arroz branco', 'arroz cozido'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 28,  protein: 0.6, carbs: 6.2,  fat: 0.1, fiber: 0.1 },
      xicara:      { kcal: 205, protein: 4.3, carbs: 44.5, fat: 0.4, fiber: 0.6 },
      grama:       { kcal: 1.3, protein: 0.03,carbs: 0.28, fat: 0.0, fiber: 0.0 },
    },
  },
  {
    id: 'arroz_integral',
    name: 'Arroz integral cozido',
    emoji: '🌾',
    aliases: ['arroz integral'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 30,  protein: 0.7, carbs: 6.5,  fat: 0.2, fiber: 0.4 },
      xicara:      { kcal: 216, protein: 5,   carbs: 45,   fat: 1.8, fiber: 3.5 },
    },
  },
  {
    id: 'pao_integral',
    name: 'Pão integral',
    emoji: '🍞',
    aliases: ['pão', 'pão integral', 'torrada integral'],
    defaultUnit: 'fatia',
    nutritionPer: {
      fatia:  { kcal: 69, protein: 3.1, carbs: 12,  fat: 1,   fiber: 1.9 },
      unidade:{ kcal: 69, protein: 3.1, carbs: 12,  fat: 1,   fiber: 1.9 },
    },
  },
  {
    id: 'pao_frances',
    name: 'Pão francês',
    emoji: '🥖',
    aliases: ['pão francês', 'pão de sal', 'paozinho'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 150, protein: 4.8, carbs: 28, fat: 1.8, fiber: 1.2 },
    },
  },
  {
    id: 'macarrao',
    name: 'Macarrão cozido',
    emoji: '🍝',
    aliases: ['macarrão', 'massa', 'espaguete', 'spaghetti', 'penne'],
    defaultUnit: 'xicara',
    nutritionPer: {
      colher_sopa: { kcal: 22,  protein: 0.8, carbs: 4.4,  fat: 0.1, fiber: 0.2 },
      xicara:      { kcal: 220, protein: 8,   carbs: 43,   fat: 1.3, fiber: 2.5 },
    },
  },
  {
    id: 'aveia',
    name: 'Aveia em flocos',
    emoji: '🥣',
    aliases: ['aveia', 'mingau de aveia'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 55,  protein: 2,   carbs: 9.5, fat: 1.1, fiber: 1.5 },
      xicara:      { kcal: 307, protein: 10.7,carbs: 54,  fat: 5.3, fiber: 8.2 },
      grama:       { kcal: 3.9, protein: 0.14,carbs: 0.66,fat: 0.07,fiber: 0.1 },
    },
  },
  {
    id: 'tapioca',
    name: 'Tapioca',
    emoji: '🫓',
    aliases: ['tapioca', 'goma de tapioca'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade:     { kcal: 160, protein: 0.2, carbs: 39, fat: 0, fiber: 0.2 },
      colher_sopa: { kcal: 35,  protein: 0,   carbs: 8.7,fat: 0, fiber: 0 },
      grama:       { kcal: 2.6, protein: 0,   carbs: 0.64,fat: 0, fiber: 0 },
    },
  },
  {
    id: 'batata_cozida',
    name: 'Batata cozida',
    emoji: '🥔',
    aliases: ['batata', 'batata cozida', 'batata inglesa'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade:     { kcal: 130, protein: 3,   carbs: 30,   fat: 0.1, fiber: 2.2 },
      colher_sopa: { kcal: 22,  protein: 0.5, carbs: 5,    fat: 0,   fiber: 0.4 },
    },
  },
  {
    id: 'batata_doce',
    name: 'Batata-doce cozida',
    emoji: '🍠',
    aliases: ['batata doce', 'batata-doce'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade:     { kcal: 112, protein: 2,   carbs: 26, fat: 0.1, fiber: 3.9 },
      colher_sopa: { kcal: 24,  protein: 0.4, carbs: 5.5,fat: 0,   fiber: 0.8 },
      grama:       { kcal: 0.86,protein: 0.02,carbs: 0.2,fat: 0,   fiber: 0.03 },
    },
  },
  {
    id: 'mandioca',
    name: 'Mandioca cozida',
    emoji: '🥔',
    aliases: ['mandioca', 'aipim', 'macaxeira'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 160, protein: 1.4, carbs: 38, fat: 0.3, fiber: 1.8 },
      colher_sopa: { kcal: 32,  protein: 0.3, carbs: 7.6,fat: 0.1, fiber: 0.4 },
      grama:       { kcal: 1.25,protein: 0.01,carbs: 0.3,fat: 0,   fiber: 0.01 },
    },
  },

  // ── Legumes ──────────────────────────────────────────────────────────────────
  {
    id: 'feijao_carioca',
    name: 'Feijão carioca cozido',
    emoji: '🫘',
    aliases: ['feijão', 'feijao', 'feijão carioca', 'feijão preto', 'feijão cozido'],
    defaultUnit: 'concha',
    nutritionPer: {
      colher_sopa: { kcal: 25,  protein: 1.7, carbs: 4.2,  fat: 0.2, fiber: 1.4 },
      concha:      { kcal: 85,  protein: 5.5, carbs: 14,   fat: 0.6, fiber: 4.5 },
      xicara:      { kcal: 225, protein: 15,  carbs: 40,   fat: 0.9, fiber: 15  },
    },
  },
  {
    id: 'lentilha',
    name: 'Lentilha cozida',
    emoji: '🫘',
    aliases: ['lentilha'],
    defaultUnit: 'concha',
    nutritionPer: {
      colher_sopa: { kcal: 27, protein: 2.1, carbs: 4.5, fat: 0.1, fiber: 1.9 },
      concha:      { kcal: 90, protein: 7,   carbs: 15,  fat: 0.4, fiber: 6.4 },
    },
  },

  // ── Proteins ─────────────────────────────────────────────────────────────────
  {
    id: 'frango_grelhado',
    name: 'Frango grelhado',
    emoji: '🍗',
    aliases: ['frango', 'frango grelhado', 'peito de frango', 'filé de frango', 'file de frango', 'frango assado'],
    defaultUnit: 'file',
    nutritionPer: {
      file:        { kcal: 220, protein: 43,  carbs: 0, fat: 4.8, fiber: 0 },
      bife_pequeno:{ kcal: 130, protein: 25,  carbs: 0, fat: 2.9, fiber: 0 },
      bife_medio:  { kcal: 220, protein: 43,  carbs: 0, fat: 4.8, fiber: 0 },
      bife_grande: { kcal: 330, protein: 64,  carbs: 0, fat: 7.2, fiber: 0 },
      grama:       { kcal: 1.65,protein: 0.32,carbs: 0, fat: 0.04,fiber: 0 },
    },
  },
  {
    id: 'coxa_frango',
    name: 'Coxa de frango assada',
    emoji: '🍗',
    aliases: ['coxa de frango', 'sobrecoxa', 'frango com pele'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 185, protein: 24, carbs: 0, fat: 9, fiber: 0 },
      grama:   { kcal: 2.15,protein: 0.26,carbs: 0, fat: 0.11,fiber: 0 },
    },
  },
  {
    id: 'carne_bovina',
    name: 'Carne bovina grelhada',
    emoji: '🥩',
    aliases: ['carne', 'bife', 'carne bovina', 'carne vermelha', 'alcatra', 'contrafilé', 'patinho'],
    defaultUnit: 'bife_medio',
    nutritionPer: {
      bife_pequeno:{ kcal: 185, protein: 27, carbs: 0, fat: 8.5,  fiber: 0 },
      bife_medio:  { kcal: 280, protein: 40, carbs: 0, fat: 12.5, fiber: 0 },
      bife_grande: { kcal: 420, protein: 60, carbs: 0, fat: 19,   fiber: 0 },
      grama:       { kcal: 2.1, protein: 0.3,carbs: 0, fat: 0.1,  fiber: 0 },
    },
  },
  {
    id: 'carne_moida',
    name: 'Carne moída cozida',
    emoji: '🥩',
    aliases: ['carne moída', 'carne moida', 'patinho moído', 'patinho moido'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 45,  protein: 6, carbs: 0, fat: 2.3, fiber: 0 },
      porcao:      { kcal: 250, protein: 33,carbs: 0, fat: 13,  fiber: 0 },
      grama:       { kcal: 2.5, protein: 0.26,carbs: 0,fat: 0.15,fiber: 0 },
    },
  },
  {
    id: 'ovo',
    name: 'Ovo cozido/mexido',
    emoji: '🥚',
    aliases: ['ovo', 'ovos', 'ovo mexido', 'ovo cozido', 'ovo frito', 'omelete'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 70, protein: 6, carbs: 0.6, fat: 4.8, fiber: 0 },
    },
  },
  {
    id: 'atum_lata',
    name: 'Atum em lata',
    emoji: '🐟',
    aliases: ['atum', 'atum em lata'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 130, protein: 28, carbs: 0, fat: 1.5, fiber: 0 },
      colher_sopa: { kcal: 22,  protein: 4.7,carbs: 0, fat: 0.3, fiber: 0 },
    },
  },
  {
    id: 'tilapia',
    name: 'Tilápia grelhada',
    emoji: '🐠',
    aliases: ['tilápia', 'peixe', 'filé de peixe', 'peixe grelhado'],
    defaultUnit: 'file',
    nutritionPer: {
      file:        { kcal: 180, protein: 37, carbs: 0, fat: 3.5, fiber: 0 },
      bife_medio:  { kcal: 140, protein: 29, carbs: 0, fat: 2.7, fiber: 0 },
    },
  },
  {
    id: 'salmao',
    name: 'Salmão grelhado',
    emoji: '🐟',
    aliases: ['salmão', 'salmao', 'filé de salmão', 'file de salmao'],
    defaultUnit: 'file',
    nutritionPer: {
      file:  { kcal: 240, protein: 34, carbs: 0, fat: 11, fiber: 0 },
      grama: { kcal: 2.1, protein: 0.22,carbs: 0, fat: 0.13,fiber: 0 },
    },
  },
  {
    id: 'sardinha_lata',
    name: 'Sardinha em lata',
    emoji: '🐟',
    aliases: ['sardinha', 'sardinha em lata'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 190, protein: 23, carbs: 0, fat: 10, fiber: 0 },
      colher_sopa: { kcal: 38,  protein: 4.6,carbs: 0, fat: 2,  fiber: 0 },
    },
  },
  {
    id: 'whey_protein',
    name: 'Whey protein',
    emoji: '💪',
    aliases: ['whey', 'whey protein', 'proteína', 'shake de proteína'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:  { kcal: 120, protein: 24, carbs: 3,   fat: 1.5, fiber: 0 },
      colher_sopa: { kcal: 40, protein: 8,  carbs: 1, fat: 0.5, fiber: 0 },
    },
  },

  // ── Vegetables & Salads ───────────────────────────────────────────────────────
  {
    id: 'salada',
    name: 'Salada verde',
    emoji: '🥗',
    aliases: ['salada', 'alface', 'rúcula', 'mix de folhas', 'salada verde'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 20, protein: 1.5, carbs: 3,   fat: 0.2, fiber: 2 },
      colher_sopa: { kcal: 3,  protein: 0.2, carbs: 0.5, fat: 0,   fiber: 0.3 },
    },
  },
  {
    id: 'tomate',
    name: 'Tomate',
    emoji: '🍅',
    aliases: ['tomate'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade:     { kcal: 22, protein: 1,   carbs: 4.8, fat: 0.2, fiber: 1.5 },
      colher_sopa: { kcal: 4,  protein: 0.2, carbs: 0.8, fat: 0,   fiber: 0.2 },
    },
  },
  {
    id: 'brocolis',
    name: 'Brócolis cozido',
    emoji: '🥦',
    aliases: ['brócolis', 'brocolis'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 55,  protein: 4.5, carbs: 11, fat: 0.4, fiber: 5.1 },
      colher_sopa: { kcal: 7,   protein: 0.6, carbs: 1.4,fat: 0.1, fiber: 0.7 },
    },
  },
  {
    id: 'cenoura',
    name: 'Cenoura cozida',
    emoji: '🥕',
    aliases: ['cenoura'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 35, protein: 0.8, carbs: 8,   fat: 0.2, fiber: 2.8 },
      colher_sopa: { kcal: 6,  protein: 0.1, carbs: 1.4, fat: 0,   fiber: 0.5 },
    },
  },
  {
    id: 'abobrinha',
    name: 'Abobrinha cozida',
    emoji: '🥒',
    aliases: ['abobrinha'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 25, protein: 1.8, carbs: 4.5, fat: 0.4, fiber: 1.5 },
      colher_sopa: { kcal: 4,  protein: 0.3, carbs: 0.8, fat: 0.1, fiber: 0.3 },
    },
  },
  {
    id: 'milho',
    name: 'Milho cozido',
    emoji: '🌽',
    aliases: ['milho', 'milho verde'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 18, protein: 0.6, carbs: 4, fat: 0.2, fiber: 0.5 },
      porcao:      { kcal: 98, protein: 3.4, carbs: 21,fat: 1.5, fiber: 2.4 },
    },
  },

  // ── Dairy ────────────────────────────────────────────────────────────────────
  {
    id: 'iogurte_grego',
    name: 'Iogurte grego natural',
    emoji: '🥛',
    aliases: ['iogurte grego', 'iogurte', 'iogurte natural'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:  { kcal: 100, protein: 17, carbs: 6,  fat: 0.7, fiber: 0 },
      colher_sopa: { kcal: 18, protein: 3, carbs: 1, fat: 0.1, fiber: 0 },
    },
  },
  {
    id: 'leite_integral',
    name: 'Leite integral',
    emoji: '🥛',
    aliases: ['leite', 'leite integral'],
    defaultUnit: 'xicara',
    nutritionPer: {
      xicara:    { kcal: 122, protein: 8, carbs: 12, fat: 4.8, fiber: 0 },
      mililitro: { kcal: 0.61,protein: 0.03,carbs: 0.05,fat: 0.02,fiber: 0 },
      litro:     { kcal: 610, protein: 32,carbs: 48, fat: 32,  fiber: 0 },
    },
  },
  {
    id: 'leite_desnatado',
    name: 'Leite desnatado',
    emoji: '🥛',
    aliases: ['leite desnatado'],
    defaultUnit: 'xicara',
    nutritionPer: {
      xicara:    { kcal: 83, protein: 8.3, carbs: 12, fat: 0.2, fiber: 0 },
      mililitro: { kcal: 0.34,protein: 0.03,carbs: 0.05,fat: 0,   fiber: 0 },
      litro:     { kcal: 340,protein: 34,  carbs: 50, fat: 1,   fiber: 0 },
    },
  },
  {
    id: 'queijo_minas',
    name: 'Queijo minas frescal',
    emoji: '🧀',
    aliases: ['queijo', 'queijo minas', 'queijo frescal'],
    defaultUnit: 'fatia',
    nutritionPer: {
      fatia:   { kcal: 70,  protein: 8,   carbs: 1.5, fat: 3.5, fiber: 0 },
      colher_sopa: { kcal: 30, protein: 3.5, carbs: 0.6, fat: 1.5, fiber: 0 },
    },
  },
  {
    id: 'queijo_mucarela',
    name: 'Queijo muçarela',
    emoji: '🧀',
    aliases: ['muçarela', 'mussarela', 'queijo mussarela', 'queijo muçarela'],
    defaultUnit: 'fatia',
    nutritionPer: {
      fatia: { kcal: 86, protein: 6.3, carbs: 0.7, fat: 6.3, fiber: 0 },
      grama: { kcal: 3.1,protein: 0.22,carbs: 0.02,fat: 0.23,fiber: 0 },
    },
  },

  // ── Fruits ──────────────────────────────────────────────────────────────────
  {
    id: 'banana',
    name: 'Banana',
    emoji: '🍌',
    aliases: ['banana', 'banana nanica', 'banana prata'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
    },
  },
  {
    id: 'maca',
    name: 'Maçã',
    emoji: '🍎',
    aliases: ['maçã', 'maça'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 72, protein: 0.4, carbs: 19, fat: 0.2, fiber: 2.4 },
    },
  },
  {
    id: 'laranja',
    name: 'Laranja',
    emoji: '🍊',
    aliases: ['laranja'],
    defaultUnit: 'unidade',
    nutritionPer: {
      unidade: { kcal: 62, protein: 1.2, carbs: 15.4, fat: 0.2, fiber: 3.1 },
    },
  },
  {
    id: 'mamao',
    name: 'Mamão',
    emoji: '🟠',
    aliases: ['mamão', 'mamao', 'mamão papaia', 'mamao papaia'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao: { kcal: 60, protein: 0.9, carbs: 15, fat: 0.2, fiber: 2.5 },
      grama:  { kcal: 0.43,protein: 0.01,carbs: 0.11,fat: 0,   fiber: 0.02 },
    },
  },
  {
    id: 'abacate',
    name: 'Abacate',
    emoji: '🥑',
    aliases: ['abacate', 'avocado'],
    defaultUnit: 'porcao',
    nutritionPer: {
      porcao:      { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7 },
      colher_sopa: { kcal: 32,  protein: 0.4,carbs: 1.7,fat: 2.9,  fiber: 1.3 },
      grama:       { kcal: 1.6, protein: 0.02,carbs: 0.09,fat: 0.15,fiber: 0.07 },
    },
  },

  // ── Fats & Extras ────────────────────────────────────────────────────────────
  {
    id: 'azeite',
    name: 'Azeite de oliva',
    emoji: '🫒',
    aliases: ['azeite', 'azeite de oliva', 'óleo'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0 },
      colher_cha:  { kcal: 40,  protein: 0, carbs: 0, fat: 4.5,  fiber: 0 },
    },
  },
  {
    id: 'amendoim',
    name: 'Amendoim / Pasta de amendoim',
    emoji: '🥜',
    aliases: ['amendoim', 'pasta de amendoim', 'paçoca', 'manteiga de amendoim'],
    defaultUnit: 'colher_sopa',
    nutritionPer: {
      colher_sopa: { kcal: 94,  protein: 4, carbs: 3.5, fat: 8,   fiber: 1 },
      porcao:      { kcal: 280, protein: 12,carbs: 10,  fat: 24,  fiber: 3 },
    },
  },
  {
    id: 'cafe',
    name: 'Café preto',
    emoji: '☕',
    aliases: ['café', 'cafe', 'café preto', 'café com leite'],
    defaultUnit: 'xicara',
    nutritionPer: {
      xicara:    { kcal: 5,    protein: 0.3, carbs: 1,   fat: 0, fiber: 0 },
      mililitro: { kcal: 0.02, protein: 0,   carbs: 0,   fat: 0, fiber: 0 },
      litro:     { kcal: 21,   protein: 1.2, carbs: 4.2, fat: 0, fiber: 0 },
    },
  },
];

// ─── Helper: find food by name/alias ─────────────────────────────────────────

export function findFood(query: string): FoodItem | undefined {
  return searchFoodDatabase(query)[0];
}

export function searchFoodDatabase(query: string): FoodItem[] {
  const q = normalizeSearchText(query);
  if (!q) return FOOD_DB;

  return FOOD_DB
    .map((food) => ({ food, score: getFoodSearchScore(food, q) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name))
    .map((item) => item.food);
}

function getFoodSearchScore(food: FoodItem, query: string): number {
  const terms = [food.name, ...food.aliases].map(normalizeSearchText);

  if (terms.some((term) => term === query)) return 0;
  if (terms.some((term) => term.includes(query) || query.includes(term))) return 1;

  const queryWords = query.split(' ').filter(Boolean);
  if (queryWords.length > 1 && queryWords.every((word) => terms.some((term) => term.includes(word)))) {
    return 2;
  }

  const bestDistance = Math.min(
    ...terms.flatMap((term) => {
      const words = term.split(' ').filter(Boolean);
      return [term, ...words].map((candidate) => levenshtein(query, candidate));
    })
  );

  return bestDistance <= Math.max(1, Math.floor(query.length * 0.25))
    ? 3 + bestDistance
    : 99;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);

  for (let j = 1; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

// ─── Helper: parse voice quantity string ─────────────────────────────────────

export function parseQuantityFromText(text: string): {
  quantity: number;
  unit: import('../types').QuantityUnit;
} {
  const t = text.toLowerCase();

  if (t.includes('colher de sopa') || t.includes('colheres de sopa')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'colher_sopa' };
  }
  if (t.includes('colher de chá') || t.includes('colheres de chá')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'colher_cha' };
  }
  if (t.includes('xícara') || t.includes('xicara') || t.includes('copo')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'xicara' };
  }
  if (t.includes('concha')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'concha' };
  }
  if (t.includes('fatia') || t.includes('fatias')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'fatia' };
  }
  if (t.includes('filé') || t.includes('file')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'file' };
  }
  if (t.includes('bife')) {
    if (t.includes('pequen')) return { quantity: 1, unit: 'bife_pequeno' };
    if (t.includes('grand') || t.includes('gordo')) return { quantity: 1, unit: 'bife_grande' };
    return { quantity: 1, unit: 'bife_medio' };
  }
  if (t.includes('ovo') || t.includes('ovos') || t.includes('unidade')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'unidade' };
  }
  if (t.includes('porção') || t.includes('porcao') || t.includes('porco')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'porcao' };
  }
  if (t.includes('litro') || t.includes('litros')) {
    const n = extractNumber(t) || 1;
    return { quantity: n, unit: 'litro' };
  }
  if (t.includes('ml') || t.includes('mililitro')) {
    const n = extractNumber(t) || 200;
    return { quantity: n, unit: 'mililitro' };
  }
  if (/\b\d+\s*g\b/.test(t) || t.includes('grama')) {
    const n = extractNumber(t) || 100;
    return { quantity: n, unit: 'grama' };
  }

  return { quantity: 1, unit: 'porcao' };
}

function extractNumber(text: string): number | null {
  // Handles written numbers (pt-BR) and digits
  const written: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  };
  for (const [word, num] of Object.entries(written)) {
    if (text.includes(word)) return num;
  }
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// ─── Helper: calculate nutrition from food + quantity ─────────────────────────

export function calculateNutrition(
  food: FoodItem,
  quantity: number,
  unit: import('../types').QuantityUnit
): import('../types').FoodNutrition {
  const base = food.nutritionPer[unit] ?? food.nutritionPer[food.defaultUnit];
  if (!base) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  return {
    kcal:    Math.round(base.kcal    * quantity),
    protein: Math.round(base.protein * quantity * 10) / 10,
    carbs:   Math.round(base.carbs   * quantity * 10) / 10,
    fat:     Math.round(base.fat     * quantity * 10) / 10,
    fiber:   Math.round(base.fiber   * quantity * 10) / 10,
    sodium:  base.sodium  ? Math.round(base.sodium  * quantity) : undefined,
    sugar:   base.sugar   ? Math.round(base.sugar   * quantity * 10) / 10 : undefined,
  };
}

// ─── Unit display labels (Portuguese) ────────────────────────────────────────

export const UNIT_LABELS: Record<import('../types').QuantityUnit, string> = {
  colher_sopa:  'colher(es) de sopa',
  colher_cha:   'colher(es) de chá',
  xicara:       'xícara(s)',
  concha:       'concha(s)',
  fatia:        'fatia(s)',
  unidade:      'unidade(s)',
  porcao:       'porção',
  file:         'filé',
  bife_pequeno: 'bife pequeno',
  bife_medio:   'bife médio',
  bife_grande:  'bife grande',
  mililitro:    'ml',
  litro:        'litro(s)',
  grama:        'g',
};
