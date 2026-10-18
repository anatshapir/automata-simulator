/**
 * SVG / PNG export of the drawing (spec 9): white background, start arrow, double circle and grey trap kept,
 * run highlighting removed so the picture fits a worksheet.
 */
const EXPORT_CSS = `
.g-state circle.body{fill:#fff;stroke:#172033;stroke-width:2}
.g-state.trap circle.body{fill:#E2E6EC}
.g-state circle.ring{fill:none;stroke:#172033;stroke-width:2}
.g-state text{font-family:"IBM Plex Mono",Consolas,monospace;font-weight:600;fill:#172033}
.g-edge path{fill:none;stroke:#172033;stroke-width:1.8}
.g-edge .hit{display:none}
.g-edge text{font-family:"IBM Plex Mono",Consolas,monospace;font-size:16px;font-weight:600;fill:#172033;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}
.g-start{stroke:#172033;stroke-width:2;fill:none}
.badge,.pending-edge{display:none}
`;

export function svgMarkup(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // strip run / selection states so the export is a clean drawing
  clone.querySelectorAll(".g-state").forEach(g => g.setAttribute("class", g.getAttribute("class")!.split(" ").filter(c => c === "g-state" || c === "trap").join(" ")));
  clone.querySelectorAll(".g-edge").forEach(g => g.setAttribute("class", "g-edge"));
  clone.querySelectorAll("marker path").forEach(p => p.setAttribute("fill", "#172033"));
  const vb = svg.viewBox.baseVal;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.round(vb.width)));
  clone.setAttribute("height", String(Math.round(vb.height)));
  clone.removeAttribute("style");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = EXPORT_CSS;
  clone.insertBefore(style, clone.firstChild);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(vb.x)); bg.setAttribute("y", String(vb.y));
  bg.setAttribute("width", String(vb.width)); bg.setAttribute("height", String(vb.height));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, style.nextSibling);
  return new XMLSerializer().serializeToString(clone);
}

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(svg: SVGSVGElement, name: string) {
  download(`${name}.svg`, new Blob([svgMarkup(svg)], { type: "image/svg+xml" }));
}

export async function exportPng(svg: SVGSVGElement, name: string, scale = 2) {
  const markup = svgMarkup(svg);
  const vb = svg.viewBox.baseVal;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("png")); img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vb.width * scale); canvas.height = Math.round(vb.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  if (blob) download(`${name}.png`, blob);
}

export const safeName = (s: string | undefined) => (s?.trim() || "automaton").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
