// 증거자료 이미지 저장소 (06 이미지 저장: 서버 디스크). S3 호환 저장소로 바꾸려면 이 파일의 함수만 바꾸면 됩니다.
// 웹 앱과 파기 스크립트(scripts/purge.ts)가 함께 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type ImageFormat = "jpeg" | "png" | "webp";

const EXTENSIONS: Record<ImageFormat, string> = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** 저장 폴더. Docker Compose에서는 uploads 볼륨, 로컬에서는 저장소의 uploads 폴더 */
export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || "uploads");
}

function filePath(key: string): string {
  // 파일 이름은 서버가 만든 형식만 받아, 다른 경로의 파일을 읽거나 지울 수 없게 함
  if (!KEY_PATTERN.test(key)) throw new Error("잘못된 파일 이름입니다.");
  return path.join(uploadDir(), key);
}

export function contentTypeOf(key: string): string {
  return CONTENT_TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";
}

/** 새 파일 이름을 만들어 저장하고, 그 이름(evidence.url_or_file_key)을 돌려줍니다. */
export async function saveUpload(data: Buffer, format: ImageFormat): Promise<string> {
  const key = `${randomUUID()}.${EXTENSIONS[format]}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(filePath(key), data, { flag: "wx" });
  return key;
}

export async function readUpload(key: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath(key));
  } catch {
    return null;
  }
}

export async function deleteUploads(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => rm(filePath(key), { force: true })));
}

/** 사이트 폐쇄 때 올라온 이미지를 모두 지웁니다 (05 파기). 지운 파일 수를 돌려줍니다. */
export async function deleteAllUploads(): Promise<number> {
  let names: string[];
  try {
    names = await readdir(uploadDir());
  } catch {
    return 0;
  }
  const keys = names.filter((name) => KEY_PATTERN.test(name));
  await deleteUploads(keys);
  return keys.length;
}
