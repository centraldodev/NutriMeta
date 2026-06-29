import { FoodItem, FoodNutrition, QuantityUnit } from "../../../types";

// Maps Portuguese nutrition keywords to FoodNutrition fields for category-based search
const NUTRITION_CATEGORY_MAP: Record<string, keyof FoodNutrition> = {
  proteina: 'protein',
  proteinas: 'protein',
  protein: 'protein',
  carboidrato: 'carbs',
  carboidratos: 'carbs',
  carbo: 'carbs',
  carbs: 'carbs',
  gordura: 'fat',
  gorduras: 'fat',
  lipidio: 'fat',
  lipidios: 'fat',
  fibra: 'fiber',
  fibras: 'fiber',
  calcio: 'calcium',
  ferro: 'iron',
  sodio: 'sodium',
  sal: 'sodium',
  potassio: 'potassium',
  magnesio: 'magnesium',
  zinco: 'zinc',
  acucar: 'sugar',
  acucares: 'sugar',
  vitamina: 'vitaminC', // fallback; refined below by multi-word
  'vitamina c': 'vitaminC',
  'vitamina d': 'vitaminD',
  'vitamina a': 'vitaminA',
  'vitamina b': 'vitaminB12',
  'vitamina b12': 'vitaminB12',
  folato: 'folate',
  folicos: 'folate',
};

function detectNutritionCategory(normalized: string): (keyof FoodNutrition) | undefined {
  if (NUTRITION_CATEGORY_MAP[normalized]) return NUTRITION_CATEGORY_MAP[normalized];
  const words = new Set(normalized.split(/\s+/));
  // Longest keys first so "vitamina b12" beats "vitamina b" and "vitamina"
  const sortedKeys = Object.keys(NUTRITION_CATEGORY_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const keyWords = key.split(' ');
    if (keyWords.every((kw) => words.has(kw))) return NUTRITION_CATEGORY_MAP[key];
  }
  return undefined;
}

function getNutrientValue(food: FoodItem, field: keyof FoodNutrition): number {
  const nutrition = food.nutritionPer[food.defaultUnit];
  if (!nutrition) return 0;
  const value = nutrition[field];
  return typeof value === 'number' ? value : 0;
}

export const FOOD_MATCH_STOP_WORDS = new Set([
  "com",
  "sem",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "tipo",
  "var",
  "mais",
  "tambem",
  "também",
  "um",
  "uma",
  "dois",
  "duas",
  "tres",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "colher",
  "colheres",
  "sopa",
  "cha",
  "chá",
  "xicara",
  "xícara",
  "copo",
  "garrafa",
  "lata",
  "concha",
  "fatia",
  "file",
  "filé",
  "bife",
  "medio",
  "médio",
  "unidade",
  "unidades",
  "porcao",
  "porção",
  "grama",
  "gramas",
  "quilo",
  "kg",
  "ml",
  "litro",
  "litros",
]);

export const FOOD_SYNONYMS: Record<string, string[]> = {
  cafe: ["cafe", "café", "infusao", "infusão"],
  frances: ["frances", "francês", "trigo"],
  branco: ["tipo", "1", "branco"],
  refri: ["refrigerante", "cola", "guarana", "guaraná"],
  coca: ["refrigerante", "cola"],
  frango: ["frango", "galinha"],
  carne: ["carne", "bovina"],
  leite: ["leite", "vaca", "integral"],
  catupiry: ["requeijao", "cremoso"],
};

export const FOOD_COMPONENT_ALIASES: Record<string, string[]> = {
  catupiry: ["requeijao cremoso"],
};

function editDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[n];
}

export function normalizeFoodText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmussarela\b/g, "mucarela")
    .replace(/\bmozarela\b/g, "mucarela")
    .replace(/\bcatupiri\b/g, "catupiry")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodTokens(value: string): string[] {
  return normalizeFoodText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !FOOD_MATCH_STOP_WORDS.has(token));
}

export function expandFoodTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    FOOD_SYNONYMS[token]?.forEach((synonym) =>
      expanded.add(normalizeFoodText(synonym)),
    );
  });
  return expanded;
}

