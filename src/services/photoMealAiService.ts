import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { FoodNutrition, QuantityUnit } from '../types';
import { normalizeAiNutrition } from './foodNutritionAiService';

export type PhotoMealAiItem = {
  foodName: string;
  emoji?: string;
  quantity: number;
  unit: QuantityUnit;
  nutritionPerUnit?: FoodNutrition;
  confidence?: number;
  notes?: string;
};

export type PhotoMealAiResult = {
  items: PhotoMealAiItem[];
  summary?: string;
};

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

const photoMealSchema = Schema.object({
  properties: {
    summary: Schema.string(),
    items: Schema.array({
      items: Schema.object({
        properties: {
          foodName: Schema.string({
            description: 'Nome curto do alimento em portugues do Brasil.',
          }),
          emoji: Schema.string({
            description: 'Um emoji simples que represente o alimento.',
          }),
          quantity: Schema.number({
            description: 'Quantidade estimada na unidade informada.',
          }),
          unit: Schema.enumString({
            enum: UNIT_VALUES,
            description: 'Unidade mais adequada para estimar a porcao.',
          }),
          confidence: Schema.number({
            description: 'Confianca entre 0 e 1.',
          }),
          notes: Schema.string({
            description: 'Observacao curta sobre incerteza ou preparo.',
          }),
          nutritionPerUnit: Schema.object({
            properties: {
              kcal: Schema.number({
                description: 'Calorias estimadas para 1 unidade da unidade informada.',
              }),
              protein: Schema.number({
                description: 'Proteinas em gramas para 1 unidade da unidade informada.',
              }),
              carbs: Schema.number({
                description: 'Carboidratos em gramas para 1 unidade da unidade informada.',
              }),
              fat: Schema.number({
                description: 'Gorduras em gramas para 1 unidade da unidade informada.',
              }),
              fiber: Schema.number({
                description: 'Fibras em gramas para 1 unidade da unidade informada.',
              }),
              sodium: Schema.number({
                description: 'Sodio em miligramas para 1 unidade da unidade informada.',
              }),
              sugar: Schema.number({
                description: 'Acucares em gramas para 1 unidade da unidade informada.',
              }),
              calcium: Schema.number({
                description: 'Calcio em miligramas para 1 unidade da unidade informada.',
              }),
              iron: Schema.number({
                description: 'Ferro em miligramas para 1 unidade da unidade informada.',
              }),
              potassium: Schema.number({
                description: 'Potassio em miligramas para 1 unidade da unidade informada.',
              }),
              magnesium: Schema.number({
                description: 'Magnesio em miligramas para 1 unidade da unidade informada.',
              }),
              zinc: Schema.number({
                description: 'Zinco em miligramas para 1 unidade da unidade informada.',
              }),
              vitaminA: Schema.number({
                description: 'Vitamina A em mcg RAE para 1 unidade da unidade informada.',
              }),
              vitaminC: Schema.number({
                description: 'Vitamina C em mg para 1 unidade da unidade informada.',
              }),
              vitaminD: Schema.number({
                description: 'Vitamina D em mcg para 1 unidade da unidade informada.',
              }),
              vitaminE: Schema.number({
                description: 'Vitamina E em mg para 1 unidade da unidade informada.',
              }),
              vitaminB12: Schema.number({
                description: 'Vitamina B12 em mcg para 1 unidade da unidade informada.',
              }),
              folate: Schema.number({
                description: 'Folato em mcg para 1 unidade da unidade informada.',
              }),
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
          }),
        },
        optionalProperties: ['emoji', 'confidence', 'notes', 'nutritionPerUnit'],
      }),
    }),
  },
  optionalProperties: ['summary'],
});

const prompt = `
Analise a foto de um prato/refeicao e identifique apenas alimentos visiveis que provavelmente foram consumidos.
Responda em portugues do Brasil.
Use porcoes plausiveis para uma pessoa quando o peso exato nao for evidente.
Prefira nomes simples que existam em bases alimentares comuns, como arroz, feijao, frango grelhado, ovo, banana, salada, macarrao.
Se nao tiver certeza sobre quantidade, estime e reduza a confidence.
Para cada alimento, informe nutritionPerUnit com valores nutricionais estimados para 1 unidade da unidade escolhida. Exemplo: se unit for grama, nutritionPerUnit deve ser por 1 grama; se unit for porcao, deve ser por 1 porcao.
Inclua macros e, quando plausivel, micronutrientes: sodio mg, acucar g, calcio mg, ferro mg, potassio mg, magnesio mg, zinco mg, vitamina A mcg RAE, vitamina C mg, vitamina D mcg, vitamina E mg, vitamina B12 mcg e folato mcg.
Nao inclua talheres, pratos, copos, embalagens ou decoracoes.
`;

function normalizeNutrition(value?: FoodNutrition): FoodNutrition | undefined {
  if (!value) return undefined;
  return normalizeAiNutrition(value);
}

function parseAiResult(text: string): PhotoMealAiResult {
  const parsed = JSON.parse(text) as PhotoMealAiResult;
  return {
    summary: parsed.summary,
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item.foodName && UNIT_VALUES.includes(item.unit))
          .map((item) => ({
            ...item,
            quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
            nutritionPerUnit: normalizeNutrition(item.nutritionPerUnit),
          }))
      : [],
  };
}

export async function analyzeMealPhoto(
  base64Image: string,
  mimeType = 'image/jpeg'
): Promise<PhotoMealAiResult> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: photoMealSchema,
    },
  });

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    },
  ]);

  return parseAiResult(result.response.text());
}
