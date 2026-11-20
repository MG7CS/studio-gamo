/**
 * Pure screen rule for the one-question-per-screen form wizard. No DOM, no Astro, no domain import.
 *
 * What lives here
 * - `buildScreens`: decides which questions of a `DynFormSchema` share a screen. Static: it ignores
 *   show-if, so the server-rendered markup is the same for every visitor; the browser hides screens whose
 *   questions are all hidden (see `nextVisibleScreen`).
 * - `isLightQuestion`: the questions short enough to share a screen with others.
 * - `screenItems`: the questions and statements of one screen, in section order (what the markup renders).
 * - `nextVisibleScreen`: steps forward or back past hidden screens.
 * - Browser helpers (pure parts of `lib/dynamic-form-wizard-client.ts`): `visibleScreenIndexes`,
 *   `stepStatusText`, `firstScreenWithError`, `openingScreen`, `resolveScreen`, `stepHash`, `parseStepHash`.
 *
 * Rule: one question per screen by default. Up to `MAX_LIGHT_PER_SCREEN` consecutive light questions of
 * the same section may share a screen. Everything else stands alone. Statements are not answers: they ride
 * with the next question's screen (or the section's last screen when nothing follows) and are not counted.
 * Screens never cross a section. A section with no questions and no statements yields no screens.
 */

import type { DynFormSchema, DynQuestion } from './dynamic-form.ts';

/** Most light questions that may share one screen. */
const MAX_LIGHT_PER_SCREEN = 3;
/** A multiple choice with more options than this is heavy. */
const MAX_LIGHT_CHOICE_OPTIONS = 4;

export interface WizardScreen {
  /** `${sectionId}-${n}`, n counting from 1 within the section. */
  id: string;
  sectionId: string;
  /** Answerable questions shown on this screen (never statements). */
  questionIds: string[];
  /** Statements shown above the questions of this screen. */
  statementIds: string[];
}

/** Short answers that read well beside one another: short text, dropdown, date, time, a small closed choice. */
export function isLightQuestion(q: DynQuestion): boolean {
  switch (q.type) {
    case 'short_text':
    case 'dropdown':
    case 'date':
    case 'time':
      return true;
    case 'multiple_choice':
      return q.options.length <= MAX_LIGHT_CHOICE_OPTIONS && !q.other;
    default:
      return false;
  }
}

/** Splits every section of the form into wizard screens (static; show-if is applied in the browser). */
export function buildScreens(schema: DynFormSchema): WizardScreen[] {
  const screens: WizardScreen[] = [];
  for (const section of schema.sections) {
    const sectionScreens: WizardScreen[] = [];
    let pendingStatements: string[] = [];
    // The screen that may still take another light question.
    let open: WizardScreen | undefined;

    const startScreen = (): WizardScreen => {
      const screen: WizardScreen = {
        id: `${section.id}-${sectionScreens.length + 1}`,
        sectionId: section.id,
        questionIds: [],
        statementIds: [],
      };
      sectionScreens.push(screen);
      return screen;
    };

    for (const question of section.questions) {
      if (question.type === 'statement') {
        pendingStatements.push(question.id);
        continue;
      }
      const light = isLightQuestion(question);
      const target = light && open && open.questionIds.length < MAX_LIGHT_PER_SCREEN ? open : startScreen();
      target.questionIds.push(question.id);
      target.statementIds.push(...pendingStatements);
      pendingStatements = [];
      open = light ? target : undefined;
    }

    if (pendingStatements.length > 0) {
      const last = sectionScreens[sectionScreens.length - 1] ?? startScreen();
      last.statementIds.push(...pendingStatements);
    }
    screens.push(...sectionScreens);
  }
  return screens;
}

/**
 * The questions and statements that belong to `screen`, in the order they appear in `section` (statements
 * ride above the question they precede). Every item of a section is returned by exactly one of its screens.
 */
export function screenItems<Q extends { id: string }>(
  section: { questions: Q[] },
  screen: WizardScreen,
): Q[] {
  const ids = new Set([...screen.statementIds, ...screen.questionIds]);
  return section.questions.filter((q) => ids.has(q.id));
}

/**
 * Index of the nearest screen from `from` (exclusive) in `direction` that is not hidden, or `null` when
 * there is none before the end (or start) of the list.
 */
