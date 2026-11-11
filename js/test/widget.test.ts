import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedbackOptions, FeedbackWidget } from "../src";

const capturePage = vi.fn();
vi.mock("../src/screenshot", () => ({ capturePage: (...args: unknown[]) => capturePage(...args) }));

const { createFeedback } = await import("../src");

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

let calls: Call[];
let puts: { url: string; body: unknown }[];
let ticketStatus: number;
let widget: FeedbackWidget;

class FakeXHR {
  upload: { onprogress?: (event: unknown) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  status = 200;
  private url = "";
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  send(body: unknown) {
    puts.push({ url: this.url, body });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 });
    queueMicrotask(() => this.onload?.());
  }
}

function fakeFetch(url: string, init: RequestInit): Promise<Response> {
  const headers = init.headers as Record<string, string>;
  calls.push({ url, body: JSON.parse(String(init.body)), headers });
  if (url === "/echo/uploads")
    return Promise.resolve(
      Response.json({ upload_id: `up-${calls.length}`, method: "PUT", url: `https://s3.test/${calls.length}`, headers: {} }, { status: 201 }),
    );
  if (ticketStatus === 400)
    return Promise.resolve(Response.json({ attachments: ["Upload up-1 is missing."] }, { status: 400 }));
  return Promise.resolve(Response.json({ ref: "B-1085", type: "bug", status: "new" }, { status: 201 }));
}

function shadow(): ShadowRoot {
  return document.querySelector("echo-feedback")!.shadowRoot!;
}

function el<T extends Element>(selector: string): T {
  return shadow().querySelector(selector) as T;
}

async function submit(): Promise<void> {
  el<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(el<HTMLButtonElement>("[data-submit]").disabled).toBe(false));
}

function setup(overrides: Partial<FeedbackOptions> = {}): FeedbackOptions {
  const options: FeedbackOptions = {
    endpoints: { uploads: "/echo/uploads", tickets: "/echo/tickets" },
    headers: () => ({ "X-CSRFToken": "csrf-1" }),
    page: () => ({ title: "Rental form", url: "https://app.test/rentals/42" }),
    context: () => ({ app_version: "1.2.3" }),
    onSubmitted: vi.fn(),
    ...overrides,
  };
  widget = createFeedback(options);
  return options;
}

beforeEach(() => {
  calls = [];
  puts = [];
  ticketStatus = 201;
  capturePage.mockReset().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  URL.createObjectURL = vi.fn(() => "blob:shot");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  widget.destroy();
  vi.unstubAllGlobals();
});

describe("createFeedback", () => {
  it("captures the page without the dialog, then sends screenshot and ticket through the host", async () => {
    const options = setup();
    await widget.open("bug");
    expect(capturePage).toHaveBeenCalledWith(document.querySelector("echo-feedback"), {});
    expect(el<HTMLDialogElement>("dialog").open).toBe(true);
    expect(shadow().textContent).not.toContain("Page you are coming from");
    expect(el<HTMLInputElement>("[data-shot-include]").checked).toBe(true);

    el<HTMLTextAreaElement>("textarea").value = "Save button does nothing";
    await submit();

    expect(calls.map((call) => call.url)).toEqual(["/echo/uploads", "/echo/tickets"]);
    expect(calls[0]!.body).toEqual({ filename: "screenshot.png", content_type: "image/png", size: 3 });
    expect(puts).toHaveLength(1);
    const ticket = calls[1]!;
    expect(ticket.headers["X-CSRFToken"]).toBe("csrf-1");
    expect(ticket.headers["Idempotency-Key"]).toBeTruthy();
    expect(ticket.body).toMatchObject({
      type: "bug",
      body: "Save button does nothing",
      page_title: "Rental form",
      page_url: "https://app.test/rentals/42",
      attachments: ["up-1"],
      context: { app_version: "1.2.3" },
    });
    expect(el<HTMLElement>("[data-sent-view]").hidden).toBe(false);
    expect(el("[data-sent-body] strong").textContent).toBe("B-1085");
    expect(el<HTMLElement>("[data-head]").hidden).toBe(true);
    expect(options.onSubmitted).toHaveBeenCalledWith({ ref: "B-1085", type: "bug", status: "new" });
  });

  it("refuses a blank message", async () => {
    setup();
    await widget.open();
    await submit();
    expect(calls).toEqual([]);
    expect(el<HTMLElement>("[data-error]").hidden).toBe(false);
  });

  it("leaves the screenshot out when unchecked", async () => {
    setup();
    await widget.open();
    el<HTMLInputElement>("[data-shot-include]").checked = false;
    el<HTMLTextAreaElement>("textarea").value = "Nice";
    await submit();
    expect(calls.map((call) => call.url)).toEqual(["/echo/tickets"]);
    expect(calls[0]!.body.attachments).toEqual([]);
  });

  it("shows the backend error and retries with the same key and fresh uploads", async () => {
    setup();
    await widget.open();
    el<HTMLTextAreaElement>("textarea").value = "Broken";
    ticketStatus = 400;
    await submit();
    expect(el("[data-error]").textContent).toBe("attachments: Upload up-1 is missing.");
    ticketStatus = 201;
    await submit();
    const tickets = calls.filter((call) => call.url === "/echo/tickets");
    expect(tickets[0]!.headers["Idempotency-Key"]).toBe(tickets[1]!.headers["Idempotency-Key"]);
    expect(calls.filter((call) => call.url === "/echo/uploads")).toHaveLength(2);
  });

  it("still sends when the capture fails, and skips it when turned off", async () => {
    capturePage.mockRejectedValueOnce(new Error("tainted"));
    setup();
    await widget.open();
    expect(el<HTMLInputElement>("[data-shot-include]").disabled).toBe(true);
    el<HTMLTextAreaElement>("textarea").value = "Hello";
    await submit();
    expect(calls.map((call) => call.url)).toEqual(["/echo/tickets"]);
    widget.destroy();

    setup({ screenshot: false });
    await widget.open();
    expect(el<HTMLElement>("[data-shot]").hidden).toBe(true);
    expect(capturePage).toHaveBeenCalledTimes(1);
  });

  it("rejects files that are not images or videos", async () => {
    setup();
    await widget.open();
    const input = el<HTMLInputElement>("input[type=file]");
    const pdf = new File(["%PDF"], "invoice.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdf], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(el("[data-error]").textContent).toContain("invoice.pdf");
    expect(el("[data-files]").children).toHaveLength(0);
  });

  it("starts a fresh draft after a successful send, keeps it after a cancel", async () => {
    setup();
    await widget.open();
    el<HTMLTextAreaElement>("textarea").value = "Draft";
    widget.close();
    await widget.open();
    expect(el<HTMLTextAreaElement>("textarea").value).toBe("Draft");
    await submit();
    widget.close();
    await widget.open();
    expect(el<HTMLTextAreaElement>("textarea").value).toBe("");
    expect(el<HTMLElement>("[data-form-view]").hidden).toBe(false);
  });

  it("renders the dialog in the requested language, right to left for Arabic", async () => {
    setup({ locale: "fr-FR" });
    await widget.open();
    expect(el<HTMLElement>("#echo-title").textContent).toBe("Envoyer un retour");
    expect(el<HTMLButtonElement>("[data-submit]").textContent).toBe("Envoyer");
    expect(el<HTMLDialogElement>("dialog").lang).toBe("fr");
    expect(el<HTMLDialogElement>("dialog").dir).toBe("ltr");
    widget.destroy();

    setup({ locale: "ar" });
    expect(el<HTMLDialogElement>("dialog").dir).toBe("rtl");
  });
});
