// Generated from openapi/root.yaml. DO NOT EDIT.
export interface paths {
    "/api/participation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Own Participation
         * @description Persisted participation inquiry workflow. Identity verification is required; participation submission does not approve eligibility.
         */
        get: operations["listOwnParticipation"];
        put?: never;
        /**
         * submit Participation
         * @description Persisted participation inquiry workflow. Identity verification is required; participation submission does not approve eligibility.
         */
        post: operations["submitParticipation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/participation/review-queue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list Participation Review Queue
         * @description Persisted participation inquiry workflow. Identity verification is required; participation submission does not approve eligibility.
         */
        get: operations["listParticipationReviewQueue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/participation/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * review Participation
         * @description Persisted participation inquiry workflow. Identity verification is required; participation submission does not approve eligibility.
         */
        post: operations["reviewParticipation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
         * @description Email-only provisioning is NOT identity verification. Explicit local demo environment only; production returns 403. Credential or verified email challenge flow is available separately.
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
    "/api/auth/clerk-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange a fresh Clerk session token for a Gamo session cookie
         * @description Only for a product with Clerk configured. Clerk session tokens last about a minute and are refreshed by Clerk's browser script, which ordinary pages do not load. After Clerk sign-in the browser sends the current token as a Bearer token; the token is verified against this product's own Clerk application (signature, issuer, authorized party), the product account is found or created, and a 7-day host-only HttpOnly __session cookie backed by a D1 session is issued. Tokens from another product's Clerk application are refused.
         */
        post: operations["exchangeClerkSession"];
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
    "/api/staff/provision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Provision a staff user role and bind external Cloudflare Access identity
         * @description Restricted to superadmin inside the Admin Access boundary. Creates or updates the target staff user, binds their immutable Cloudflare Access subject in external_identities, assigns the requested global staff role, and records an audit log entry.
         */
        post: operations["provisionStaffIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/clerk-webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive a Svix-signed event from this product's own Clerk application
         * @description Verified with CLERK_WEBHOOK_SECRET_<APP> (Svix scheme, 5-minute timestamp tolerance). session.ended, session.revoked and session.removed revoke the D1 sessions exchanged from that Clerk session id in this product; user.deleted and user.banned revoke every D1 session of the linked user in this product, and user.deleted also suspends the Clerk identity link. Other events are ignored with 200. Answers 503 when the secret is not configured.
         */
        post: operations["receiveClerkWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/account/person-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unlink (or link again) this product's account from the shared person record
         * @description Plain HTML form post (no JavaScript needed). unlink clears users.person_id and writes a person.unlinked audit row, which also stops automatic re-linking at the next sign-in; link re-attaches the account to the person of its verified email. Never grants access in another product. Redirects 303 to /account with person=unlinked|linked|unchanged or error=<code>.
         */
        post: operations["changePersonLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/account/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Provider onboarding steps, terms, submit for review and publish
         * @description Plain HTML form post used by /account/onboarding and /account/profile. start creates the draft profile for one of this product's sign-up roles; save stores one onboarding step as a draft (invalid fields are listed in the redirect); terms records the current Provider (or Organizer) Terms; submit sends the profile to staff review (verified email, complete profile and current terms required); publish lists it when every publish gate holds (staff verification for church, musician, technician and teacher; payout setup is not available yet and never blocks a profile); unpublish takes it off public view. Redirects 303 to the page with the outcome in the query string.
         */
        post: operations["changeProviderProfile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/review/providers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Staff decision on a provider profile (church verification and provider review)
         * @description schedule_meeting (date/time in the given IANA zone, default America/Phoenix; location; attending staff), start_review, verify (notes required; churches only after a scheduled meeting), request_changes (message), reject, suspend, reinstate. One D1 batch per decision: a status UPDATE conditional on expected_status, then the verification_records and audit_logs rows. A stale form or a concurrent decision changes nothing (error=CONFLICT). Self-review is refused. The provider is emailed through the outbox (honest when email is not configured). Redirects 303 to the review detail page.
         */
        post: operations["reviewProviderProfile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
                /** @description Same-site path to continue at (provider onboarding after a sign-up with a role). */
                next?: string;
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
            /** @enum {string} */
            intent?: "signin" | "signup" | "recover";
            /** @enum {string} */
            product?: "web" | "worship" | "academy" | "live" | "production";
            /**
             * @description Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).
             * @enum {string}
             */
            role?: "musician" | "technician" | "church" | "agent" | "organizer" | "teacher" | "artist";
            /** @description Cloudflare Turnstile token (required outside ENVIRONMENT=local; local accepts the documented dummy token). */
            "cf-turnstile-response"?: string;
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
            /** @enum {string} */
            intent?: "signin" | "signup" | "recover";
            /** @enum {string} */
            product?: "web" | "worship" | "academy" | "live" | "production";
            /**
             * @description Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).
             * @enum {string}
             */
            role?: "musician" | "technician" | "church" | "agent" | "organizer" | "teacher" | "artist";
            /** @description Sign-up only — the terms documents the form showed (current Site Terms and Privacy Policy versions are required). */
            terms?: components["schemas"]["TermsDocumentRef"][];
            /** @description Sign-up only — the separate, never pre-ticked marketing checkbox. */
            marketingOptIn?: boolean;
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
                products?: string[];
                product?: string | null;
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
        ProvisionStaffInput: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            role: "staff_reviewer" | "finance_manager" | "superadmin";
            accessSubject: string;
            displayName?: string;
        };
        ProvisionStaffResponse: {
            /** @constant */
            success: true;
            data: {
                user: components["schemas"]["User"];
                /** @enum {string} */
                role: "staff_reviewer" | "finance_manager" | "superadmin";
                /** @constant */
                provider: "cloudflare_access";
                accessSubject: string;
                message: string;
            };
        };
        ParticipationInput: {
            /** @enum {string} */
            kind: "general" | "partnership";
            interest: string;
            name: string;
            organization?: string;
            message: string;
        };
        ParticipationReviewInput: {
            /** @enum {string} */
            status: "reviewed" | "closed";
            notes: string;
        };
        ParticipationInquiry: {
            id: string;
            userId: string;
            /** @enum {string} */
            kind: "general" | "partnership";
            interest: string;
            name: string;
            organization: string | null;
            message: string;
            /** @enum {string} */
            status: "pending" | "reviewed" | "closed";
            reviewNotes: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            reviewedAt: string | null;
        };
        ParticipationResponse: {
            /** @constant */
            success: true;
            data: {
                inquiry: components["schemas"]["ParticipationInquiry"];
            };
        };
        ParticipationListResponse: {
            /** @constant */
            success: true;
            data: {
                inquiries: components["schemas"]["ParticipationInquiry"][];
            };
        };
        TermsDocumentRef: {
            slug: string;
            version: string;
        };
        /** @description Optional body of the Clerk token exchange; carries what the sign-up screen collected. */
        ClerkSessionInput: {
            /** @enum {string} */
            intent?: "signin" | "signup" | "recover";
            /**
             * @description Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).
             * @enum {string}
             */
            role?: "musician" | "technician" | "church" | "agent" | "organizer" | "teacher" | "artist";
            terms?: components["schemas"]["TermsDocumentRef"][];
            marketingOptIn?: boolean;
        };
        /** @description Clerk webhook payload (only type and data.id are read). */
        ClerkWebhookEvent: {
            type: string;
            data?: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        ClerkWebhookResponse: {
            /** @constant */
            success: true;
            data: {
                /** @constant */
                received: true;
                /** @enum {string} */
                status: "revoked" | "ignored";
                sessionsRevoked: number;
            };
        };
        PersonLinkForm: {
            /** @enum {string} */
            action: "unlink" | "link";
        };
        /** @description Onboarding form fields. Besides the listed controls, a save carries the step's own fields (role-specific, validated server-side by the step schema) as plain strings. */
        ProviderAccountForm: {
            /** @enum {string} */
            action: "start" | "save" | "terms" | "submit" | "publish" | "unpublish";
            /** @enum {string} */
            role: "musician" | "technician" | "church" | "agent" | "organizer" | "teacher" | "artist";
            step?: string;
            terms_slug?: string;
            terms_version?: string;
            /** @enum {string} */
            terms_accept?: "yes";
        } & {
            [key: string]: string;
        };
        ProviderReviewForm: {
            /** @enum {string} */
            action: "schedule_meeting" | "start_review" | "verify" | "request_changes" | "reject" | "suspend" | "reinstate";
            expected_status: string;
            notes?: string;
            /** @description Local date and time (YYYY-MM-DDTHH:MM) in meeting_zone. */
            meeting_at?: string;
            /** @description IANA time zone of meeting_at (default America/Phoenix). */
            meeting_zone?: string;
            meeting_location?: string;
            meeting_staff?: string;
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
    };
    parameters: {
        /** @description Resource identifier from the path. */
        id: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listOwnParticipation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful persisted response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ParticipationListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    submitParticipation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ParticipationInput"];
            };
        };
        responses: {
            /** @description Successful persisted response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ParticipationResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    listParticipationReviewQueue: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful persisted response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ParticipationListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    reviewParticipation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ParticipationReviewInput"];
            };
        };
        responses: {
            /** @description Successful persisted response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ParticipationResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
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
            403: components["responses"]["LegacyError"];
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
            413: components["responses"]["LegacyError"];
            415: components["responses"]["LegacyError"];
            429: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
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
            413: components["responses"]["LegacyError"];
            415: components["responses"]["LegacyError"];
            429: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    exchangeClerkSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ClerkSessionInput"];
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
            503: components["responses"]["LegacyError"];
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
            403: components["responses"]["LegacyError"];
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
    provisionStaffIdentity: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProvisionStaffInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProvisionStaffResponse"];
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
                    "application/json": components["schemas"]["LegacyError"];
                };
            };
            403: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    receiveClerkWebhook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClerkWebhookEvent"];
            };
        };
        responses: {
            /** @description Event verified and applied (or ignored). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClerkWebhookResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            413: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    changePersonLink: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["PersonLinkForm"];
            };
        };
        responses: {
            /** @description Form handled; redirects back to the page with the outcome in the query string. */
            303: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            415: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    changeProviderProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["ProviderAccountForm"];
            };
        };
        responses: {
            /** @description Form handled; redirects back to the page with the outcome in the query string. */
            303: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            413: components["responses"]["LegacyError"];
            415: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    reviewProviderProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["ProviderReviewForm"];
            };
        };
        responses: {
            /** @description Form handled; redirects back to the page with the outcome in the query string. */
            303: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            415: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
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
}
