// Generated public contract. DO NOT EDIT.
export interface paths {
    "/api/webhook/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive a signed Resend event
         * @description Svix signature with RESEND_WEBHOOK_SECRET (503 without it). Updates the email_log status for every program's mail; hard bounces and complaints add the address hash to email_suppressions.
         */
        post: operations["receiveResendWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{slug}/upload-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start a signed upload session for a public form
         * @description Verifies a Turnstile token and returns a signed session token valid for 2 hours, used by the chunked uploader. At most 10 files per session. Works only for a published form that has a file_upload question. Success bodies of the upload endpoints are flat (not the success/data envelope) because the browser uploader consumes them directly.
         */
        post: operations["createFormUploadSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start a multipart upload to R2
         * @description Validates the declared type and size against the per-kind caps (video 500 MB mp4/quicktime/webm, photo 10 MB jpeg/png/webp/heic, PDF 10 MB each and at most 5, at most 10 files per session) and opens an R2 multipart upload. Files of 8 MiB or less use a single part.
         */
        post: operations["startFormUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/uploads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Abandon a pending upload
         * @description Aborts the multipart upload or deletes the pending object. Only uploads that belong to the session token and are not yet attached to a submission.
         */
        delete: operations["deleteFormUpload"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/uploads/{id}/parts/{n}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Upload one part (binary body)
         * @description Raw bytes of the part, at most 8 MiB. Re-sending the same part number replaces it, so a retry after a lost connection is safe.
         */
        put: operations["putFormUploadPart"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/uploads/{id}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Complete and verify an upload
         * @description Completes the R2 multipart upload, checks the stored size against the declared size and the first bytes against the declared type (ftyp, EBML, JPEG, PNG, %PDF-). A failed check deletes the object and answers 200 with status rejected. Photos are re-encoded to 1200 px WebP without metadata.
         */
        post: operations["completeFormUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/webhook/stripe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive a signed Stripe invoice event
         * @description Stripe-Signature verified over the raw body with STRIPE_WEBHOOK_SECRET (503 without it outside local). Handles invoice.paid (marks the matching invoice paid, sends the receipt) and invoice.payment_failed (records the failure for staff); every other type is acknowledged with applied false. Test mode only: events with livemode true are refused with 400 while live Stripe is not approved.
         */
        post: operations["receiveStripeWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/worship/offers/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Show an emailed offer with Accept and Decline buttons
         * @description HTML page. GET never mutates anything, because email security scanners prefetch links. Shows the service details and pay, or the current state (already accepted, declined, expired, no longer available). Responses carry Referrer-Policy no-referrer and Cache-Control no-store.
         */
        get: operations["showOffer"];
        put?: never;
        /**
         * Accept or decline an offer
         * @description Form post from the offer page (application/x-www-form-urlencoded with action accept or decline). One conditional update where status is pending decides the outcome; a repeated click shows the current state. Accept emails the church a confirmation and the staff inbox; decline emails staff and returns the request to matching. Only one acceptance per request and role wins.
         */
        post: operations["respondToOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Opaque case-sensitive resource identifier; never parse for authority. */
        Identifier: string;
        /** Format: date-time */
        Timestamp: string;
        LegacyError: {
            /** @constant */
            success: false;
            error: {
                code: string;
                message: string;
                details?: {
                    field: string;
                    message: string;
                    code: string;
                }[];
            };
        };
        /** @description Resend webhook payload (Svix-signed). */
        ResendEvent: {
            type: string;
            created_at?: string;
            data: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        ResendWebhookResponse: {
            /** @constant */
            received: true;
            applied: boolean;
        };
        UploadSessionInput: {
            turnstileToken: string;
        };
        UploadSessionResponse: {
            /** @description Signed upload-session token; send as X-Upload-Token or in the start body. */
            token: string;
            expiresAt: components["schemas"]["Timestamp"];
        };
        StartUploadInput: {
            token: string;
            questionId: string;
            filename: string;
            /** @description Declared size in bytes; checked against the stored object on completion. */
            size: number;
            contentType: string;
        };
        StartUploadResponse: {
            uploadId: components["schemas"]["Identifier"];
            /**
             * @description Bytes per part (8 MiB); the last part may be shorter.
             * @constant
             */
            partSize: 8388608;
            /** @description Number of parts to send, numbered from 1. */
            parts: number;
        };
        UploadPartResponse: {
            etag?: string;
        };
        CompleteUploadResponse: {
            /** @enum {string} */
            status: "verified" | "rejected";
            /** @description Present when rejected: safe, generic reason code. The stored object is deleted. */
            reason?: string;
        };
        /** @description application/x-www-form-urlencoded body of the offer page POST. */
        OfferResponseForm: {
            /** @enum {string} */
            action: "accept" | "decline";
        };
        /** @description Stripe event payload (signature-verified). Handled types: invoice.paid, invoice.payment_failed; any other type is acknowledged without change. livemode events are refused while live Stripe is not approved. */
        StripeWebhookEvent: {
            id: string;
            type: string;
            livemode?: boolean;
            data: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        StripeWebhookResponse: {
            /** @constant */
            received: true;
            applied: boolean;
        };
    };
    responses: {
        /** @description Documented API failure. Internal details are suppressed. */
        LegacyError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["LegacyError"];
            };
        };
        /** @description Too many requests. */
        RateLimited: {
            headers: {
                /** @description Seconds to wait. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["LegacyError"];
            };
        };
    };
    parameters: {
        /** @description Form slug (lowercase letters, digits and hyphens). */
        slug: string;
        /** @description Resource identifier from the path. */
        id: string;
        /** @description Upload-session token from upload-session. */
        uploadToken: string;
        /** @description Part number starting at 1; re-sending a part replaces it. */
        partNumber: number;
        /** @description Opaque single-use offer token from the emailed link; only its SHA-256 hash is stored. */
        offerToken: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    receiveResendWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResendEvent"];
            };
        };
        responses: {
            /** @description Event received; `applied` says whether it changed a stored delivery status. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResendWebhookResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    createFormUploadSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Form slug (lowercase letters, digits and hyphens). */
                slug: components["parameters"]["slug"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UploadSessionInput"];
            };
        };
        responses: {
            /** @description Session created. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadSessionResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    startFormUpload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StartUploadInput"];
            };
        };
        responses: {
            /** @description Upload opened. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StartUploadResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    deleteFormUpload: {
        parameters: {
            query?: never;
            header: {
                /** @description Upload-session token from upload-session. */
                "X-Upload-Token": components["parameters"]["uploadToken"];
            };
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Deleted (or already gone). */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    putFormUploadPart: {
        parameters: {
            query?: never;
            header: {
                /** @description Upload-session token from upload-session. */
                "X-Upload-Token": components["parameters"]["uploadToken"];
            };
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Part number starting at 1; re-sending a part replaces it. */
                n: components["parameters"]["partNumber"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Part stored. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadPartResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            413: components["responses"]["LegacyError"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    completeFormUpload: {
        parameters: {
            query?: never;
            header: {
                /** @description Upload-session token from upload-session. */
                "X-Upload-Token": components["parameters"]["uploadToken"];
            };
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Verification result. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompleteUploadResponse"];
                };
            };
            401: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    receiveStripeWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StripeWebhookEvent"];
            };
        };
        responses: {
            /** @description Event received; applied says whether it changed an invoice. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeWebhookResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    showOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque single-use offer token from the emailed link; only its SHA-256 hash is stored. */
                token: components["parameters"]["offerToken"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Offer or its current state. */
            200: {
                headers: {
                    "Referrer-Policy"?: "no-referrer";
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Unknown token; generic page with no details. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Too many requests. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
        };
    };
    respondToOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque single-use offer token from the emailed link; only its SHA-256 hash is stored. */
                token: components["parameters"]["offerToken"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["OfferResponseForm"];
            };
        };
        responses: {
            /** @description Result page: accepted, declined, already_accepted, already_declined or unavailable. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Missing or invalid action. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Cross-origin post refused. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Unknown token. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Too many requests. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            /** @description Temporarily unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
        };
    };
}
