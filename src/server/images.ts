// 증거자료 이미지 처리 (05 증거자료 형식, M7).
// 올릴 때 이미지를 새로 저장해 위치 정보 등 사진 속 메타데이터(EXIF)를 지우고, 보여 줄 때 열람자별 워터마크 코드를 새겨 넣습니다.
import sharp, { type Sharp } from "sharp";
import type { ImageFormat } from "./uploads";

/** 이보다 큰 이미지는 줄여서 저장 (저장 공간 절약, 증거로 보기에는 충분한 크기) */
const MAX_DIMENSION = 2560;
/** 압축을 풀면 엄청나게 커지는 이미지로 서버를 멈추게 하는 공격을 막음 */
const MAX_INPUT_PIXELS = 50_000_000;
const FORMATS: ImageFormat[] = ["jpeg", "png", "webp"];

export type CleanImage = { ok: true; data: Buffer; format: ImageFormat } | { ok: false; error: string };

function encode(image: Sharp, format: ImageFormat): Sharp {
  if (format === "jpeg") return image.jpeg({ quality: 88 });
  if (format === "png") return image.png();
  return image.webp({ quality: 88 });
}

/**
 * 올린 파일이 실제로 jpg·png·webp 이미지인지 확인하고 새로 저장합니다.
 * 새로 저장하면 EXIF(촬영 위치, 기기 정보 등)를 포함한 메타데이터가 모두 빠집니다. 사진의 회전 정보는 지우기 전에 이미지에 반영합니다.
 * 파일 이름이나 브라우저가 알려 주는 형식은 믿지 않고, 파일 내용으로 판단합니다.
 */
export async function sanitizeImage(input: Buffer): Promise<CleanImage> {
  const invalid = { ok: false as const, error: "이미지는 jpg, png, webp 파일만 올릴 수 있습니다." };
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const { format } = await image.metadata();
    if (!format || !FORMATS.includes(format as ImageFormat)) return invalid;
    const resized = image.rotate().resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    // keepMetadata()/withMetadata()를 부르지 않으면 sharp는 메타데이터를 모두 버림
    const data = await encode(resized, format as ImageFormat).toBuffer();
    return { ok: true, data, format: format as ImageFormat };
  } catch {
    return invalid;
  }
}

// ─── 열람자별 워터마크 ───────────────────────────────────
// 서버에 글꼴이 없어도 똑같이 그려지도록, 코드 글자를 5×7 점으로 직접 그립니다.

const GLYPHS: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11100 10010 10001 10001 10001 10010 11100",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110",
  J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001",
  N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 10001 01010 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110",
  "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111",
  "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010",
  "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110",
  "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110",
  "9": "01110 10001 10001 01111 00001 00010 01100",
};

/** 글자를 점(사각형) 목록으로 바꿉니다. 글자 사이는 한 칸 띄움 */
function textRects(text: string, scale: number, dx = 0, dy = 0): string {
  const rects: string[] = [];
  [...text.toUpperCase()].forEach((ch, n) => {
    const rows = GLYPHS[ch]?.split(" ");
    if (!rows) return;
    rows.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit === "1") rects.push(`<rect x="${(n * 6 + x) * scale + dx}" y="${y * scale + dy}" width="${scale}" height="${scale}"/>`);
      });
    });
  });
  return rects.join("");
}

function watermarkSvg(width: number, height: number, code: string): string {
  const scale = Math.max(2, Math.round(Math.min(width, height) / 200));
  const textWidth = code.length * 6 * scale;
  const tileW = textWidth + 10 * scale;
  const tileH = 7 * scale + 18 * scale;
  // 밝은 사진과 어두운 사진 모두에서 보이도록 어두운 점과 밝은 점을 살짝 어긋나게 겹침
  const shadow = Math.max(1, Math.round(scale / 2));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<defs><pattern id="w" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">`,
    `<g fill="#ffffff" fill-opacity="0.18">${textRects(code, scale, shadow, shadow)}</g>`,
    `<g fill="#111c30" fill-opacity="0.18">${textRects(code, scale)}</g>`,
    `</pattern></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#w)"/>`,
    `</svg>`,
  ].join("");
}

/**
 * 이미지 위에 열람 코드를 옅게 반복해서 새깁니다. 화면 위에 겹친 워터마크(05)는 이미지만 따로 저장하면 빠지므로,
 * 이미지 자체에도 같은 코드를 넣어 이미지가 퍼졌을 때 열람자를 찾을 수 있게 합니다.
 */
export async function watermarkImage(input: Buffer, code: string): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
  const { width, height, format } = await image.metadata();
  if (!width || !height || !format || !FORMATS.includes(format as ImageFormat)) throw new Error("이미지를 읽을 수 없습니다.");
  const svg = Buffer.from(watermarkSvg(width, height, code));
  return encode(image.composite([{ input: svg, top: 0, left: 0 }]), format as ImageFormat).toBuffer();
}
