import { UserProfile } from '../types';

export const PROFILE_LIMITS = {
  age: { min: 13, max: 100 },
  weight: { min: 30, max: 300 },
  heightCm: { min: 120, max: 230 },
};

export function maskAgeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 3);
}

export function maskNameInput(value: string): string {
  return value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, '').replace(/\s{2,}/g, ' ');
}

export function maskWeightInput(value: string): string {
  const normalized = value.replace('.', ',').replace(/[^\d,]/g, '');
  const [integer = '', decimal = ''] = normalized.split(',');
  const safeInteger = integer.replace(/\D/g, '').slice(0, 3);
  const safeDecimal = decimal.replace(/\D/g, '').slice(0, 1);

  if (normalized.includes(',')) {
    return safeDecimal ? `${safeInteger},${safeDecimal}` : `${safeInteger},`;
  }

  return safeInteger;
}

export function maskHeightInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 3);
  if (digits.length <= 1) return digits;
  return `${digits[0]},${digits.slice(1)}`;
}

export function parseProfileNumber(value: string, fallback: number): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseAge(value: string, fallback = 25): number {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseWeightKg(value: string, fallback = 75): number {
  return parseProfileNumber(value, fallback);
}

export function parseHeightCm(value: string, fallback = 170): number {
  const parsed = parseProfileNumber(value, fallback / 100);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed <= 3 ? Math.round(parsed * 100) : Math.round(parsed);
}

export function formatWeightInput(weight?: number): string {
  if (!weight) return '';
  return String(weight).replace('.', ',');
}

export function formatHeightInput(heightCm?: number): string {
  if (!heightCm) return '';
  return (heightCm / 100).toFixed(2).replace('.', ',');
}

export function validateProfileBasics(input: {
  name: string;
  age: string;
  weight: string;
  height: string;
}): string | null {
  const name = input.name.trim();
  const age = parseAge(input.age, 0);
  const weight = parseWeightKg(input.weight, 0);
  const heightCm = parseHeightCm(input.height, 0);

  if (!name || !input.age || !input.weight || !input.height) {
    return 'Preencha nome, idade, peso e altura.';
  }

  if (age < PROFILE_LIMITS.age.min || age > PROFILE_LIMITS.age.max) {
    return `Informe uma idade entre ${PROFILE_LIMITS.age.min} e ${PROFILE_LIMITS.age.max} anos.`;
  }

  if (weight < PROFILE_LIMITS.weight.min || weight > PROFILE_LIMITS.weight.max) {
    return `Informe um peso entre ${PROFILE_LIMITS.weight.min} e ${PROFILE_LIMITS.weight.max} kg.`;
  }

  if (heightCm < PROFILE_LIMITS.heightCm.min || heightCm > PROFILE_LIMITS.heightCm.max) {
    return 'Informe uma altura entre 1,20 m e 2,30 m.';
  }

  return null;
}

export function buildValidatedProfileValues(input: {
  age: string;
  weight: string;
  height: string;
  fallback?: Pick<UserProfile, 'age' | 'weight' | 'height'>;
}) {
  return {
    age: parseAge(input.age, input.fallback?.age ?? 25),
    weight: parseWeightKg(input.weight, input.fallback?.weight ?? 75),
    height: parseHeightCm(input.height, input.fallback?.height ?? 170),
  };
}