export function foodSearchText(food: FoodItem) {
  return [food.name, ...(food.aliases ?? [])].join(" ");
}

export function foodMatchScore(query: string, food: FoodItem): number {
  const queryTokens = expandFoodTokens(foodTokens(query));
  if (queryTokens.size === 0) return 0;

  const foodText = normalizeFoodText(foodSearchText(food));
  const targetTokens = expandFoodTokens(foodTokens(foodText));
  const exactText = normalizeFoodText(query);

  if (
    foodText === exactText ||
    food.aliases.some((alias) => normalizeFoodText(alias) === exactText)
  ) {
    return 100;
  }
  if (foodText.includes(exactText) && exactText.length >= 4) {
    return 80 + Math.min(10, exactText.length / 4);
  }

  const targetTokenArr = Array.from(targetTokens);
  let matches = 0;
  queryTokens.forEach((token) => {
    if (targetTokens.has(token)) {
      matches += 1;
    } else if (token.length >= 4) {
      // Fuzzy token match — tolerate 1 typo for short tokens, 2 for longer ones
      const maxDist = token.length >= 7 ? 2 : 1;
      const fuzzy = targetTokenArr.some(
        (t) => editDistance(token, t, maxDist) <= maxDist,
      );
      if (fuzzy) matches += 0.6;
    }
  });

  const coverage = matches / queryTokens.size;
  const extraPenalty = Math.max(0, targetTokens.size - matches) * 0.35;
  const preferredBonus =
    (queryTokens.has("cozido") && targetTokens.has("cozido") ? 4 : 0) +
    (queryTokens.has("cru") && targetTokens.has("cru") ? 4 : 0) +
    (queryTokens.has("assado") && targetTokens.has("assado") ? 4 : 0) +
    (queryTokens.has("grelhado") && targetTokens.has("grelhado") ? 4 : 0);

  return coverage * 70 + matches * 5 + preferredBonus - extraPenalty;
}

export function findBestFood(
  query: string,
  customFoods: FoodItem[] = [],
  minScore = 30,
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;

  const ranked = customFoods
    .map((food) => ({ food, score: foodMatchScore(query, food) }))
    .filter((item) => item.score >= minScore)
    .sort(
      (a, b) => b.score - a.score || a.food.name.length - b.food.name.length,
    );

  return ranked[0]?.food;
}

export function findAnyFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return (
    customFoods.find(
      (food) =>
        normalizeFoodText(food.name) === normalized ||
        food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
    ) ?? findBestFood(query, customFoods)
  );
}

export function findExactFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) =>
      normalizeFoodText(food.name) === normalized ||
      food.aliases.some((alias) => normalizeFoodText(alias) === normalized),
  );
}

export function findLiteralFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  return customFoods.find(
    (food) => normalizeFoodText(food.name) === normalized,
  );
}

export function findContainedFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  if (!normalized) return undefined;
  const tokenCount = foodTokens(normalized).length;
  const matches = customFoods
    .filter((food) => {
      const foodName = normalizeFoodText(food.name);
      if (foodName === normalized) return true;
      if (tokenCount < 2) return false;
      return foodName.includes(normalized);
    })
    .sort((a, b) => a.name.length - b.name.length);
  return matches[0];
}

