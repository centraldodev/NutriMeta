#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { PDFParse } = require('pdf-parse');
const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const BASIC_VALUE_COUNT = 11;
const BASIC_FIRST_PAGE = 29;
const BASIC_LAST_PAGE = 67;

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(__dirname, '..');
const pdfPath = path.resolve(rootDir, args.pdf || 'tabela_nutricional_brasileira.pdf');
const dryRun = Boolean(args['dry-run']);
const confirmed = Boolean(args.yes);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF nao encontrado: ${pdfPath}`);
  }

  const foods = await extractFoodsFromPdf(pdfPath);
  const incomplete = foods.filter((food) => food.taco.parseWarnings.length > 0);

  console.log(`PDF: ${path.relative(rootDir, pdfPath)}`);
  console.log(`Alimentos extraidos: ${foods.length}`);
  console.log(`Linhas com celulas ausentes/observacoes: ${incomplete.length}`);

  if (foods.length < 500) {
    throw new Error(`Extracao suspeita: apenas ${foods.length} alimentos encontrados.`);
  }

  if (dryRun) {
    console.log('\nAmostra:');
    foods.slice(0, 5).forEach((food) => {
      console.log(`- ${food.id}: ${food.name} | ${JSON.stringify(food.nutritionPer.grama)}`);
    });
    if (incomplete.length > 0) {
      console.log('\nPrimeiras linhas com avisos:');
      incomplete.slice(0, 10).forEach((food) => {
        console.log(`- ${food.taco.number} ${food.name}: ${food.taco.parseWarnings.join('; ')}`);
      });
    }
    return;
  }

  if (!confirmed) {
    throw new Error('Esta importacao apaga toda a colecao globalFoods. Rode novamente com --yes para confirmar.');
  }

  const db = initializeFirestore();
  await clearCollection(db, 'globalFoods');
  await writeFoods(db, 'globalFoods', foods);

  console.log(`Importacao concluida: globalFoods recriada com ${foods.length} alimentos da TACO.`);
}

async function extractFoodsFromPdf(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const basicRows = new Map();
    const extraRows = new Map();

    for (let page = BASIC_FIRST_PAGE; page <= BASIC_LAST_PAGE; page += 2) {
      const text = await getPageText(parser, page);
      for (const line of dataLines(text)) {
        const row = parseBasicRow(line, page);
        if (row) basicRows.set(row.number, row);
      }
    }

    for (let page = BASIC_FIRST_PAGE + 1; page <= BASIC_LAST_PAGE + 1; page += 2) {
      const text = await getPageText(parser, page);
      for (const line of dataLines(text)) {
        const row = parseExtraRow(line, page);
        if (row) extraRows.set(row.number, row);
      }
    }

    return Array.from(basicRows.values())
      .sort((a, b) => a.number - b.number)
      .map((basic) => makeFoodItem(basic, extraRows.get(basic.number)));
  } finally {
    await parser.destroy();
  }
}

async function getPageText(parser, page) {
  const result = await parser.getText({ partial: [page] });
  return result.text;
}

function dataLines(text) {
  return text
    .split(/\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => /^\d+\s/.test(line));
}

function parseBasicRow(line, page) {
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const number = Number(match[1]);
  const tokens = match[2].split(' ');
  const values = [];

  while (tokens.length > 0 && isTacoValue(tokens[tokens.length - 1])) {
    values.unshift(tokens.pop());
  }

  if (values.length < 7) return null;

  const warnings = [];
  if (values.length !== BASIC_VALUE_COUNT) {
    warnings.push(`Tabela centesimal tem ${values.length}/${BASIC_VALUE_COUNT} valores extraidos na pagina ${page}`);
  }

  const padded = [...values];
  while (padded.length < BASIC_VALUE_COUNT) padded.push(null);

  const [
    moisture,
    kcal,
    kj,
    protein,
    fat,
    cholesterol,
    carbs,
    fiber,
    ashes,
    calcium,
    magnesium,
  ] = padded;

  return {
    number,
    page,
    name: tokens.join(' ').trim(),
    values,
    warnings,
    raw: {
      moisture,
      kcal,
      kj,
      protein,
      fat,
      cholesterol,
      carbs,
      fiber,
      ashes,
      calcium,
      magnesium,
    },
  };
}

function parseExtraRow(line, page) {
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const number = Number(match[1]);
  const values = match[2].split(' ').filter(isTacoValue);
  if (values.length < 5) return null;

  const [
    manganese,
    phosphorus,
    iron,
    sodium,
    potassium,
    copper,
    zinc,
    ...vitaminTokens
  ] = values;

  return {
    number,
    page,
    values,
    raw: {
      manganese,
      phosphorus,
      iron,
      sodium,
      potassium,
      copper,
      zinc,
      vitaminTokens,
    },
  };
}

function makeFoodItem(basic, extra) {
  const name = normalizeName(basic.name);
  const nutrition = removeEmpty({
    kcal: numberValue(basic.raw.kcal) || 0,
    protein: numberValue(basic.raw.protein) || 0,
    carbs: numberValue(basic.raw.carbs) || 0,
    fat: numberValue(basic.raw.fat) || 0,
    fiber: numberValue(basic.raw.fiber) || 0,
    sodium: numberValue(extra?.raw.sodium),
    calcium: numberValue(basic.raw.calcium),
    iron: numberValue(extra?.raw.iron),
    potassium: numberValue(extra?.raw.potassium),
    magnesium: numberValue(basic.raw.magnesium),
    zinc: numberValue(extra?.raw.zinc),
    vitaminC: numberValue(vitaminCValue(extra?.raw.vitaminTokens)),
  });

  return {
    id: customFoodId(name),
    name,
    emoji: emojiForFood(name),
    aliases: aliasesForFood(name),
    defaultUnit: 'grama',
    nutritionPer: {
      grama: divideNutrition(nutrition, 100),
      porcao: nutrition,
    },
    taco: {
      number: basic.number,
      source: 'TACO - Tabela Brasileira de Composicao de Alimentos, 4a edicao, 2011',
      basis: 'Valores por 100 g de parte comestivel',
      pdfPage: basic.page,
      extraPdfPage: extra?.page ?? null,
      rawCentesimal: basic.raw,
      rawMineralsVitamins: extra?.raw ?? null,
      parseWarnings: basic.warnings,
    },
    source: 'taco',
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function initializeFirestore() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = args['project-id'] || readFirebaseProjectId();

    if (serviceAccountJson) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
      } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY precisa conter um JSON valido da service account.');
      }

      initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
    } else {
      if (credentialsPath && !fs.existsSync(credentialsPath)) {
        throw new Error(`Arquivo de credenciais nao encontrado em GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath}`);
      }
      if (credentialsPath) {
        assertServiceAccountFile(credentialsPath);
      }

      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  }
  return getFirestore();
}

function assertServiceAccountFile(filePath) {
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return;
  }

  if (credentials.type === 'service_account' && credentials.client_email && credentials.private_key) {
    return;
  }

  if (credentials.project_info && credentials.client) {
    throw new Error(
      `${filePath} parece ser google-services.json do app Android. ` +
      'Para apagar e recriar globalFoods, use uma chave de service account do Firebase Admin.'
    );
  }
}

async function clearCollection(db, collectionName) {
  let deleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionName).limit(450).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    console.log(`Removidos ${deleted} documentos de ${collectionName}...`);
  }
}

async function writeFoods(db, collectionName, foods) {
  let batch = db.batch();
  let count = 0;

  for (const food of foods) {
    batch.set(db.collection(collectionName).doc(food.id), food);
    count += 1;

    if (count % 450 === 0) {
      await batch.commit();
      console.log(`Gravados ${count}/${foods.length} alimentos...`);
      batch = db.batch();
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }
}

function divideNutrition(nutrition, divisor) {
  const result = {};
  for (const [key, value] of Object.entries(nutrition)) {
    result[key] = round(value / divisor, key === 'kcal' ? 2 : 4);
  }
  return result;
}

function removeEmpty(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
  );
}

function numberValue(value) {
  if (value === 'Tr') return 0;
  if (!value || value === 'NA' || value === '*' || /[a-z]$/i.test(value)) return undefined;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function vitaminCValue(values = []) {
  return values.length >= 8 ? values[7] : undefined;
}

function normalizeName(name) {
  return name.replace(/\s+/g, ' ').trim();
}

function aliasesForFood(name) {
  const lower = name.toLowerCase();
  const normalized = stripAccents(lower);
  const variants = new Set([lower, normalized]);
  const commaParts = lower.split(',').map((part) => part.trim()).filter(Boolean);

  if (commaParts.length > 1) {
    variants.add(`${commaParts[1]} ${commaParts[0]}`);
    variants.add(commaParts.join(' '));
  }

  return Array.from(variants);
}

function customFoodId(name) {
  return `global_${stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'alimento'}`;
}

function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function emojiForFood(name) {
  const text = stripAccents(name.toLowerCase());
  if (/agua|cafe|cha|suco|refrigerante|cerveja|vinho|aguardente|bebida/.test(text)) return '🥤';
  if (/arroz|aveia|biscoito|bolo|pao|macarrao|massa|farinha|milho|trigo|tapioca/.test(text)) return '🌾';
  if (/alface|abobora|batata|cenoura|tomate|couve|brocolis|mandioca|verdura|hortalica|legume/.test(text)) return '🥬';
  if (/banana|maca|laranja|abacaxi|mamao|manga|uva|morango|fruta|goiaba|melancia/.test(text)) return '🍎';
  if (/peixe|atum|sardinha|camarao|pescada|salmao|bacalhau/.test(text)) return '🐟';
  if (/carne|bovina|frango|porco|suina|linguica|presunto|hamburguer|figado/.test(text)) return '🍖';
  if (/leite|queijo|iogurte|manteiga|creme/.test(text)) return '🥛';
  if (/feijao|lentilha|grao-de-bico|soja|amendoim|castanha|noz|semente/.test(text)) return '🫘';
  if (/oleo|azeite|gordura/.test(text)) return '🫒';
  if (/acucar|chocolate|doce|geleia|mel|sorvete/.test(text)) return '🍫';
  return '🍽️';
}

function isTacoValue(value) {
  return /^(?:\d+(?:,\d+)?a?|Tr|NA|\*)$/.test(value);
}

function readFirebaseProjectId() {
  const appJsonPath = path.resolve(rootDir, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  return appJson.expo?.extra?.firebaseProjectId;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      parsed[rawKey] = argv[index + 1];
      index += 1;
    } else {
      parsed[rawKey] = true;
    }
  }

  return parsed;
}
