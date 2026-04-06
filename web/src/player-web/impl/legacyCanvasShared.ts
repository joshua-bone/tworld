import type { LegacyTileSprite } from "@player-web/impl/legacyTileset";

const legacyImagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

export const LEGACY_COLORS = {
  background: "#000000",
  text: "#ffffff",
  dim: "#c0c0c0",
  highlight: "#ffff00",
} as const;

export const LEGACY_FONT = "16px 'Courier New', monospace";
export const LEGACY_SMALL_FONT = "14px 'Courier New', monospace";
export const LEGACY_INVENTORY_COUNT_FONT = "bold 14px 'Courier New', monospace";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

export function drawLegacySpriteImage(
  context: CanvasRenderingContext2D,
  sprite: LegacyTileSprite,
  x: number,
  y: number,
): void {
  context.drawImage(sprite.image, x + sprite.offsetX, y + sprite.offsetY);
}

export function loadLegacyImage(url: string): Promise<HTMLImageElement> {
  const cached = legacyImagePromiseCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const resolveDecodedImage = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (typeof image.decode === "function") {
        void image.decode().catch(() => {}).finally(() => {
          resolve(image);
        });
        return;
      }
      resolve(image);
    };

    image.onload = () => resolveDecodedImage();
    image.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      legacyImagePromiseCache.delete(url);
      reject(new Error(`Failed to load image asset: ${url}`));
    };
    image.src = url;
    if (image.complete && image.naturalWidth > 0) {
      resolveDecodedImage();
    }
  });

  legacyImagePromiseCache.set(url, promise);
  return promise;
}

export function drawLegacyText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = "left",
  font = LEGACY_FONT,
): void {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "top";
  context.fillText(text, x, y);
}

export function drawLegacyWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  color: string,
  center = false,
): void {
  context.font = LEGACY_FONT;
  context.fillStyle = color;
  context.textAlign = center ? "center" : "left";
  context.textBaseline = "top";

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width || line.length === 0) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  lines.forEach((entry, index) => {
    context.fillText(entry, center ? x + width / 2 : x, y + index * 18);
  });
}
