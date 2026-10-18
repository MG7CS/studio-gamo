// Generated public contract. DO NOT EDIT.
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
    "/api/events/{id}/team": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Assign role-scoped event team member
         * @description Grants or updates granular per-event permissions. Content/publishing roles cannot grant refund approval or settlement access unless the actor is primary organization owner or superadmin.
         */
        post: operations["assignEventTeamMember"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/{id}/production-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List production requests linked to an event
         * @description Returns permission-scoped production service records for the event without exposing financial settlements or attendee personal data.
         */
        get: operations["listEventProductionRequests"];
        put?: never;
        /**
         * Request Gamo Production support for an event
         * @description Creates a linked Gamo Production request directly from the event context without duplicating event identity or requiring unrelated logins.
         */
        post: operations["createEventProductionRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tickets/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Self-service verified ticket and order lookup
         * @description Returns attendee registrations, orders, receipts, and QR passes only after verifying a 6-digit email challenge code. Knowing an email address alone is insufficient.
         */
        post: operations["lookupVerifiedTickets"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tickets/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Validate and check in QR admission pass
         * @description Verifies tamper-resistant QR ticket or registration pass, prevents replay admission, and records scan audit trail.
         */
        post: operations["scanTicketPass"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/artists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List verified live performance artists
         * @description Lists verified artist profiles for concert and event discovery.
         */
        get: operations["listArtists"];
        put?: never;
        /**
         * Create or onboard artist profile
         * @description Creates a live performance artist profile for the authenticated user without coupling Gamo Worship rankings.
         */
        post: operations["createArtistProfile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/artists/{id}/representatives": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Authorize booking agent or manager for an artist
         * @description Records scoped representation authorization with conflict detection for exclusive representation.
         */
        post: operations["authorizeRepresentative"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/representations/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Revoke artist representation authorization
         * @description Revokes an active representation authorization, blocking future booking/negotiation/financial access while preserving existing confirmed engagements and audit history.
         */
        post: operations["revokeRepresentation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/bookings/inquiries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send artist booking inquiry
         * @description Verified organizer sends a booking inquiry and initial proposed terms to an artist or authorized representative.
         */
        post: operations["createBookingInquiry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/bookings/inquiries/{id}/offers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit booking offer or counteroffer
         * @description Authorized organizer, artist, or active representative submits a booking offer or counteroffer with separate artist fee, agent commission, and platform allocation line items.
         */
        post: operations["proposeBookingOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/bookings/offers/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm booking offer and create engagement
         * @description Authorized counterparty accepts a proposed offer, locking terms as immutable and creating a confirmed performance engagement with deposits disabled pending policy approval.
         */
        post: operations["acceptBookingOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{id}/refund": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve and process ticket order refund
         * @description Requires explicit approve_refunds authority on the order's event (publishing/content authority alone is insufficient). Voids issued tickets, releases reserved capacity, and records refund ledger entry.
         */
        post: operations["processOrderRefund"];
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
         * @description Creates a Stripe test-mode Checkout session for an authoritative ticket order. Returns 503 when paid checkout is not configured (no test-mode Stripe key outside local development) or when the event's order, inventory or organizer-authorization gate is not satisfied; no hold is created when Stripe is unconfigured. Cross-origin browser requests are rejected (403).
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
            /** @enum {string} */
            intent?: "signin" | "signup" | "recover";
            /** @enum {string} */
            product?: "web" | "worship" | "academy" | "live" | "production";
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
            customerName?: string;
            idempotencyKey?: string;
        };
        CheckoutResponse: {
            /** @constant */
            success: true;
            sessionId: string;
            url: string | null;
            mock?: boolean;
            orderId?: string;
            orderNumber?: string;
            holdExpiresAt?: string;
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
            } & {
                [key: string]: unknown;
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
            orderId?: string;
            ticketsIssued?: number;
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
            /** @enum {string} */
            listingType?: "organizer_submitted" | "external_discovery";
            importKey?: string | null;
            metroSlug?: string | null;
            startDateLocal?: string | null;
            startTimeLocal?: string | null;
            publishedByLabel?: string | null;
            publishedByUserId?: string | null;
            originalOrganizerName?: string | null;
            externalDestinationKind?: string | null;
            externalTicketProvider?: string | null;
            externalOnly?: boolean;
            priceMinCents?: number | null;
            currency?: string;
            ticketAvailability?: string;
            sourceUrlsJson?: string | null;
            lastVerifiedAt?: components["schemas"]["Timestamp"] | null;
            artworkUrl?: string | null;
            artworkRightsVerified?: boolean;
            artworkLicenseCredit?: string | null;
            /** @enum {string} */
            editorialStatus?: "draft" | "verified" | "approved" | "published" | "archived" | "canceled" | "rejected";
            editorialNotes?: string | null;
            independentDisclosure?: string | null;
            isFeatured?: boolean;
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
            /** @enum {string} */
            listingType?: "organizer_submitted" | "external_discovery";
            importKey?: string | null;
            metroSlug?: string | null;
            startDateLocal?: string | null;
            startTimeLocal?: string | null;
            publishedByLabel?: string | null;
            publishedByUserId?: string | null;
            originalOrganizerName?: string | null;
            externalDestinationKind?: string | null;
            externalTicketProvider?: string | null;
            externalOnly?: boolean;
            priceMinCents?: number | null;
            currency?: string;
            ticketAvailability?: string;
            sourceUrlsJson?: string | null;
            lastVerifiedAt?: components["schemas"]["Timestamp"] | null;
            artworkUrl?: string | null;
            artworkRightsVerified?: boolean;
            artworkLicenseCredit?: string | null;
            /** @enum {string} */
            editorialStatus?: "draft" | "verified" | "approved" | "published" | "archived" | "canceled" | "rejected";
            editorialNotes?: string | null;
            independentDisclosure?: string | null;
            isFeatured?: boolean;
            performers?: {
                id: string;
                displayName: string;
                billingOrder: number;
                roleLabel: string;
            }[];
            isPast?: boolean;
            isClosed?: boolean;
            /** @enum {string} */
            lifecycleStatus?: "scheduled" | "past" | "canceled";
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
        AssignEventTeamInput: {
            userId: components["schemas"]["Identifier"];
            organizationId?: components["schemas"]["Identifier"];
            /** @enum {string} */
            role: "event_owner" | "lead_promoter" | "host_venue" | "co_organizer" | "booking_agent" | "production_coordinator" | "ticketing_admin" | "finance_contact" | "door_scanner";
            canEditContent?: boolean;
            canManageTicketing?: boolean;
            canApproveRefunds?: boolean;
            canViewSettlement?: boolean;
            canNegotiateBooking?: boolean;
            canCoordinateProduction?: boolean;
            canScanTickets?: boolean;
        };
        AssignEventTeamResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                eventId: string;
                userId: string;
                role: string;
                canEditContent?: boolean;
                canManageTicketing?: boolean;
                canApproveRefunds?: boolean;
                canViewSettlement?: boolean;
                canNegotiateBooking?: boolean;
                canCoordinateProduction?: boolean;
                canScanTickets?: boolean;
            };
        };
        TicketLookupInput: {
            /** Format: email */
            email: string;
            verificationCode: string;
        };
        TicketLookupResponse: {
            /** @constant */
            success: true;
            data: {
                email: string;
                registrations: {
                    [key: string]: unknown;
                }[];
                orders: {
                    [key: string]: unknown;
                }[];
                tickets: {
                    [key: string]: unknown;
                }[];
                operatorDisclosure?: string;
            };
        };
        TicketScanInput: {
            eventId: components["schemas"]["Identifier"];
            qrToken: string;
            gateLabel?: string;
        };
        TicketScanResponse: {
            /** @constant */
            success: true;
            data: {
                scanId: string;
                eventId: string;
                /** @enum {string} */
                outcome: "admitted";
                holderName: string;
                checkedInAt: string;
            };
        };
        CreateArtistInput: {
            stageName: string;
            genre?: string;
            bio?: string;
            homeCity?: string;
            homeState?: string;
            repertoireSummary?: string;
            allowSelfBooking?: boolean;
            musicianProfileId?: string;
        };
        ArtistProfileResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                userId: string;
                stageName: string;
                slug: string;
                genre?: string;
                verificationStatus?: string;
                allowSelfBooking?: boolean;
            } & {
                [key: string]: unknown;
            };
        };
        ArtistListResponse: {
            /** @constant */
            success: true;
            data: {
                [key: string]: unknown;
            }[];
            meta: components["schemas"]["ListMeta"];
        };
        AuthorizeRepresentativeInput: {
            representativeUserId: components["schemas"]["Identifier"];
            agencyName: string;
            /** @enum {string} */
            roleKind?: "booking_agent" | "manager" | "ministry_coordinator";
            /** Format: email */
            contactEmail: string;
            /** @enum {string} */
            scope?: "booking_only" | "booking_and_negotiation" | "full_management";
            /** @enum {string} */
            exclusivity?: "non_exclusive" | "exclusive";
            territory?: string;
            canViewFinancials?: boolean;
            commissionRateBps?: number;
        };
        RepresentationResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                artistId: string;
                representativeId: string;
                scope?: string;
                exclusivity?: string;
                status: string;
                canViewFinancials?: boolean;
            } & {
                [key: string]: unknown;
            };
        };
        RevokeRepresentationInput: {
            reason: string;
        };
        CreateBookingInquiryInput: {
            organizationId: components["schemas"]["Identifier"];
            eventId?: components["schemas"]["Identifier"];
            artistId: components["schemas"]["Identifier"];
            proposedStartsAt: components["schemas"]["Timestamp"];
            venueName: string;
            city: string;
            state: string;
            performanceScope: string;
            proposedArtistFeeCents: number;
            agentCommissionCents?: number;
            platformAdminAllocationCents?: number;
            termsSummary?: string;
        };
        BookingInquiryResponse: {
            /** @constant */
            success: true;
            data: {
                inquiry: {
                    [key: string]: unknown;
                };
                initialOffer: {
                    [key: string]: unknown;
                };
            } & {
                [key: string]: unknown;
            };
        };
        ProposeBookingOfferInput: {
            artistFeeCents: number;
            agentCommissionCents?: number;
            platformAdminAllocationCents?: number;
            travelStipendCents?: number;
            performanceMinutes?: number;
            termsSummary: string;
        };
        BookingOfferResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                inquiryId: string;
                offeredByRole: string;
                artistFeeCents: number;
                agentCommissionCents?: number;
                platformAdminAllocationCents?: number;
                status: string;
            } & {
                [key: string]: unknown;
            };
        };
        BookingAcceptResponse: {
            /** @constant */
            success: true;
            data: {
                offer: {
                    [key: string]: unknown;
                };
                engagement: {
                    [key: string]: unknown;
                };
            } & {
                [key: string]: unknown;
            };
        };
        OrderRefundInput: {
            reason: string;
            amountCents?: number;
        };
        OrderRefundResponse: {
            /** @constant */
            success: true;
            data: {
                refundId: string;
                orderId: string;
                amountCents: number;
                status: string;
                ticketsVoided: number;
            } & {
                [key: string]: unknown;
            };
        };
        CreateEventProductionRequestInput: {
            /** @enum {string} */
            category: "audio" | "livestream" | "lighting" | "acoustic" | "training";
            scopeSummary: string;
        };
        EventProductionRequestResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                eventId: string;
                category: string;
                scopeSummary: string;
                status: string;
                venueName?: string;
                city?: string;
                state?: string;
                startsAt?: string;
            };
        };
        EventProductionRequestListResponse: {
            /** @constant */
            success: true;
            data: {
                id: string;
                eventId: string;
                category: string;
                scopeSummary: string;
                status: string;
                venueName?: string;
                city?: string;
                state?: string;
                startsAt?: string;
            }[];
            meta: components["schemas"]["ListMeta"];
        };
        ParticipationInput: {
            /** @enum {string} */
            kind: "general" | "partnership";
            interest: string;
            name: string;
            organization?: string;
            message: string;
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
        /** @enum {string} */
        category: "concert" | "worship" | "bible" | "conference" | "youth";
        city: string;
        artist: string;
        venue: string;
        dateFrom: string;
        dateTo: string;
        metro: string;
        q: string;
        /** @enum {string} */
        weekend: "true" | "false" | "1" | "0";
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
    listEvents: {
        parameters: {
            query?: {
                /** @description Exact category filter. */
                category?: components["schemas"]["category"];
                /** @description Exact city filter. */
                city?: components["schemas"]["city"];
                /** @description Performer or artist name substring filter. */
                artist?: components["schemas"]["artist"];
                /** @description Venue name substring filter. */
                venue?: components["schemas"]["venue"];
                /** @description Minimum event start date (ISO 8601 date or timestamp). */
                dateFrom?: components["schemas"]["dateFrom"];
                /** @description Maximum event start date (ISO 8601 date or timestamp). */
                dateTo?: components["schemas"]["dateTo"];
                /** @description Metro area slug filter (e.g., phoenix-az, atlanta-ga, nashville-tn). */
                metro?: components["schemas"]["metro"];
                /** @description Free-text search query matching event title, performers, venue, or city. */
                q?: components["schemas"]["q"];
                /** @description Filter events occurring on Friday evening, Saturday, or Sunday in their local timezone. */
                weekend?: components["schemas"]["weekend"];
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
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    assignEventTeamMember: {
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
                "application/json": components["schemas"]["AssignEventTeamInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssignEventTeamResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    listEventProductionRequests: {
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
                    "application/json": components["schemas"]["EventProductionRequestListResponse"];
                };
            };
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createEventProductionRequest: {
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
                "application/json": components["schemas"]["CreateEventProductionRequestInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventProductionRequestResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    lookupVerifiedTickets: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TicketLookupInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketLookupResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    scanTicketPass: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TicketScanInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TicketScanResponse"];
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
    listArtists: {
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
                    "application/json": components["schemas"]["ArtistListResponse"];
                };
            };
            500: components["responses"]["LegacyError"];
        };
    };
    createArtistProfile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateArtistInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ArtistProfileResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    authorizeRepresentative: {
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
                "application/json": components["schemas"]["AuthorizeRepresentativeInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepresentationResponse"];
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
    revokeRepresentation: {
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
                "application/json": components["schemas"]["RevokeRepresentationInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RepresentationResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createBookingInquiry: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateBookingInquiryInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingInquiryResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["LegacyError"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    proposeBookingOffer: {
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
                "application/json": components["schemas"]["ProposeBookingOfferInput"];
            };
        };
        responses: {
            /** @description Successful response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingOfferResponse"];
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
    acceptBookingOffer: {
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
                    "application/json": components["schemas"]["BookingAcceptResponse"];
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
    processOrderRefund: {
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
                "application/json": components["schemas"]["OrderRefundInput"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderRefundResponse"];
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
            403: components["responses"]["SimpleError"];
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
