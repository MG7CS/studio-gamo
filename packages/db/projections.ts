/**
 * Public API projections. Services return Drizzle rows straight into JSON responses whose OpenAPI
 * schemas are closed (`additionalProperties: false`). Columns added by 0012 are not in those contracts
 * (and `users.person_id` must never leave the server), so these helpers return the row without them.
 * A column becomes public only when its owner adds it to `openapi/root.yaml` first and removes it
 * from the list here.
 */
import type { InferSelectModel } from 'drizzle-orm';
import type { users } from './schema.ts';

type UserRow = InferSelectModel<typeof users>;

export const USER_COLUMNS_NOT_IN_CONTRACT = [
  'personId',
  'personLinkOptOutAt',
] as const satisfies readonly (keyof UserRow)[];

export type ContractUser = Omit<UserRow, (typeof USER_COLUMNS_NOT_IN_CONTRACT)[number]>;

function omit<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

export function toContractUser<T extends ContractUser>(row: T): ContractUser {
  return omit(row as T & Partial<UserRow>, USER_COLUMNS_NOT_IN_CONTRACT) as ContractUser;
}
