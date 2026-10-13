/**
 * Cloudflare R2 Storage Abstraction for Gamo Studios.
 *
 * Provides a secure, policy-enforced object storage interface supporting:
 * - Public approved assets (posters, program logos)
 * - Private program documents (church setlists, charts)
 * - Audition media (audio/video recordings)
 * - Educational resources (sheet music, practice recordings)
 * - Event media (banners, promotional photos)
 * - Technical project attachments (production specs, wiring diagrams)
 * - Restricted verification material (ministry legal docs)
 *
 * Enforces:
 * - Unpredictable object keys.
 * - Strict MIME type and byte size validation.
 * - Cryptographically signed upload tickets (15-minute expiry).
 * - Multi-tenant ownership and access policy enforcement.
 * - No public exposure of private/restricted buckets.
 */

export type StorageScope =
  | 'public_asset'
  | 'private_document'
  | 'audition_media'
  | 'educational_resource'
  | 'event_media'
  | 'technical_attachment'
  | 'restricted_verification';

export type AccessPolicy = 'public_read' | 'private' | 'audition' | 'restricted';

export interface ScopePolicyRule {
  allowedMimeTypes: string[];
  maxByteSize: number;
  defaultAccessPolicy: AccessPolicy;
}

export const SCOPE_POLICIES: Record<StorageScope, ScopePolicyRule> = {
  public_asset: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxByteSize: 10 * 1024 * 1024, // 10MB
    defaultAccessPolicy: 'public_read',
  },
  event_media: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxByteSize: 15 * 1024 * 1024, // 15MB
    defaultAccessPolicy: 'public_read',
  },
  private_document: {
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    maxByteSize: 25 * 1024 * 1024, // 25MB
    defaultAccessPolicy: 'private',
  },
  audition_media: {
    allowedMimeTypes: [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/wav',
      'audio/aac',
      'audio/mp4',
    ],
    maxByteSize: 200 * 1024 * 1024, // 200MB
    defaultAccessPolicy: 'audition',
  },
  educational_resource: {
    allowedMimeTypes: ['application/pdf', 'audio/mpeg', 'audio/wav', 'audio/mp4'],
    maxByteSize: 50 * 1024 * 1024, // 50MB
    defaultAccessPolicy: 'private',
  },
  technical_attachment: {
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    maxByteSize: 50 * 1024 * 1024, // 50MB
    defaultAccessPolicy: 'private',
  },
  restricted_verification: {
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    maxByteSize: 15 * 1024 * 1024, // 15MB
    defaultAccessPolicy: 'restricted',
  },
};

export interface AuthorizeUploadRequest {
  filename: string;
  contentType: string;
  byteSize: number;
  scope: StorageScope;
  ownerUserId: string;
  organizationId?: string;
}

export interface UploadTicket {
  ticket: string; // HMAC-signed token
  r2Key: string;
  scope: StorageScope;
  accessPolicy: AccessPolicy;
  expiresAt: number; // Unix timestamp ms
  maxByteSize: number;
  contentType: string;
  ownerUserId: string;
}

export interface StorageObjectMetadata {
  key: string;
  size: number;
  contentType: string;
  scope: StorageScope;
  accessPolicy: AccessPolicy;
  ownerUserId: string;
  uploadedAt: Date;
}

export interface R2StorageConfig {
  signingSecret?: string;
  publicCdnBaseUrl?: string;
}

const FALLBACK_SIGNING_SECRET = 'gamo_storage_ticket_signing_secret_min_32_characters_123';

/**
 * Sanitizes a filename to prevent directory traversal or malicious characters.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[\\\/]/, ''); // Strip paths
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  return clean.slice(0, 100) || 'unnamed_file';
}

/**
 * Generates an unpredictable, namespaced R2 key.
 */
export function generateR2Key(scope: StorageScope, ownerId: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  const timestamp = Date.now();
  return `${scope}/${ownerId}/${timestamp}_${randomHex}_${sanitized}`;
}

/**
 * Signs an upload ticket using HMAC-SHA256.
 */
