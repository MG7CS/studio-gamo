/** Test-only fakes for the upload service: an in-memory R2 bucket with multipart, an image binding, file headers. */
import type {
  ImagesBindingLike,
  UploadBucketLike,
  UploadMultipartLike,
  UploadObjectBodyLike,
  UploadedPartLike,
} from './uploads.ts';

const MIN_PART = 5 * 1024 * 1024;

// ---- fakes ------------------------------------------------------------------------------------------------

export async function toBytes(
  value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  const chunks: Uint8Array[] = [];
  const reader = value.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export class FakeBucket implements UploadBucketLike {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, { bytes: Uint8Array; etag: string }> }>();
  calls: string[] = [];
  private etags = 0;

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    this.calls.push(`put ${key}`);
    this.objects.set(key, { bytes: await toBytes(value), contentType: options?.httpMetadata?.contentType });
    return { etag: `single-${++this.etags}` };
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<UploadObjectBodyLike | null> {
    this.calls.push(`get ${key}`);
    const found = this.objects.get(key);
    if (!found) return null;
    const start = options?.range?.offset ?? 0;
    const end = options?.range?.length === undefined ? found.bytes.length : start + options.range.length;
    const slice = found.bytes.slice(start, end);
    return {
      size: found.bytes.length,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      }),
      arrayBuffer: async () =>
        slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    };
  }
  async head(key: string) {
    this.calls.push(`head ${key}`);
    const found = this.objects.get(key);
    return found ? { size: found.bytes.length } : null;
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.calls.push(`delete ${key}`);
      this.objects.delete(key);
    }
  }
  async list(prefix = '') {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }
  async createMultipartUpload(key: string) {
    const uploadId = `mpu-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    this.calls.push(`create ${key}`);
    return { uploadId, ...this.handle(key, uploadId) };
  }
  resumeMultipartUpload(key: string, uploadId: string): UploadMultipartLike {
    return this.handle(key, uploadId);
  }
  private handle(key: string, uploadId: string): UploadMultipartLike {
    const fail = () => {
      throw new Error('NoSuchUpload');
    };
    return {
      uploadPart: async (partNumber, value) => {
        const upload = this.uploads.get(uploadId) ?? fail();
        const etag = `part-${++this.etags}`;
        upload.parts.set(partNumber, { bytes: await toBytes(value), etag });
        this.calls.push(`part ${partNumber}`);
        return { partNumber, etag };
      },
      complete: async (parts: UploadedPartLike[]) => {
        const upload = this.uploads.get(uploadId) ?? fail();
        const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        const chunks = ordered.map((p, i) => {
          const stored = upload.parts.get(p.partNumber);
          if (!stored || stored.etag !== p.etag) throw new Error('InvalidPart');
          if (i < ordered.length - 1 && stored.bytes.length < MIN_PART) throw new Error('EntityTooSmall');
          if (i < ordered.length - 1 && stored.bytes.length !== upload.parts.get(1)!.bytes.length)
            throw new Error('InvalidPart: non-uniform');
          return stored.bytes;
        });
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.length;
        }
        this.objects.set(key, { bytes: out });
        this.uploads.delete(uploadId);
        this.calls.push('complete');
        return {};
      },
      abort: async () => {
        if (!this.uploads.has(uploadId)) fail();
        this.uploads.delete(uploadId);
        this.calls.push(`abort ${key}`);
      },
    };
  }
}

export function webpBytes(length = 64): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  out.set(Buffer.from('RIFF'), 0);
  out.set(Buffer.from('WEBP'), 8);
  return out;
}

export function fakeImages(mode: 'ok' | 'throw' = 'ok') {
  const seen: { transforms: unknown[]; outputs: unknown[]; inputBytes: number[] } = {
    transforms: [],
    outputs: [],
    inputBytes: [],
  };
  const binding: ImagesBindingLike = {
    input(stream) {
      const handle = {
        transform(options: unknown) {
          seen.transforms.push(options);
          return handle;
        },
        async output(options: unknown) {
          seen.outputs.push(options);
          const input = await toBytes(stream);
          seen.inputBytes.push(input.length);
          if (mode === 'throw') throw new Error('unsupported image');
          return { response: () => new Response(webpBytes(40)) };
        },
      };
      return handle;
    },
  };
  return { binding, seen };
}

export function withHeader(
  kind: 'mp4' | 'webm' | 'jpeg' | 'png' | 'webp' | 'pdf' | 'heic' | 'html',
  size: number,
): Uint8Array {
  const out = new Uint8Array(size);
  const header: number[] =
    kind === 'mp4'
      ? [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]
      : kind === 'heic'
        ? [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]
        : kind === 'webm'
          ? [0x1a, 0x45, 0xdf, 0xa3]
          : kind === 'jpeg'
            ? [0xff, 0xd8, 0xff, 0xe0]
            : kind === 'png'
              ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
              : kind === 'webp'
                ? [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
                : kind === 'pdf'
                  ? [...Buffer.from('%PDF-1.7')]
                  : [...Buffer.from('<!doctype html><script>alert(1)</script>')];
  out.set(header.slice(0, size), 0);
  return out;
}
