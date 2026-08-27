export const PetPermissionLevel = {
  Direct: 'direct',
  FirstConfirm: 'first_confirm',
  AlwaysConfirm: 'always_confirm',
  Forbidden: 'forbidden',
} as const;
export type PetPermissionLevel = typeof PetPermissionLevel[keyof typeof PetPermissionLevel];

const forbiddenPatterns = [
  /pay|payment|transfer|wire/i,
  /password|credential|secret|private[_-]?key/i,
  /disable.*(security|defender|antivirus)/i,
  /publish.*public|post.*public/i,
] as const;

const alwaysConfirmPatterns = [
  /delete|remove|unlink|rmdir|rm\s/i,
  /overwrite|replace/i,
  // The tool name and the serialised input are concatenated, so word order is
  // not guaranteed: `email {"action":"send"}` puts the verb after the noun and
  // the previous /send.*(email|message)/ never matched it — outbound mail was
  // classified Direct and skipped confirmation entirely. Match the verb alone.
  /\bsend\b|upload/i,
  /install|plugin/i,
  /calendar/i,
] as const;

const firstConfirmPatterns = [
  /write|edit|create|mkdir/i,
  /open.*browser|reminder/i,
] as const;

export const classifyPetPermission = (toolName: string, toolInput: unknown): PetPermissionLevel => {
  const text = `${toolName} ${JSON.stringify(toolInput ?? {})}`;
  if (forbiddenPatterns.some(pattern => pattern.test(text))) {
    return PetPermissionLevel.Forbidden;
  }
  if (alwaysConfirmPatterns.some(pattern => pattern.test(text))) {
    return PetPermissionLevel.AlwaysConfirm;
  }
  if (firstConfirmPatterns.some(pattern => pattern.test(text))) {
    return PetPermissionLevel.FirstConfirm;
  }
  return PetPermissionLevel.Direct;
};