async function signTicketPayload(payloadString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadString));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${payloadString}.${b64}`;
}

/**
 * Verifies an HMAC-SHA256 signed upload ticket.
 */
async function verifyTicketPayload(signedTicket: string, secret: string): Promise<string | null> {
  const lastDot = signedTicket.lastIndexOf('.');
  if (lastDot === -1) return null;

  const payload = signedTicket.slice(0, lastDot);
  const signature = signedTicket.slice(lastDot + 1);

  const expected = await signTicketPayload(payload, secret);
  const expectedSig = expected.slice(expected.lastIndexOf('.') + 1);

  if (signature === expectedSig) {
    return payload;
  }
  return null;
}

/**
 * Storage client abstraction supporting real Cloudflare R2 bucket bindings
 * and safe in-memory mocks for testing/local preview.
 */
export function createR2StorageClient(r2BucketBinding?: any, config?: R2StorageConfig) {
  const secret = config?.signingSecret || FALLBACK_SIGNING_SECRET;
  const publicBaseUrl = config?.publicCdnBaseUrl || 'https://assets.gamostudio.org';

  // In-memory object store for tests and mock environments
  const memoryStore = new Map<
    string,
    { data: Uint8Array; metadata: Record<string, string>; size: number }
  >();

  return {
    /**
     * Validates an upload request and generates a signed upload ticket.
     */
    async authorizeUpload(request: AuthorizeUploadRequest): Promise<UploadTicket> {
      const policy = SCOPE_POLICIES[request.scope];
      if (!policy) {
        throw new Error(`Unsupported storage scope: ${request.scope}`);
      }

      // 1. Content-Type validation
      if (!policy.allowedMimeTypes.includes(request.contentType.toLowerCase())) {
        throw new Error(
          `Invalid content type "${request.contentType}" for scope "${request.scope}". Allowed types: ${policy.allowedMimeTypes.join(', ')}`
        );
      }

      // 2. Size limit validation
      if (request.byteSize > policy.maxByteSize) {
        const maxMb = (policy.maxByteSize / (1024 * 1024)).toFixed(1);
        throw new Error(
          `File size exceeds maximum allowed of ${maxMb}MB for scope "${request.scope}".`
        );
      }

      // 3. Sensitive Identity Documentation Safeguarding Rule
      if (request.scope === 'restricted_verification' && !request.organizationId) {
        throw new Error(
          'Verification material must be explicitly associated with an organization.'
        );
      }

      // 4. Generate key & expiration (15 minutes)
      const r2Key = generateR2Key(request.scope, request.ownerUserId, request.filename);
      const expiresAt = Date.now() + 15 * 60 * 1000;

      const payload = JSON.stringify({
        key: r2Key,
        scope: request.scope,
        accessPolicy: policy.defaultAccessPolicy,
        expiresAt,
        maxByteSize: policy.maxByteSize,
        contentType: request.contentType,
        ownerUserId: request.ownerUserId,
      });

      const signedToken = await signTicketPayload(payload, secret);

      return {
        ticket: signedToken,
        r2Key,
        scope: request.scope,
        accessPolicy: policy.defaultAccessPolicy,
        expiresAt,
        maxByteSize: policy.maxByteSize,
        contentType: request.contentType,
        ownerUserId: request.ownerUserId,
      };
    },

    /**
     * Verifies an upload ticket before writing an object.
     */
    async verifyTicket(ticketString: string): Promise<UploadTicket | null> {
      const rawPayload = await verifyTicketPayload(ticketString, secret);
      if (!rawPayload) return null;

      try {
        const data = JSON.parse(rawPayload);
        if (Date.now() > data.expiresAt) {
          return null; // Expired
        }
        return {
          ticket: ticketString,
          r2Key: data.key,
          scope: data.scope,
          accessPolicy: data.accessPolicy,
          expiresAt: data.expiresAt,
          maxByteSize: data.maxByteSize,
          contentType: data.contentType,
          ownerUserId: data.ownerUserId,
        };
      } catch {
        return null;
      }
    },

    /**
     * Puts an object into R2 using an authorized ticket or server authority.
     */
    async putObject(
      key: string,
      data: ArrayBuffer | Uint8Array | ReadableStream | string,
      metadata: {
        contentType: string;
        scope: StorageScope;
        accessPolicy: AccessPolicy;
        ownerUserId: string;
      }
    ): Promise<StorageObjectMetadata> {
      const byteLength =
        data instanceof ArrayBuffer
          ? data.byteLength
          : data instanceof Uint8Array
            ? data.length
            : typeof data === 'string'
              ? new TextEncoder().encode(data).length
              : 0;

      if (r2BucketBinding && typeof r2BucketBinding.put === 'function') {
        await r2BucketBinding.put(key, data, {
          httpMetadata: { contentType: metadata.contentType },
          customMetadata: {
            scope: metadata.scope,
            accessPolicy: metadata.accessPolicy,
            ownerUserId: metadata.ownerUserId,
            uploadedAt: new Date().toISOString(),
          },
        });
      } else {
        // Fallback to memory store for test/mock
        const buf =
          data instanceof Uint8Array
            ? data
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : typeof data === 'string'
                ? new TextEncoder().encode(data)
                : new Uint8Array();

        memoryStore.set(key, {
          data: buf,
          size: buf.length,
          metadata: {
            contentType: metadata.contentType,
            scope: metadata.scope,
            accessPolicy: metadata.accessPolicy,
            ownerUserId: metadata.ownerUserId,
            uploadedAt: new Date().toISOString(),
          },
        });
      }

      return {
        key,
        size: byteLength,
        contentType: metadata.contentType,
        scope: metadata.scope,
        accessPolicy: metadata.accessPolicy,
        ownerUserId: metadata.ownerUserId,
        uploadedAt: new Date(),
      };
    },

    /**
     * Gets an object, enforcing access policy rules.
     */
    async getObject(
      key: string,
      callerAuth?: {
        userId?: string;
        isStaff?: boolean;
        isAuditionReviewer?: boolean;
      }
    ): Promise<{ data: Uint8Array; metadata: Record<string, string> } | null> {
      let record: { data: any; metadata: Record<string, string> } | null = null;

      if (r2BucketBinding && typeof r2BucketBinding.get === 'function') {
        const r2Obj = await r2BucketBinding.get(key);
        if (!r2Obj) return null;
        const arrayBuf = await r2Obj.arrayBuffer();
        record = {
          data: new Uint8Array(arrayBuf),
          metadata: r2Obj.customMetadata || {},
        };
      } else {
        const item = memoryStore.get(key);
        if (!item) return null;
        record = { data: item.data, metadata: item.metadata };
      }

      if (!record) return null;

      const accessPolicy = (record.metadata.accessPolicy as AccessPolicy) || 'private';
      const ownerUserId = record.metadata.ownerUserId;

      // Access policy enforcement
      if (accessPolicy === 'public_read') {
        return record;
      }

      if (callerAuth?.isStaff) {
        return record; // Staff can review all private & audition assets
      }

      if (accessPolicy === 'audition' && callerAuth?.isAuditionReviewer) {
        return record;
      }

      if (callerAuth?.userId && callerAuth.userId === ownerUserId) {
        return record; // Owner can access their own uploaded asset
      }

      throw new Error('Access denied: You do not have permission to view this object.');
    },

    /**
     * Resolves the public URL for an asset if policy permits.
     */
    getPublicUrl(key: string, accessPolicy: AccessPolicy): string | null {
      if (accessPolicy !== 'public_read') {
        return null; // Never expose private/audition/restricted keys through public CDN URLs
      }
      return `${publicBaseUrl}/${key}`;
    },

    /**
     * Deletes an object from R2.
     */
    async deleteObject(key: string): Promise<void> {
      if (r2BucketBinding && typeof r2BucketBinding.delete === 'function') {
        await r2BucketBinding.delete(key);
      } else {
        memoryStore.delete(key);
      }
    },
  };
}
