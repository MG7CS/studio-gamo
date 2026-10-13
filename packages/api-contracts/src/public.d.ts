// Generated public contract. DO NOT EDIT.
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
        post?: never;
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
    "/api/auth/challenge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Issue an email verification challenge
         * @description Generates a time-bounded 6-digit verification code (hashed with SHA-256 in D1 auth_challenges) and dispatches it via email. Enforces per-email rate limiting.
         */
        post: operations["requestAuthChallenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify email challenge code and establish authenticated session
         * @description Verifies the 6-digit challenge code against D1 auth_challenges, enforces expiry and attempt lockout, sets users.verified_email_at, revokes any presented prior session cookie, and issues a new host-only HttpOnly __session cookie.
         */
        post: operations["verifyAuthChallenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Inspect current authenticated user, roles, and organization memberships
         * @description Validates the active D1 session cookie and returns the authenticated user profile, global system roles, and active organization memberships.
         */
        get: operations["getCurrentIdentity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/organizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Onboard a church, ministry, academy partner, or sponsor organization
         * @description Requires an authenticated session with a verified email address. Creates the organization, assigns the caller as active owner in organization_members, initializes an unverified organizer_profiles record, and records an audit log entry.
         */
        post: operations["createOrganization"];
        delete?: never;
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
         * @description Public free registration. Never returns admission tokens or attendee records. Database enforces capacity and duplicate email/event uniqueness; confirmation is queued durably.
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
         * @description Checkout disabled until authoritative order, inventory, organizer permission and fulfillment are implemented. Valid requests return 503.
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
         * @description Raw signature and sandbox verified. Financial events return 503 without marking processed; unsupported events safely deduplicated. No ticket or refund fulfillment.
         */
        post: operations["receiveStripeWebhook"];
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
        User: {
            id: components["schemas"]["Identifier"];
            /** Format: email */
            email: string;
            displayName: string | null;
            verifiedEmailAt: components["schemas"]["Timestamp"] | null;
            status: string;
            createdAt: components["schemas"]["Timestamp"];
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
        AuthChallengeInput: {
            /** Format: email */
            email: string;
            displayName?: string;
            /**
             * @default login
             * @enum {string}
             */
            purpose: "login";
        };
        AuthChallengeResponse: {
            /** @constant */
            success: true;
            data: {
                challengeId: components["schemas"]["Identifier"];
                expiresAt: components["schemas"]["Timestamp"];
                /** @enum {string} */
                deliveryStatus: "sent" | "simulated";
                message: string;
            };
        };
        AuthVerifyInput: {
            /** Format: email */
            email: string;
            code: string;
            displayName?: string;
        };
        OrganizationMembershipSummary: {
            organizationId: components["schemas"]["Identifier"];
            organizationName: string;
            organizationSlug: string;
            /** @enum {string} */
            organizationType: "church" | "ministry" | "school" | "sponsor" | "other";
            /** @enum {string} */
            role: "owner" | "admin" | "coordinator" | "member";
            status: string;
        };
        AuthMeResponse: {
            /** @constant */
            success: true;
            data: {
                user: components["schemas"]["User"];
                sessionId: string;
                roles: string[];
                memberships: components["schemas"]["OrganizationMembershipSummary"][];
            };
        };
        Organization: {
            id: components["schemas"]["Identifier"];
            name: string;
            slug: string;
            /** @enum {string} */
            type: "church" | "ministry" | "school" | "sponsor" | "other";
            verifiedAt: components["schemas"]["Timestamp"] | null;
            status: string;
            createdAt: components["schemas"]["Timestamp"];
        };
        CreateOrganizationInput: {
            name: string;
            slug: string;
            /** @enum {string} */
            type: "church" | "ministry" | "school" | "sponsor" | "other";
        };
        CreateOrganizationResponse: {
            /** @constant */
            success: true;
            data: {
                organization: components["schemas"]["Organization"];
                /** @constant */
                membershipRole: "owner";
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
            status: "draft" | "pending_review" | "approved" | "rejected" | "revision_requested" | "canceled";
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
        RegistrationResponse: {
            /** @constant */
            success: true;
            data: {
                isDuplicate: boolean;
                message: string;
            };
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
    requestAuthChallenge: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthChallengeInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthChallengeResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            429: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    verifyAuthChallenge: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthVerifyInput"];
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
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            429: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    getCurrentIdentity: {
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
                    "application/json": components["schemas"]["AuthMeResponse"];
                };
            };
            401: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createOrganization: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrganizationInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateOrganizationResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
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
            503: components["responses"]["SimpleError"];
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
            503: components["responses"]["SimpleError"];
        };
    };
}
