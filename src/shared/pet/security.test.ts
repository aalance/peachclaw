import { expect, test } from 'vitest';

import { PetPermissionLevel } from './security';
import { classifyPetPermission } from './security';

test('classifyPetPermission blocks forbidden actions', () => {
  expect(classifyPetPermission('browser', { action: 'submit payment' })).toBe(PetPermissionLevel.Forbidden);
  expect(classifyPetPermission('shell', { command: 'disable security software' })).toBe(PetPermissionLevel.Forbidden);
});

test('classifyPetPermission requires repeated confirmation for destructive actions', () => {
  expect(classifyPetPermission('file', { action: 'delete', path: 'report.docx' })).toBe(PetPermissionLevel.AlwaysConfirm);
  expect(classifyPetPermission('email', { action: 'send' })).toBe(PetPermissionLevel.AlwaysConfirm);
});

test('classifyPetPermission allows direct read style actions', () => {
  expect(classifyPetPermission('web_search', { query: 'OpenClaw' })).toBe(PetPermissionLevel.Direct);
});