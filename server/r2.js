/**
 * Cloudflare R2, same bucket as DSAMantra.
 * Every object lives under study/{userId}/ so the two apps do not collide.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]);
const MAX_IMAGE_BYTES = 800 * 1024;
const MAX_PDF_BYTES = Math.floor(2.5 * 1024 * 1024);

let client = null;

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

export function getR2Config() {
  const accountId = clean(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID);
  const endpoint = clean(process.env.R2_S3_ENDPOINT) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  return {
    accountId,
    accessKeyId: clean(process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY),
    secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY),
    bucket: clean(process.env.R2_BUCKET_NAME || process.env.R2_BUCKET),
    publicBaseUrl: clean(process.env.R2_PUBLIC_BASE_URL).replace(/\/$/, ""),
    endpoint,
  };
}

export function r2Diagnostics() {
  const cfg = getR2Config();
  const missing = [];
  if (!cfg.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!cfg.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!cfg.bucket) missing.push("R2_BUCKET_NAME");
  if (!cfg.publicBaseUrl) missing.push("R2_PUBLIC_BASE_URL");
  if (!cfg.endpoint) missing.push("R2_ACCOUNT_ID");
  return { configured: missing.length === 0, missing, publicBaseUrl: cfg.publicBaseUrl || null };
}

export class MediaError extends Error {
  constructor(message, status = 400, code = "MEDIA_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertConfigured() {
  const diag = r2Diagnostics();
  if (!diag.configured) {
    throw new MediaError(`File storage is not configured. Missing: ${diag.missing.join(", ")}`, 503, "STORAGE_UNAVAILABLE");
  }
}

function s3() {
  if (client) return client;
  const cfg = getR2Config();
  client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return client;
}

function sniff(buffer, contentType) {
  if (contentType === "application/pdf") return buffer.subarray(0, 4).toString("utf8") === "%PDF";
  if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (contentType === "image/png") return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("utf8") === "RIFF" && buffer.subarray(8, 12).toString("utf8") === "WEBP";
  return false;
}

export function extensionFor(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "application/pdf") return "pdf";
  return "jpg";
}

export function prepareUpload(buffer, contentType, { pdf = false } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new MediaError("The file is empty.");
  }
  const type = String(contentType || "").toLowerCase().split(";")[0].trim();
  const allowed = pdf ? FILE_TYPES : IMAGE_TYPES;
  if (!allowed.has(type)) {
    throw new MediaError(pdf ? "Only JPEG, PNG, WebP, and PDF files are allowed." : "Only JPEG, PNG, and WebP images are allowed.");
  }
  const max = type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > max) {
    throw new MediaError(type === "application/pdf" ? "PDFs must be 2.5 MB or smaller." : "Images must be 800 KB or smaller after compression.");
  }
  if (!sniff(buffer, type)) throw new MediaError("The file contents do not match its type.");
  return type;
}

export async function putObject({ key, body, contentType }) {
  assertConfigured();
  const cfg = getR2Config();
  await s3().send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentDisposition: "inline",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${cfg.publicBaseUrl}/${key}`;
}

export async function removeObject(key) {
  if (!r2Diagnostics().configured || !key) return;
  const cfg = getR2Config();
  await s3().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

export function ownsKey(userId, key) {
  return typeof key === "string" && key.startsWith(`study/${userId}/`);
}
