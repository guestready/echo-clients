import type { FeedbackOptions, Labels } from "./types";

export const DEFAULT_LABELS: Labels = {
  title: "Send feedback",
  subtitle: "Tell us what is working, what is missing, or what is broken.",
  types: {
    feedback: {
      tab: "Product feedback",
      label: "Your feedback",
      placeholder: "What do you like, dislike, or find confusing?",
    },
    bug: {
      tab: "Bug report",
      label: "What went wrong?",
      placeholder: "What happened, what did you expect, and how can we reproduce it?",
    },
    request: {
      tab: "Feature request",
      label: "What would you like us to build?",
      placeholder: "Describe the feature and the problem it would solve for you.",
    },
  },
  screenshot: "Include a screenshot of this page",
  screenshotHint: "Check it does not show anything private before sending.",
  capturing: "Taking a screenshot...",
  captureFailed: "The screenshot could not be taken. You can still attach a file.",
  retake: "Retake",
  viewScreenshot: "Open the screenshot full size",
  files: "Photos or videos",
  optional: "(optional)",
  chooseFiles: "Choose files or drag them here",
  filesHint: "Images up to 10 MB. Videos up to 500 MB are compressed automatically.",
  remove: "Remove",
  submit: "Submit",
  sending: "Sending...",
  cancel: "Cancel",
  close: "Close",
  blankBody: "Please describe your feedback before submitting.",
  tooLarge: "is too large.",
  unsupported: "is not an image or a video.",
  tooMany: "You can attach up to {max} files.",
  failed: "Your feedback could not be sent. Please try again.",
  sentTitle: "Thanks for your feedback",
  sentBody: "Sent as {ref}. The product team will review it.",
  sendAnother: "Send another",
};

export function mergeLabels(overrides: FeedbackOptions["labels"] = {}): Labels {
  const { types = {}, ...rest } = overrides;
  return {
    ...DEFAULT_LABELS,
    ...rest,
    types: {
      feedback: { ...DEFAULT_LABELS.types.feedback, ...types.feedback },
      bug: { ...DEFAULT_LABELS.types.bug, ...types.bug },
      request: { ...DEFAULT_LABELS.types.request, ...types.request },
    },
  };
}
