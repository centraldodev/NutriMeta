import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';

import { app } from './firebase';
import { QuantityUnit } from '../types';

export type PhotoMealAiItem = {
  foodName: string;
  quantity: number;
  unit: QuantityUnit;
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
        },
        optionalProperties: ['confidence', 'notes'],
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
Nao inclua talheres, pratos, copos, embalagens ou decoracoes.
`;

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
