import {
  ROUTER_IMAGE_MAX_BYTES,
  ROUTER_IMAGE_MAX_PIXELS,
  ROUTER_IMAGE_MAX_SIDE,
  ROUTER_IMAGE_MIN_SIDE,
} from "./router-diagnostics.ts";

export type RouterImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ValidatedRouterImage = {
  bytes: Uint8Array;
  mime: RouterImageMime;
  width: number;
  height: number;
};

export type RouterImageValidationError =
  | "unsupported_type"
  | "too_large"
  | "invalid_image"
  | "dimensions_exceeded";

export type RouterImageValidationResult =
  | { ok: true; image: ValidatedRouterImage }
  | { ok: false; error: RouterImageValidationError };

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0;
}

function bytesEqual(bytes: Uint8Array, offset: number, values: readonly number[]) {
  return values.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || !bytesEqual(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) || ascii(bytes, 12, 4) !== "IHDR") return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20), mime: "image/png" as const };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return { width: readUint16BE(bytes, offset + 5), height: readUint16BE(bytes, offset + 3), mime: "image/jpeg" as const };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27), mime: "image/webp" as const };
  }
  if (chunk === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return { width: 1 + (b0 | ((b1 & 0x3f) << 8)), height: 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)), mime: "image/webp" as const };
  }
  if (chunk === "VP8 ") {
    for (let offset = 20; offset + 9 < Math.min(bytes.length, 40); offset += 1) {
      if (bytes[offset + 3] === 0x9d && bytes[offset + 4] === 0x01 && bytes[offset + 5] === 0x2a) {
        return { width: (bytes[offset + 6] | (bytes[offset + 7] << 8)) & 0x3fff, height: (bytes[offset + 8] | (bytes[offset + 9] << 8)) & 0x3fff, mime: "image/webp" as const };
      }
    }
  }
  return null;
}

export function validateRouterImage(bytes: Uint8Array, declaredMime?: string | null): RouterImageValidationResult {
  if (!bytes.length) return { ok: false, error: "invalid_image" };
  if (bytes.length > ROUTER_IMAGE_MAX_BYTES) return { ok: false, error: "too_large" };
  const dimensions = pngDimensions(bytes) || jpegDimensions(bytes) || webpDimensions(bytes);
  if (!dimensions) return { ok: false, error: "invalid_image" };
  if (declaredMime && declaredMime !== dimensions.mime) return { ok: false, error: "unsupported_type" };
  const { width, height } = dimensions;
  if (!width || !height || width < ROUTER_IMAGE_MIN_SIDE || height < ROUTER_IMAGE_MIN_SIDE || width > ROUTER_IMAGE_MAX_SIDE || height > ROUTER_IMAGE_MAX_SIDE || width * height > ROUTER_IMAGE_MAX_PIXELS) {
    return { ok: false, error: "dimensions_exceeded" };
  }
  return { ok: true, image: { bytes, ...dimensions } };
}
