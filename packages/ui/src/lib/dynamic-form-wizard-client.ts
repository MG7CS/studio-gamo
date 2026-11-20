/**
 * Browser behaviour of the form wizard (`DynamicForm` with `wizard`): one screen at a time, Back and Next,
 * progress, focus and the live announcement. It reads the server-rendered markup contract
 * (`data-wizard`, `data-wizard-screen`, `data-wizard-section`, `data-wizard-single`, `data-wizard-final`,
 * `data-wizard-controls`, `data-wizard-progress`, `data-wizard-status`, `data-wizard-live`,
 * `data-wizard-back`, `data-wizard-next`) and the pure screen rules in `lib/dynamic-form-wizard.ts`.
 *
 * Task 3 fills this module. For now it is a no-op, so the form stays a complete, scroll-through form
 * (the server markup is the no-JavaScript baseline). Must stay idempotent: safe to call twice.
 */

/** Wires every wizard form below `root`. Does nothing until the wizard behaviour is written. */
export function initWizards(root: ParentNode = document): void {
  void root;
}
