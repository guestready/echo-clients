export type TicketType = "feedback" | "bug" | "request";

export interface Ticket {
  ref: string;
  type: TicketType;
  status: string;
}

export interface Page {
  title: string;
  url: string;
}

export interface TypeLabels {
  tab: string;
  label: string;
  placeholder: string;
}

export interface Labels {
  title: string;
  subtitle: string;
  types: Record<TicketType, TypeLabels>;
  addScreenshot: string;
  screenshot: string;
  screenshotHint: string;
  capturing: string;
  captureFailed: string;
  retake: string;
  viewScreenshot: string;
  files: string;
  optional: string;
  chooseFiles: string;
  filesHint: string;
  remove: string;
  submit: string;
  sending: string;
  cancel: string;
  close: string;
  blankBody: string;
  tooLarge: string;
  unsupported: string;
  tooMany: string;
  failed: string;
  sentTitle: string;
  sentBody: string;
  sendAnother: string;
}

export interface ScreenshotOptions {
  /** Elements matching this selector are blanked in the capture (passwords always are). */
  mask?: string;
  /** Pixel ratio of the capture; defaults to min(devicePixelRatio, 2). */
  scale?: number;
  /** Gives up after this many milliseconds; defaults to 15000. */
  timeout?: number;
  /** Refuses to capture a page with more elements than this; defaults to 30000. */
  maxElements?: number;
}

export interface FeedbackOptions {
  /** Your backend's endpoints (echo_client.django.feedback_urls), never Echo itself. */
  endpoints: { uploads: string; tickets: string };
  /** Extra request headers, for example a CSRF token. Called on every request. */
  headers?: () => Record<string, string>;
  /** Defaults to the page's first h1 (or document.title) and location.href. */
  page?: () => Page;
  /** Merged into the ticket context; your backend adds its own trusted fields on top. */
  context?: () => Record<string, unknown>;
  /** Taken only when the user clicks "Add a screenshot". Pass false to hide that option. */
  screenshot?: false | ScreenshotOptions;
  /** Language of the built-in labels, e.g. "fr" or "pt-BR"; defaults to <html lang>, then the browser language, then English. */
  locale?: string;
  labels?: Partial<Omit<Labels, "types">> & { types?: Partial<Record<TicketType, Partial<TypeLabels>>> };
  /** Screenshot included; defaults to 5. */
  maxFiles?: number;
  onSubmitted?: (ticket: Ticket) => void;
  /** Where the dialog host is appended; defaults to document.body. */
  container?: HTMLElement;
}

export interface FeedbackWidget {
  /** Shows the dialog. */
  open(type?: TicketType): Promise<void>;
  close(): void;
  destroy(): void;
}
