import * as validators from './validators.js';
import type { components } from './internal.js';
type Schemas = components['schemas'];
export class ContractValidationError extends Error {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR';
  constructor() { super('The request payload failed schema validation.'); }
}
export function validateContract<N extends keyof Schemas>(name: N, value: unknown): Schemas[N] {
  const validate = (validators as Record<string, (value: unknown) => boolean>)[`schema_${name}`];
  if (!validate || !validate(value)) throw new ContractValidationError();
  return value as Schemas[N];
}
export async function readContract<N extends keyof Schemas>(request: Request, name: N): Promise<Schemas[N]> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ContractValidationError();
  let value: unknown;
  try { value = await request.json(); } catch { throw new ContractValidationError(); }
  return validateContract(name, value);
}
