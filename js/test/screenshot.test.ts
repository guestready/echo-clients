import { beforeEach, expect, it, vi } from "vitest";

const domToCanvas = vi.fn();
vi.mock("modern-screenshot", () => ({ domToCanvas: (...args: unknown[]) => domToCanvas(...args) }));

const { capturePage } = await import("../src/screenshot");
const fillRect = vi.fn();

beforeEach(() => {
  document.body.innerHTML = `
    <main><p id="public">Hello</p>
      <section data-private id="private"><span id="secret">IBAN FR76...</span></section>
      <input id="password" type="password" value="hunter2">
    </main>
    <echo-feedback id="host"></echo-feedback>`;
  fillRect.mockReset();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), fillRect })) as never;
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string) {
    callback(new Blob(["x"], { type: type ?? "image/png" }));
  };
  domToCanvas.mockReset().mockResolvedValue(document.createElement("canvas"));
});

it("excludes the dialog host, blanks masked elements and cleans up after itself", async () => {
  const host = document.getElementById("host")!;
  const blob = await capturePage(host, { mask: "[data-private]" });
  expect(blob.type).toBe("image/png");

  const options = domToCanvas.mock.calls[0]![1];
  const node = (id: string) => document.getElementById(id)!;
  expect(options.filter(host)).toBe(false);
  expect(options.filter(node("public"))).toBe(true);
  expect(options.filter(node("secret"))).toBe(true);

  // filter runs during the capture, while the mask attributes are still set.
  domToCanvas.mockImplementationOnce(async (_root: Node, opts: { filter: (n: Node) => boolean; onCloneEachNode: (n: Node) => void }) => {
    expect(opts.filter(node("secret"))).toBe(false);
    expect(opts.filter(node("private"))).toBe(true);
    const clone = node("password").cloneNode(true) as HTMLInputElement;
    clone.setAttribute("value", "hunter2");
    opts.onCloneEachNode(clone);
    expect(clone.getAttribute("value")).toBe("");
    expect(clone.style.getPropertyValue("color")).toBe("transparent");
    return document.createElement("canvas");
  });
  await capturePage(host, { mask: "[data-private]" });
  expect(document.querySelectorAll("[data-echo-masked]")).toHaveLength(0);
});

it("skips elements whose style was replaced by a third-party widget", async () => {
  const panel = document.createElement("releases-panel");
  Object.defineProperty(panel, "style", { value: () => undefined });
  document.body.appendChild(panel);
  await capturePage(document.getElementById("host")!);
  const options = domToCanvas.mock.calls[0]![1];
  expect(options.filter(panel)).toBe(false);
  expect(options.filter(document.getElementById("public"))).toBe(true);
});

it("falls back to JPEG when the PNG is too large", async () => {
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string) {
    callback(type === "image/png" ? new Blob([new Uint8Array(10 * 1024 * 1024)], { type }) : new Blob(["j"], { type }));
  };
  const blob = await capturePage(document.getElementById("host")!);
  expect(blob.type).toBe("image/jpeg");
});

it("paints a box over masked content, inside shadow roots too", async () => {
  const widget = document.createElement("div");
  document.body.appendChild(widget);
  const shadow = widget.attachShadow({ mode: "open" });
  shadow.innerHTML = '<div data-private id="card"><img id="photo" src="id.png"></div>';
  const card = shadow.getElementById("card")!;
  card.getBoundingClientRect = () => ({ left: 10, top: 20, width: 30, height: 40 }) as DOMRect;
  domToCanvas.mockImplementationOnce(async (_root: Node, opts: { filter: (n: Node) => boolean }) => {
    expect(opts.filter(shadow.getElementById("photo")!)).toBe(false);
    return document.createElement("canvas");
  });
  await capturePage(document.getElementById("host")!, { mask: "[data-private]", scale: 2 });
  expect(fillRect).toHaveBeenCalledWith(20, 40, 60, 80);
});
