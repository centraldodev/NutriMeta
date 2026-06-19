export const AI_LIMIT_TITLE = 'Limite de IA atingido';

export const AI_LIMIT_MESSAGE =
  'Você atingiu o limite de uso da IA por enquanto. Para usar mais análises e cadastros automáticos, será necessário fazer upgrade quando essa opção estiver disponível.';

export function isAiLimitError(error: unknown): boolean {
  const message = String((error as { message?: unknown; code?: unknown })?.message ?? error).toLowerCase();
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  return (
    message.includes('429') ||
    message.includes('quota') ||
    message.includes('rate-limit') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('too many requests') ||
    code.includes('quota') ||
    code.includes('resource-exhausted')
  );
}
