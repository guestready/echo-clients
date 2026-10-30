import { HostApi, HostError } from "./api";
import { mergeLabels } from "./labels";
import { capturePage } from "./screenshot";
import { STYLES } from "./styles";
import type { FeedbackOptions, FeedbackWidget, Labels, Page, Ticket, TicketType } from "./types";

const TYPES: TicketType[] = ["feedback", "bug", "request"];
const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * MB;
const MAX_VIDEO_BYTES = 500 * MB;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/heic,.heic,video/mp4,video/quicktime,video/webm";

interface Attachment {
  file: Blob;
  name: string;
  uploadId?: string;
  row?: HTMLLIElement;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function defaultPage(): Page {
  const heading = document.querySelector("h1")?.textContent?.trim();
  return { title: heading || document.title, url: location.href };
}

function defaultContext(): Record<string, unknown> {
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
    user_agent: navigator.userAgent.slice(0, 300),
  };
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createFeedback(options: FeedbackOptions): FeedbackWidget {
  const labels: Labels = mergeLabels(options.labels);
  const api = new HostApi(options);
  const maxFiles = options.maxFiles ?? 5;

  const host = document.createElement("echo-feedback");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLES}</style>${template(labels)}`;
  (options.container ?? document.body).appendChild(host);

  const $ = <T extends Element>(selector: string): T => root.querySelector(selector) as T;
  const dialog = $<HTMLDialogElement>("dialog");
  const form = $<HTMLFormElement>("form");
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-type]"));
  const bodyLabel = $<HTMLLabelElement>("[data-body-label]");
  const body = $<HTMLTextAreaElement>("textarea");
  const shotSection = $<HTMLElement>("[data-shot]");
  const shotPreview = $<HTMLElement>("[data-shot-preview]");
  const shotInclude = $<HTMLInputElement>("[data-shot-include]");
  const fileInput = $<HTMLInputElement>("input[type=file]");
  const drop = $<HTMLLabelElement>("[data-drop]");
  const fileList = $<HTMLUListElement>("[data-files]");
  const error = $<HTMLParagraphElement>("[data-error]");
  const submit = $<HTMLButtonElement>("[data-submit]");
  const formView = $<HTMLElement>("[data-form-view]");
  const sentView = $<HTMLElement>("[data-sent-view]");
  const head = $<HTMLElement>("[data-head]");
  const sentBody = $<HTMLParagraphElement>("[data-sent-body]");

  let type: TicketType = "feedback";
  let page: Page = defaultPage();
  let key = newKey();
  let files: Attachment[] = [];
  let shot: Attachment | null = null;
  let shotUrl = "";
  let sending = false;
  let sent = false;

  function selectType(next: TicketType): void {
    type = next;
    for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.type === next));
    bodyLabel.textContent = labels.types[next].label;
    body.placeholder = labels.types[next].placeholder;
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = !message;
  }

  function setShot(blob: Blob | null): void {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = blob ? URL.createObjectURL(blob) : "";
    shot = blob ? { file: blob, name: blob.type === "image/png" ? "screenshot.png" : "screenshot.jpg" } : null;
    shotPreview.replaceChildren();
    if (blob) {
      const link = document.createElement("a");
      link.href = shotUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = labels.viewScreenshot;
      const image = document.createElement("img");
      image.src = shotUrl;
      image.alt = labels.screenshot;
      link.appendChild(image);
      shotPreview.appendChild(link);
    } else {
      shotPreview.textContent = labels.captureFailed;
    }
    shotInclude.disabled = !blob;
    shotInclude.checked = Boolean(blob);
  }

  async function takeScreenshot(): Promise<void> {
    if (options.screenshot === false) return;
    shotInclude.disabled = true;
    shotPreview.textContent = labels.capturing;
    try {
      setShot(await capturePage(host, options.screenshot ?? {}));
    } catch {
      setShot(null);
    }
  }

  function renderFiles(): void {
    fileList.replaceChildren(
      ...files.map((item, index) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = item.name;
        const bar = document.createElement("span");
        bar.className = "bar";
        bar.hidden = !sending;
        bar.appendChild(document.createElement("span"));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "link";
        remove.textContent = labels.remove;
        remove.disabled = sending;
        remove.addEventListener("click", () => {
          files.splice(index, 1);
          renderFiles();
        });
        row.append(name, bar, remove);
        item.row = row;
        return row;
      }),
    );
  }

  function addFiles(list: FileList | null): void {
    const problems: string[] = [];
    for (const file of Array.from(list ?? [])) {
      const video = file.type.startsWith("video/");
      if (!video && !file.type.startsWith("image/")) problems.push(`${file.name} ${labels.unsupported}`);
      else if (file.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) problems.push(`${file.name} ${labels.tooLarge}`);
      else if (files.length + (shot && shotInclude.checked ? 1 : 0) >= maxFiles)
        problems.push(labels.tooMany.replace("{max}", String(maxFiles)));
      else files.push({ file, name: file.name });
    }
    fileInput.value = "";
    showError([...new Set(problems)].join(" "));
    renderFiles();
  }

  function setProgress(item: Attachment, ratio: number): void {
    const bar = item.row?.querySelector<HTMLElement>(".bar span");
    if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
  }

  function setSending(value: boolean): void {
    sending = value;
    submit.disabled = value;
    submit.textContent = value ? labels.sending : labels.submit;
    renderFiles();
  }

  async function send(): Promise<void> {
    if (sending) return;
    const text = body.value.trim();
    if (!text) {
      showError(labels.blankBody);
      body.focus();
      return;
    }
    showError("");
    setSending(true);
    const attachments = [...(shot && shotInclude.checked ? [shot] : []), ...files];
    try {
      const uploadIds: string[] = [];
      for (const item of attachments) {
        if (!item.uploadId) {
          const upload = await api.createUpload(item.file, item.name);
          await api.putFile(upload, item.file, (ratio) => setProgress(item, ratio));
          item.uploadId = upload.upload_id;
        }
        uploadIds.push(item.uploadId);
      }
      const ticket: Ticket = await api.createTicket(
        {
          type,
          body: text,
          page_title: page.title.slice(0, 255),
          page_url: page.url,
          attachments: uploadIds,
          context: { ...defaultContext(), ...options.context?.() },
        },
        key,
      );
      sent = true;
      const [before = "", ...after] = labels.sentBody.split("{ref}");
      const ref = document.createElement("strong");
      ref.textContent = ticket.ref;
      sentBody.replaceChildren(before, ref, after.join(ticket.ref));
      head.hidden = true;
      formView.hidden = true;
      sentView.hidden = false;
      options.onSubmitted?.(ticket);
    } catch (failure) {
      if (failure instanceof HostError && failure.status === 400) {
        // A refused upload cannot be claimed again: the next try uploads every file afresh.
        for (const item of attachments) item.uploadId = undefined;
        showError(failure.message);
      } else {
        showError(labels.failed);
      }
    } finally {
      setSending(false);
    }
  }

  function reset(): void {
    form.reset();
    files = [];
    key = newKey();
    sent = false;
    formView.hidden = false;
    sentView.hidden = true;
    head.hidden = false;
    showError("");
    selectType("feedback");
    renderFiles();
  }

  for (const tab of tabs) tab.addEventListener("click", () => selectType(tab.dataset.type as TicketType));
  fileInput.addEventListener("change", () => addFiles(fileInput.files));
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    addFiles(event.dataTransfer?.files ?? null);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void send();
  });
  $<HTMLButtonElement>("[data-retake]").addEventListener("click", () => void takeScreenshot());
  $<HTMLButtonElement>("[data-another]").addEventListener("click", () => {
    reset();
    void takeScreenshot();
    body.focus();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-close]"))
    button.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => sending && event.preventDefault());
  shotSection.hidden = options.screenshot === false;

  return {
    async open(initial?: TicketType) {
      if (dialog.open) return;
      if (sent) reset();
      if (initial && TYPES.includes(initial)) selectType(initial);
      page = options.page?.() ?? defaultPage();
      const capture = takeScreenshot();
      dialog.showModal();
      body.focus();
      await capture;
    },
    close() {
      dialog.close();
    },
    destroy() {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      host.remove();
    },
  };
}

function template(labels: Labels): string {
  const tabs = TYPES.map(
    (value) =>
      `<button type="button" role="tab" class="tab" data-type="${value}" aria-selected="${value === "feedback"}">${escape(labels.types[value].tab)}</button>`,
  ).join("");
  return `
<dialog aria-labelledby="echo-title">
  <form novalidate>
    <div class="head" data-head>
      <div>
        <h2 id="echo-title">${escape(labels.title)}</h2>
        <p class="subtitle">${escape(labels.subtitle)}</p>
      </div>
      <button type="button" class="icon-button" data-close aria-label="${escape(labels.close)}">&times;</button>
    </div>
    <div data-form-view>
      <div role="tablist" class="tabs">${tabs}</div>
      <label class="label" for="echo-body" data-body-label>${escape(labels.types.feedback.label)}</label>
      <textarea id="echo-body" required placeholder="${escape(labels.types.feedback.placeholder)}"></textarea>
      <div class="shot" data-shot>
        <div class="shot-preview" data-shot-preview></div>
        <div class="shot-body">
          <label class="check"><input type="checkbox" data-shot-include> ${escape(labels.screenshot)}</label>
          <p class="hint">${escape(labels.screenshotHint)}</p>
          <button type="button" class="link" data-retake>${escape(labels.retake)}</button>
        </div>
      </div>
      <p class="label">${escape(labels.files)} <small>${escape(labels.optional)}</small></p>
      <label class="drop" data-drop>
        <input class="sr-only" type="file" multiple accept="${ACCEPT}">
        <strong>${escape(labels.chooseFiles)}</strong>
        <span>${escape(labels.filesHint)}</span>
      </label>
      <ul class="files" data-files></ul>
      <p class="error" role="alert" data-error hidden></p>
      <div class="foot">
        <button type="button" class="button" data-close>${escape(labels.cancel)}</button>
        <button type="submit" class="button primary" data-submit>${escape(labels.submit)}</button>
      </div>
    </div>
    <div class="sent" data-sent-view hidden>
      <button type="button" class="icon-button sent-close" data-close aria-label="${escape(labels.close)}">&times;</button>
      <span class="sent-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <h2>${escape(labels.sentTitle)}</h2>
      <p data-sent-body></p>
      <div class="sent-actions">
        <button type="button" class="button" data-another>${escape(labels.sendAnother)}</button>
        <button type="button" class="button primary" data-close>${escape(labels.close)}</button>
      </div>
    </div>
  </form>
</dialog>`;
}
