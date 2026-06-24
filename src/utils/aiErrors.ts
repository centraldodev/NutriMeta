import { Alert, Platform } from 'react-native';

export const AI_LIMIT_TITLE = 'Limite de IA atingido';

export const AI_LIMIT_MESSAGE =
  'A IA não está disponível agora por limite temporário do serviço. Tente novamente mais tarde.';

export function showAiLimitAlert(message = AI_LIMIT_MESSAGE) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`${AI_LIMIT_TITLE}\n\n${message}`);
    return;
  }

  Alert.alert(AI_LIMIT_TITLE, message);
}

export function isAiLimitError(error: unknown): boolean {
  const message = String((error as { message?: unknown; code?: unknown })?.message ?? error).toLowerCase();
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  return (
    message.includes('429') ||
    message.includes('quota exceeded') ||
    message.includes('quota_exceeded') ||
    message.includes('rate-limit') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('too many requests') ||
    code.includes('resource-exhausted') ||
    code.includes('resource_exhausted') ||
    code === '429'
  );
}
