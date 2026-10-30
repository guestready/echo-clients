import { domToCanvas } from "modern-screenshot";

import type { ScreenshotOptions } from "./types";

const ALWAYS_MASKED = 'input[type="password"]';
const MAX_BYTES = 9.5 * 1024 * 1024;
const MASK_ATTRIBUTE = "data-echo-masked";
const MASK_COLOR = "#C9CFDA";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Renders the visible part of the page from a DOM clone, so `exclude` (the dialog) never shows up in it. */
export async function capturePage(exclude: Element, options: ScreenshotOptions = {}): Promise<Blob> {
  const selector = options.mask ? `${ALWAYS_MASKED}, ${options.mask}` : ALWAYS_MASKED;
  const masked: Element[] = [];
  const boxes: Box[] = [];
  collectMasked(document, selector, 0, 0, masked, boxes);
  masked.forEach((element) => element.setAttribute(MASK_ATTRIBUTE, ""));
  const scale = options.scale ?? Math.min(window.devicePixelRatio || 1, 2);
  try {
    const page = await domToCanvas(document.documentElement, {
      scale,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      filter: (node) => node !== exclude && !insideMasked(node) && hasCssStyle(node),
      onCloneEachNode: (cloned) => {
        if (cloned instanceof HTMLElement && cloned.hasAttribute(MASK_ATTRIBUTE)) {
          cloned.style.setProperty("color", "transparent", "important");
          cloned.style.setProperty("-webkit-text-fill-color", "transparent", "important");
          // The clone is serialized to SVG, where an input shows its value attribute.
          if (cloned instanceof HTMLInputElement) cloned.setAttribute("value", "");
          if (cloned instanceof HTMLTextAreaElement) cloned.textContent = "";
        }
      },
    });
    return await toBlob(paintBoxes(crop(page, scale), boxes, scale));
  } finally {
    masked.forEach((element) => element.removeAttribute(MASK_ATTRIBUTE));
  }
}

/** Matches in the document, open shadow roots and same-origin iframes, with their viewport boxes. */
function collectMasked(
  root: Document | ShadowRoot,
  selector: string,
  offsetX: number,
  offsetY: number,
  masked: Element[],
  boxes: Box[],
): void {
  for (const element of Array.from(root.querySelectorAll(selector))) {
    const rect = element.getBoundingClientRect();
    masked.push(element);
    boxes.push({ left: rect.left + offsetX, top: rect.top + offsetY, width: rect.width, height: rect.height });
  }
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (element.shadowRoot) collectMasked(element.shadowRoot, selector, offsetX, offsetY, masked, boxes);
    if (element instanceof HTMLIFrameElement) {
      let inner: Document | null = null;
      try {
        inner = element.contentDocument;
      } catch {
        inner = null;
      }
      if (inner) {
        const rect = element.getBoundingClientRect();
        collectMasked(inner, selector, offsetX + rect.left + element.clientLeft, offsetY + rect.top + element.clientTop, masked, boxes);
      }
    }
  }
}

// Some widgets (releasenotes.io's <releases-panel>) replace `style`, and modern-screenshot throws on them.
function hasCssStyle(node: Node): boolean {
  return !(node instanceof HTMLElement) || typeof node.style?.setProperty === "function";
}

function insideMasked(node: Node): boolean {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current instanceof Element && current.hasAttribute(MASK_ATTRIBUTE)) return true;
    current = current instanceof ShadowRoot ? current.host : current.parentNode;
  }
  return false;
}

function crop(page: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(window.innerWidth * scale);
  canvas.height = Math.round(window.innerHeight * scale);
  const left = window.scrollX * scale;
  const top = window.scrollY * scale;
  canvas
    .getContext("2d")
    ?.drawImage(page, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Opaque boxes over every masked element, whatever it renders (images, canvas, video, iframes). */
function paintBoxes(canvas: HTMLCanvasElement, boxes: Box[], scale: number): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context to mask the capture");
  context.fillStyle = MASK_COLOR;
  for (const box of boxes) context.fillRect(box.left * scale, box.top * scale, box.width * scale, box.height * scale);
  return canvas;
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await encode(canvas, "image/png");
  return png.size <= MAX_BYTES ? png : encode(canvas, "image/jpeg", 0.85);
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Empty capture"))), type, quality),
  );
}
