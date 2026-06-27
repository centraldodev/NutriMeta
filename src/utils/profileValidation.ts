import { UserProfile } from '../types';

export const PROFILE_LIMITS = {
  age: { min: 13, max: 100 },
  weight: { min: 30, max: 300 },
  heightCm: { min: 120, max: 230 },
};

export function maskAgeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 3);
}

export function maskBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
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

export function birthDateFromAge(age: number, now = new Date()): string {
  const safeAge = Math.max(PROFILE_LIMITS.age.min, Math.min(PROFILE_LIMITS.age.max, Math.round(age || 25)));
  const year = now.getFullYear() - safeAge;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeBirthDateInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function birthDateToDate(value?: string): Date {
  const normalized = value ? normalizeBirthDateInput(value) : '';
  if (!normalized) return new Date(1995, 0, 1);
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateToBirthDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBirthDateInput(value?: string): string {
  if (!value) return '';
  const normalized = normalizeBirthDateInput(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function calculateAgeFromBirthDate(value: string, now = new Date()): number {
  const normalized = normalizeBirthDateInput(value);
  if (!normalized) return 0;
  const [year, month, day] = normalized.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > now
  ) {
    return 0;
  }
  let age = now.getFullYear() - year;
  const birthdayPassed =
    now.getMonth() > month - 1 ||
    (now.getMonth() === month - 1 && now.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age;
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
  age?: string;
  birthDate?: string;
  weight: string;
  height: string;
}): string | null {
  const name = input.name.trim();
  const age = input.birthDate
    ? calculateAgeFromBirthDate(input.birthDate)
    : parseAge(input.age ?? '', 0);
  const weight = parseWeightKg(input.weight, 0);
  const heightCm = parseHeightCm(input.height, 0);

  if (!name || (!input.birthDate && !input.age) || !input.weight || !input.height) {
    return 'Preencha nome, data de nascimento, peso e altura.';
  }

  if (age < PROFILE_LIMITS.age.min || age > PROFILE_LIMITS.age.max) {
    return `Informe uma data de nascimento válida para idade entre ${PROFILE_LIMITS.age.min} e ${PROFILE_LIMITS.age.max} anos.`;
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
  age?: string;
  birthDate?: string;
  weight: string;
  height: string;
  fallback?: Pick<UserProfile, 'age' | 'birthDate' | 'weight' | 'height'>;
}) {
  const birthDate = input.birthDate
    ? normalizeBirthDateInput(input.birthDate)
    : input.fallback?.birthDate;
  const age = birthDate
    ? calculateAgeFromBirthDate(birthDate)
    : parseAge(input.age ?? '', input.fallback?.age ?? 25);
  return {
    age,
    birthDate,
    weight: parseWeightKg(input.weight, input.fallback?.weight ?? 75),
    height: parseHeightCm(input.height, input.fallback?.height ?? 170),
  };
}