export function findCompositePartFood(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem | undefined {
  const normalized = normalizeFoodText(query);
  const candidates = [
    normalized,
    ...(FOOD_COMPONENT_ALIASES[normalized] ?? []),
  ];
  for (const candidate of candidates) {
    const food =
      findLiteralFood(candidate, customFoods) ??
      findContainedFood(candidate, customFoods);
    if (food) return food;
  }
  return undefined;
}

export function splitCompositeFoodQuery(query: string): string[] {
  return normalizeFoodText(query)
    .split(
      /\b(?:acompanhado de|acompanhada de|acompanhado|acompanhada|com|e|mais|junto)\b|[,;+&/]/g,
    )
    .map((part) => part.trim())
    .filter((part) => foodTokens(part).length > 0);
}

export function findCompositeFoods(
  query: string,
  customFoods: FoodItem[] = [],
): FoodItem[] {
  const parts = splitCompositeFoodQuery(query);
  if (parts.length < 2) return [];

  const matches: FoodItem[] = [];
  const seen = new Set<string>();

  parts.forEach((part) => {
    const food = findCompositePartFood(part, customFoods);
    if (!food || seen.has(food.id)) return;
    seen.add(food.id);
    matches.push(food);
  });

  return matches.length >= 2 ? matches : [];
}

export function isCompositeFoodQuery(query: string): boolean {
  return splitCompositeFoodQuery(query).length >= 2;
}

export function searchFoods(query: string, customFoods: FoodItem[] = []): FoodItem[] {
  const q = query.trim();
  if (!q) return customFoods;
  const normalized = normalizeFoodText(q);

  // 0. Nutritional category search ("proteína", "rico em fibra", "vitamina c", etc.)
  const categoryField = detectNutritionCategory(normalized);
  if (categoryField) {
    return customFoods
      .filter((food) => getNutrientValue(food, categoryField) > 0)
      .sort((a, b) => getNutrientValue(b, categoryField) - getNutrientValue(a, categoryField))
      .slice(0, 15);
  }

  // 1. Direct name substring match (fastest)
  const directMatches = customFoods
    .filter((food) => normalizeFoodText(food.name).includes(normalized))
    .sort((a, b) => {
      const aName = normalizeFoodText(a.name);
      const bName = normalizeFoodText(b.name);
      const aExact = aName === normalized ? 0 : 1;
      const bExact = bName === normalized ? 0 : 1;
      return aExact - bExact || a.name.length - b.name.length;
    });
  if (directMatches.length > 0) return directMatches;

  // 2. Alias substring match — catches "peito de frango", ingredient names, etc.
  if (normalized.length >= 3) {
    const aliasSubstringMatches = customFoods
      .filter((food) =>
        food.aliases.some((alias) => normalizeFoodText(alias).includes(normalized)),
      )
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, 10);
    if (aliasSubstringMatches.length > 0) return aliasSubstringMatches;
  }

  // 3. FOOD_COMPONENT_ALIASES (catupiry → requeijão, etc.)
  const componentAliasMatches = (FOOD_COMPONENT_ALIASES[normalized] ?? [])
    .map((alias) => findCompositePartFood(alias, customFoods))
    .filter((food): food is FoodItem => Boolean(food));
  if (componentAliasMatches.length > 0) return componentAliasMatches;

  // 4. Composite queries: "arroz e feijão", "frango com batata"
  const compositeMatches = findCompositeFoods(q, customFoods);
  if (compositeMatches.length > 0) return compositeMatches;

  // 5. Fuzzy scoring — handles typos ("frago" → "frango", "fijeoada" → "feijoada")
  if (normalized.length >= 3) {
    const fuzzyResults = customFoods
      .map((food) => ({ food, score: foodMatchScore(q, food) }))
      .filter((item) => item.score >= 18)
      .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
      .slice(0, 8)
      .map((item) => item.food);
    if (fuzzyResults.length > 0) return fuzzyResults;
  }

  return [];
}

export function isWaterFood(food: Pick<FoodItem, "name" | "aliases"> | null): boolean {
  if (!food) return false;
  const terms = [food.name, ...food.aliases].map((term) =>
    term
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  );
  return terms.some((term) => /\bagua\b|\bwater\b/.test(term));
}

export function getWaterMl(
  food: FoodItem | null,
  quantity: number,
  unit: QuantityUnit,
): number | undefined {
  if (!isWaterFood(food)) return undefined;
  if (unit === "litro") return Math.round(quantity * 1000);
  if (unit === "mililitro") return Math.round(quantity);
  if (unit === "xicara") return Math.round(quantity * 200);
  if (unit === "porcao") return Math.round(quantity * 200);
  if (unit === "unidade") return Math.round(quantity * 200);
  return undefined;
}

export function parseQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseOptionalQtyInput(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
