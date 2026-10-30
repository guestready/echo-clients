import type { FeedbackOptions, Ticket, TicketType } from "./types";

export interface Upload {
  upload_id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
}

export interface TicketPayload {
  type: TicketType;
  body: string;
  page_title: string;
  page_url: string;
  attachments: string[];
  context: Record<string, unknown>;
}

export class HostError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(describeErrors(payload) || `Request failed (${status})`);
  }
}

function describeErrors(payload: unknown): string {
  if (Array.isArray(payload)) return payload.map(describeErrors).join(" ");
  if (payload && typeof payload === "object") {
    const entries = Object.entries(payload as Record<string, unknown>);
    if (entries.length === 1 && entries[0]?.[0] === "detail") return describeErrors(entries[0][1]);
    return entries.map(([key, value]) => `${key}: ${describeErrors(value)}`).join("; ");
  }
  return payload == null ? "" : String(payload);
}

export class HostApi {
  constructor(private readonly options: FeedbackOptions) {}

  private async post<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...this.options.headers?.(), ...headers },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new HostError(response.status, payload);
    return payload as T;
  }

  createUpload(file: Blob, filename: string): Promise<Upload> {
    return this.post(this.options.endpoints.uploads, { filename, content_type: file.type, size: file.size });
  }

  createTicket(payload: TicketPayload, idempotencyKey: string): Promise<Ticket> {
    return this.post(this.options.endpoints.tickets, payload, { "Idempotency-Key": idempotencyKey });
  }

  /** PUT straight to the presigned S3 URL: XHR, because fetch reports no upload progress. */
  putFile(upload: Upload, file: Blob, onProgress: (ratio: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(upload.method, upload.url);
      for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
      request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
      request.onload = () =>
        request.status >= 200 && request.status < 300 ? resolve() : reject(new HostError(request.status, null));
      request.onerror = () => reject(new HostError(0, null));
      request.send(file);
    });
  }
}
