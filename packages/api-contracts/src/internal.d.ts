// Generated from openapi/root.yaml. DO NOT EDIT.
export interface paths {
    "/api/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a local demo session
         * @description Email-only provisioning is NOT identity verification. Explicit local demo environment only; production returns 403. Credential or magic-link flow deferred.
         */
        post: operations["createDemoSession"];
        /**
         * Revoke current session
         * @description Revoke current session
         */
        delete: operations["revokeSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover approved Christian events
         * @description At most 50 results ordered by startsAt then id ascending. meta.total is returned row count, not all matching rows. No cursor or client limit yet. Unknown query fields are rejected.
         */
        get: operations["listEvents"];
        put?: never;
        /**
         * Submit event for review
         * @description Submit event for review
         */
        post: operations["proposeEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read approved event
         * @description Read approved event
         */
        get: operations["getEvent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/{id}/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Register for a free event
         * @description Sequential duplicate email/event requests return 200 with existing pass. Public registration; userId is legacy untrusted input and a known reconciliation finding. Capacity serialization and duplicate pass disclosure need policy/technical resolution.
         */
        post: operations["registerAttendee"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/checkout/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create sandbox checkout
         * @description Sandbox only. Event must exist and be approved, paid, with a valid server-priced tier. No inventory reservation, organizer authorization or client idempotency yet; not production ready.
         */
        post: operations["createTestCheckout"];
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
         * Receive signed test Stripe event
         * @description Signature verified on raw body; livemode=true rejected. Durable event-ID deduplication exists but claim-before-processing and partial writes are unresolved. No real ticket fulfillment, refund reversal or reservation release.
         */
        post: operations["receiveStripeWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/check-in/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Demo check-in redirect
         * @description Local UI demo. Ignores input, no persistence, authentication, authorization, or dispatch. Production functionality deferred.
         */
        post: operations["demoCheckinConfirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/check-in/fail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Demo check-in redirect
         * @description Local UI demo. Ignores input, no persistence, authentication, authorization, or dispatch. Production functionality deferred.
         */
        post: operations["demoCheckinFail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/pending": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List moderation queue
         * @description Internal only. All pending events ordered createdAt descending. Unbounded legacy queue, no pagination. Middleware 401 uses text/html.
         */
        get: operations["listPendingEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Review Christian event
         * @description Internal only. revision_requested currently becomes rejected; this is a documented semantic mismatch pending workflow decision. Audit and moderation writes are not atomic.
         */
        post: operations["reviewEvent"];
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
        ListMeta: {
            total: number;
        };
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
        SimpleError: {
            error: string;
        };
        Problem: {
            /** Format: uri-reference */
            type: string;
            title: string;
            status: number;
            detail?: string;
            /** Format: uri-reference */
            instance?: string;
            errors?: {
                field: string;
                message: string;
                code: string;
            }[];
        };
        User: {
            id: components["schemas"]["Identifier"];
            /** Format: email */
            email: string;
            displayName: string | null;
            verifiedEmailAt: components["schemas"]["Timestamp"] | null;
            status: string;
            createdAt: components["schemas"]["Timestamp"];
        };
        SessionInput: {
            /** Format: email */
            email: string;
            displayName?: string;
        };
        SessionResponse: {
            /** @constant */
            success: true;
            data: {
                user: components["schemas"]["User"];
                sessionId: string;
                message: string;
            };
        };
        LogoutResponse: {
            /** @constant */
            success: true;
            data: {
                message: string;
            };
        };
        TierInput: {
            name: string;
            /** @default 0 */
            priceCents: number;
            /** @default 100 */
            capacity: number;
            note?: string;
        };
        Tier: {
            id: components["schemas"]["Identifier"];
            eventId: components["schemas"]["Identifier"];
            name: string;
            priceCents: number;
            capacity: number;
            reservedCount: number;
            note: string | null;
        };
        CreateEvent: {
            organizationId: components["schemas"]["Identifier"];
            title: string;
            /** @enum {string} */
            category: "concert" | "worship" | "bible" | "conference" | "youth";
            tagline?: string;
            description: string;
            venueName: string;
            address?: string;
            city: string;
            state: string;
            startsAt: components["schemas"]["Timestamp"];
            endsAt?: components["schemas"]["Timestamp"];
            /**
             * @description IANA timezone; validated by Intl.DateTimeFormat.
             * @default America/Phoenix
             */
            timezone: string;
            /**
             * @default free
             * @enum {string}
             */
            admissionType: "free" | "paid" | "external";
            photoKey?: string;
            externalUrl?: string | "";
            tiers?: components["schemas"]["TierInput"][];
        };
        RegisterAttendee: {
            attendeeName: string;
            /** Format: email */
            attendeeEmail: string;
            /** @default 1 */
            quantity: number;
            tierId?: components["schemas"]["Identifier"];
            userId?: components["schemas"]["Identifier"];
        };
        ReviewDecision: {
            /** @enum {string} */
            decision: "approved" | "rejected" | "revision_requested";
            notes?: string;
        };
        CheckoutInput: {
            eventId: components["schemas"]["Identifier"];
            /** @default 0 */
            tierIndex: number;
            /** @default 1 */
            quantity: number;
            /** Format: email */
            customerEmail?: string;
        };
        CheckoutResponse: {
            /** @constant */
            success: true;
            sessionId: string;
            url: string | null;
            mock?: boolean;
        };
        StripeEvent: {
            id: string;
            /** @constant */
            object?: "event";
            type: string;
            created?: number;
            /** @constant */
            livemode: false;
            data: {
                object: {
                    [key: string]: unknown;
                };
            };
        } & {
            [key: string]: unknown;
        };
        WebhookResponse: {
            /** @constant */
            received: true;
            eventId: string;
            type?: string;
            /** @constant */
            deduplicated?: true;
        };
        Event: {
            id: components["schemas"]["Identifier"];
            organizerId: components["schemas"]["Identifier"];
            title: string;
            slug: string;
            /** @enum {string} */
            category: "concert" | "worship" | "bible" | "conference" | "youth";
            tagline: string | null;
            description: string;
            venueName: string;
            address: string | null;
            city: string;
            state: string;
            startsAt: components["schemas"]["Timestamp"];
            endsAt: components["schemas"]["Timestamp"] | null;
            timezone: string;
            /** @enum {string} */
            admissionType: "free" | "paid" | "external";
            photoKey: string | null;
            externalUrl: string | null;
            /** @enum {string} */
            status: "draft" | "pending_review" | "approved" | "rejected" | "canceled";
            createdAt: components["schemas"]["Timestamp"];
        };
        EventDetails: {
            id: components["schemas"]["Identifier"];
            organizerId: components["schemas"]["Identifier"];
            title: string;
            slug: string;
            /** @enum {string} */
            category: "concert" | "worship" | "bible" | "conference" | "youth";
            tagline: string | null;
            description: string;
            venueName: string;
            address: string | null;
            city: string;
            state: string;
            startsAt: components["schemas"]["Timestamp"];
            endsAt: components["schemas"]["Timestamp"] | null;
            timezone: string;
            /** @enum {string} */
            admissionType: "free" | "paid" | "external";
            photoKey: string | null;
            externalUrl: string | null;
            /** @enum {string} */
            status: "draft" | "pending_review" | "approved" | "rejected" | "canceled";
            createdAt: components["schemas"]["Timestamp"];
            organizerName: string;
            organizerKind: string;
            tiers: components["schemas"]["Tier"][];
            totalRegistered: number;
        };
        EventListResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["EventDetails"][];
            meta: components["schemas"]["ListMeta"];
        };
        EventResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["EventDetails"];
        };
        CreateEventResponse: {
            /** @constant */
            success: true;
            data: {
                event: components["schemas"]["Event"];
                tiers: components["schemas"]["Tier"][];
                message: string;
            };
        };
        Registration: {
            id: components["schemas"]["Identifier"];
            eventId: components["schemas"]["Identifier"];
            tierId: components["schemas"]["Identifier"] | null;
            userId: components["schemas"]["Identifier"] | null;
            attendeeName: string;
            /** Format: email */
            attendeeEmail: string;
            quantity: number;
            qrToken: string;
            status: string;
            checkedInAt: components["schemas"]["Timestamp"] | null;
            createdAt: components["schemas"]["Timestamp"];
        };
        RegistrationResponse: {
            /** @constant */
            success: true;
            data: {
                registration: components["schemas"]["Registration"];
                isDuplicate: boolean;
                message: string;
            };
        };
        PendingResponse: {
            /** @constant */
            success: true;
            data: {
                event: components["schemas"]["Event"];
                organizationName: string;
                organizationType: string;
            }[];
            meta: components["schemas"]["ListMeta"];
        };
        ReviewResponse: {
            /** @constant */
            success: true;
            data: {
                event: components["schemas"]["Event"];
                reviewId: components["schemas"]["Identifier"];
                message: string;
            };
        };
        EventFilters: {
            /** @enum {string} */
            category?: "concert" | "worship" | "bible" | "conference" | "youth";
            city?: string;
        };
        /** @enum {string} */
        category: "concert" | "worship" | "bible" | "conference" | "youth";
        city: string;
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
        /** @description Documented API failure. Internal details are suppressed. */
        SimpleError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["SimpleError"];
            };
        };
    };
    parameters: {
        /** @description Event identifier; public detail additionally accepts a slug. */
        id: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createDemoSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    revokeSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LogoutResponse"];
                };
            };
            500: components["responses"]["LegacyError"];
        };
    };
    listEvents: {
        parameters: {
            query?: {
                /** @description Exact category filter. */
                category?: components["schemas"]["category"];
                /** @description Exact city filter. */
                city?: components["schemas"]["city"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    proposeEvent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEvent"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateEventResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    getEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Event identifier; public detail additionally accepts a slug. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    registerAttendee: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Event identifier; public detail additionally accepts a slug. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterAttendee"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegistrationResponse"];
                };
            };
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegistrationResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createTestCheckout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckoutInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CheckoutResponse"];
                };
            };
            400: components["responses"]["SimpleError"];
            404: components["responses"]["SimpleError"];
            409: components["responses"]["SimpleError"];
            500: components["responses"]["SimpleError"];
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
                "application/json": components["schemas"]["StripeEvent"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookResponse"];
                };
            };
            400: components["responses"]["SimpleError"];
            500: components["responses"]["SimpleError"];
        };
    };
    demoCheckinConfirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Demo redirect; no API JSON body. */
            303: {
                headers: {
                    /** @description Demo destination */
                    Location?: "/check-in/success";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    demoCheckinFail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Demo redirect; no API JSON body. */
            303: {
                headers: {
                    /** @description Demo destination */
                    Location?: "/check-in/standby-notified";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listPendingEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PendingResponse"];
                };
            };
            /** @description Middleware denies access */
            401: {
                headers: {
                    "WWW-Authenticate"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            500: components["responses"]["LegacyError"];
        };
    };
    reviewEvent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Event identifier; public detail additionally accepts a slug. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReviewDecision"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            /** @description Middleware denies access */
            401: {
                headers: {
                    "WWW-Authenticate"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/html": string;
                };
            };
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
}
