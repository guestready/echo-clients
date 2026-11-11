import { LOCALES, type Locale } from "./locales";
import type { FeedbackOptions, Labels } from "./types";

export const DEFAULT_LABELS: Labels = LOCALES.en;

export function mergeLabels(overrides: FeedbackOptions["labels"] = {}, locale: Locale = "en"): Labels {
  const base = LOCALES[locale];
  const { types = {}, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    types: {
      feedback: { ...base.types.feedback, ...types.feedback },
      bug: { ...base.types.bug, ...types.bug },
      request: { ...base.types.request, ...types.request },
    },
  };
}
