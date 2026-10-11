import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sanitizeImage, watermarkImage } from "@/server/images";

// 촬영 위치(GPS)와 기기 정보가 들어 있고, 옆으로 눕혀 찍은(회전 정보 6) 사진
async function photoWithExif(format: "jpeg" | "png" | "webp" = "jpeg") {
  const base = sharp({ create: { width: 40, height: 20, channels: 3, background: "#cc3333" } }).withMetadata({ orientation: 6 }).withExif({
    IFD0: { Make: "TestCam", Model: "Secret Phone" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" },
  });
  return base.toFormat(format).toBuffer();
}

describe("증거 이미지 메타데이터 제거 (05 증거자료 형식)", () => {
  it("올린 사진의 EXIF(위치·기기 정보)를 지우고, 회전 정보는 이미지에 반영한다", async () => {
    const input = await photoWithExif();
    expect(await sharp(input).metadata()).toMatchObject({ orientation: 6, exif: expect.any(Buffer) });

    const result = await sanitizeImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.data).metadata();
    expect(result.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(result.data.includes(Buffer.from("Secret Phone"))).toBe(false);
    // 옆으로 눕힌 사진은 세워서 저장
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("png와 webp도 형식을 유지한 채 메타데이터를 지운다", async () => {
    for (const format of ["png", "webp"] as const) {
      const result = await sanitizeImage(await photoWithExif(format));
      expect(result.ok && result.format).toBe(format);
      if (result.ok) expect((await sharp(result.data).metadata()).exif).toBeUndefined();
    }
  });

  it("이미지가 아니거나 허용하지 않는 형식(gif)은 받지 않는다", async () => {
    expect((await sanitizeImage(Buffer.from("<script>alert(1)</script>"))).ok).toBe(false);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
    expect((await sanitizeImage(gif)).ok).toBe(false);
  });
});

describe("증거 이미지 워터마크", () => {
  it("열람 코드를 새긴 이미지는 원본과 달라지고, 크기와 형식은 그대로다", async () => {
    const white = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const marked = await watermarkImage(white, "AB12CD34");
    const meta = await sharp(marked).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([400, 300, "png"]);
    const { channels } = await sharp(marked).stats();
    // 하얀 바탕에 어두운 점이 찍혀 최솟값이 내려감
    expect(channels[0].min).toBeLessThan(255);
  });
});
