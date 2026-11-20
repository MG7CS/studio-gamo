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