export function nextVisibleScreen(
  screens: WizardScreen[],
  from: number,
  direction: 1 | -1,
  isHidden: (screen: WizardScreen) => boolean,
): number | null {
  for (let i = from + direction; i >= 0 && i < screens.length; i += direction) {
    const screen = screens[i];
    if (screen && !isHidden(screen)) return i;
  }
  return null;
}

type IsHidden = (screen: WizardScreen) => boolean;

/** Indexes of the screens not hidden by show-if, in order (what the progress marks count). */
export function visibleScreenIndexes(screens: WizardScreen[], isHidden: IsHidden): number[] {
  const out: number[] = [];
  screens.forEach((screen, index) => {
    if (!isHidden(screen)) out.push(index);
  });
  return out;
}

/** The status line and live announcement: "Step 3 of 8" (1-based position among visible screens). */
export function stepStatusText(position: number, total: number): string {
  return `Step ${position} of ${total}`;
}

/**
 * Index of the first screen (not hidden) holding one of `invalidQuestionIds`, or `null`. Hidden screens are
 * skipped: the server ignored their answers, so they cannot carry an error the visitor must fix.
 * `invalidScreenIds` is the fallback for hand-built wizards whose screens carry no question ids: a screen
 * whose own id is listed (it contains an invalid control) counts as holding an error.
 */
export function firstScreenWithError(
  screens: WizardScreen[],
  invalidQuestionIds: Iterable<string>,
  isHidden: IsHidden = () => false,
  invalidScreenIds: Iterable<string> = [],
): number | null {
  const invalid = new Set(invalidQuestionIds);
  const invalidScreens = new Set(invalidScreenIds);
  if (invalid.size === 0 && invalidScreens.size === 0) return null;
  const index = screens.findIndex(
    (s) => !isHidden(s) && (invalidScreens.has(s.id) || s.questionIds.some((id) => invalid.has(id))),
  );
  return index === -1 ? null : index;
}

/**
 * The screen the wizard opens on. After a failed submit: the first screen with an invalid question, or the
 * last visible screen when the errors sit outside every screen (the summary alone: Turnstile, consent).
 * Otherwise the first visible screen. `null` when every screen is hidden.
 */
export function openingScreen(
  screens: WizardScreen[],
  options: {
    isHidden: IsHidden;
    invalidQuestionIds: Iterable<string>;
    /** Ids of screens containing an invalid control (hand-built wizards without question ids). */
    invalidScreenIds?: Iterable<string>;
    hasSummary: boolean;
  },
): number | null {
  const visible = visibleScreenIndexes(screens, options.isHidden);
  if (visible.length === 0) return null;
  const invalid = [...options.invalidQuestionIds];
  const withError = firstScreenWithError(screens, invalid, options.isHidden, options.invalidScreenIds);
  if (withError !== null) return withError;
  if (options.hasSummary || invalid.length > 0) return visible[visible.length - 1] ?? null;
  return visible[0] ?? null;
}

/**
 * `target` when it is a visible screen; otherwise the nearest visible screen before it, else after it
 * (`target` is clamped to the list). `null` when every screen is hidden.
 */
export function resolveScreen(screens: WizardScreen[], target: number, isHidden: IsHidden): number | null {
  if (screens.length === 0) return null;
  const at = Math.min(Math.max(target, 0), screens.length - 1);
  const screen = screens[at];
  if (screen && !isHidden(screen)) return at;
  return nextVisibleScreen(screens, at, -1, isHidden) ?? nextVisibleScreen(screens, at, 1, isHidden);
}

/** The URL fragment of a screen: 0-based index → `#step-{index + 1}`. */
export function stepHash(index: number): string {
  return `#step-${index + 1}`;
}

/** The 0-based screen index of a `#step-n` fragment (n ≥ 1), or `null` for any other fragment. */
export function parseStepHash(hash: string): number | null {
  const match = /^#step-([1-9]\d*)$/.exec(hash);
  return match ? Number(match[1]) - 1 : null;
}

/**
 * Whether the history entry a screen change leaves behind counts as one Next pushed: a push does; a replace
 * overwrites an existing entry, so it keeps that entry's state (in-page Back may still pop it).
 */
export function historyPushedAfter(mode: 'push' | 'replace', previouslyPushed: boolean | undefined): boolean {
  return mode === 'push' || previouslyPushed === true;
}
