// Generated from openapi/root.yaml. DO NOT EDIT.
export interface paths {
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
    "/api/forms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List forms
         * @description All forms with status and latest published version.
         */
        get: operations["listForms"];
        put?: never;
        /**
         * Create a draft form
         * @description Creates a draft. The slug is unique; seeded forms exist already.
         */
        post: operations["createForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a form with its draft schema
         * @description Returns the draft definition (draftSchema), not a published version.
         */
        get: operations["getForm"];
        /**
         * Save the draft schema
         * @description Replaces the draft after parseFormSchema validation (400 with the failing path). Published versions are immutable and unaffected.
         */
        put: operations["saveFormDraft"];
        /**
         * Save the draft schema (HTML form)
         * @description Same action as PUT, for the browser form post; answers 303 back to the builder.
         */
        post: operations["saveFormDraftForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish the draft as a new immutable version
         * @description Snapshots the draft into a new form_versions row after checkPublishable. Refused with 400 (details list the reasons) when a bind key required by the form kind is missing, ids are duplicated, or a showIf points at an unknown or later question. Submissions keep the version they answered.
         */
        post: operations["publishForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List submissions
         * @description Newest first, deterministic by submittedAt then id. Optional filters; keyset paging (default 25, maximum 100).
         */
        get: operations["listSubmissions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a submission with the schema version it answered
         * @description Answers are returned with the form version the applicant saw, plus uploads (stream them through GET /files/{id}).
         */
        get: operations["getSubmission"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set a submission status
         * @description Moves a submission between new, in_review and closed and records optional staff notes. Approve and decline are separate actions.
         */
        post: operations["setSubmissionStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve an application
         * @description Applies to musician_application, technician_application and instructor_application submissions only (409 otherwise). Creates one private roster member from the bind keys (there is no public directory), sends the approval email.
         */
        post: operations["approveApplication"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/{id}/decline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Decline an application
         * @description Applies to musician_application, technician_application and instructor_application submissions only (409 otherwise). Moves uploaded files to forms/declined, sets deletion at 12 months (files 90 days) and sends the decline email.
         */
        post: operations["declineApplication"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/roster": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the private roster
         * @description Staff-only roster for matching. Filter by role (contained in roles), city and status.
         */
        get: operations["listRoster"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/requests/{id}/offers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send an offer for a service request
         * @description The path id is the service request. Creates a pending offer, stores only the token hash and emails the musician a link to /worship/offers/{token}. Pay is a separate integer amount in USD cents.
         */
        post: operations["sendOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/offers/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Withdraw a pending offer
         * @description Revokes the link; the musician then sees no longer available. 409 when the offer was already answered.
         */
        post: operations["withdrawOffer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List invoices
         * @description Newest first, by createdAt then id. Filter by status; keyset paging.
         */
        get: operations["listInvoices"];
        put?: never;
        /**
         * Create a draft invoice
         * @description Creates a draft with number GS-YYYY-NNNN (sequential per year), integer-cent USD lines and a computed total. For a service_request source with no lines, lines are prefilled from accepted offers. A gamo_admin line is refused with 400 gamo_admin_not_approved unless GAMO_ADMIN_FEE_APPROVED=true.
         */
        post: operations["createInvoice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send an invoice
         * @description Moves a draft to open. With Stripe test credentials creates a Stripe customer and invoice (send_invoice, card and ACH), finalizes it and emails the hosted link; otherwise emails manual payment instructions (INVOICE_PAYMENT_INSTRUCTIONS). Live Stripe keys are refused. 503 when the email or Stripe dependency is unavailable.
         */
        post: operations["sendInvoice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}/mark-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark an invoice paid
         * @description Records a payment received outside the webhook (check, Zelle, ACH, cash, other or stripe) and sends the receipt. Staff may always use this.
         */
        post: operations["markInvoicePaid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoices/{id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Void an invoice
         * @description Voids a draft or open invoice (also voids the Stripe invoice when one exists). 409 for paid invoices.
         */
        post: operations["voidInvoice"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/invoice-lines/{id}/payout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Record the musician payout for a line
         * @description Records that the musician_pay line was paid out by Gamo (method and reference). The amount is the line amount, never reduced by an administrative allocation. Refused with 409 for non-musician lines, unpaid invoices or an already recorded payout.
         */
        post: operations["recordInvoiceLinePayout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stream an uploaded file (staff only)
         * @description Streams a verified upload from R2. Images and video are inline, everything else is Content-Disposition attachment. Always sends X-Content-Type-Options nosniff and Content-Security-Policy sandbox. Supports Range for video (206). Rejected, unverified and missing uploads answer 404.
         */
        get: operations["getUploadedFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Stop accepting submissions
         * @description Closes the form; the published version stays and existing submissions are kept.
         */
        post: operations["closeForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/reopen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept submissions again
         * @description Reopens a closed form on its published version.
         */
        post: operations["reopenForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore a published version into the draft
         * @description Copies a published version into the draft; published versions are never changed.
         */
        post: operations["restoreFormVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save form settings
         * @description Updates the draft settings (title, intro, confirmation text). Same action for POST (HTML form) and PUT (JSON).
         */
        put: operations["saveFormSettingsPut"];
        /**
         * Save form settings
         * @description Updates the draft settings (title, intro, confirmation text). Same action for POST (HTML form) and PUT (JSON).
         */
        post: operations["saveFormSettings"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add a question to the draft
         * @description Appends a question of the given type to the draft schema.
         */
        post: operations["addFormQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions/{qid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save a draft question
         * @description Replaces the question after schema validation. Same action for POST (HTML form) and PUT (JSON).
         */
        put: operations["saveFormQuestionPut"];
        /**
         * Save a draft question
         * @description Replaces the question after schema validation. Same action for POST (HTML form) and PUT (JSON).
         */
        post: operations["saveFormQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions/{qid}/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Delete a draft question
         * @description Removes the question from the draft; published versions are unaffected.
         */
        post: operations["deleteFormQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions/{qid}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Duplicate a draft question
         * @description Inserts a copy with a new id after the original.
         */
        post: operations["duplicateFormQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions/{qid}/move": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Move a draft question
         * @description Moves the question up or down (or to another section) in the draft.
         */
        post: operations["moveFormQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/questions/{qid}/type": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change a draft question type
         * @description Converts the question to another compatible type, keeping what carries over.
         */
        post: operations["changeFormQuestionType"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/sections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add a section to the draft
         * @description Appends a section to the draft schema.
         */
        post: operations["addFormSection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/sections/{sid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Save a draft section
         * @description Updates the section (title, description, showIf). Same action for POST (HTML form) and PUT (JSON).
         */
        put: operations["saveFormSectionPut"];
        /**
         * Save a draft section
         * @description Updates the section (title, description, showIf). Same action for POST (HTML form) and PUT (JSON).
         */
        post: operations["saveFormSection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/forms/{id}/sections/{sid}/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Delete a draft section
         * @description Removes the section from the draft; published versions are unaffected.
         */
        post: operations["deleteFormSection"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply one status action to ticked submissions
         * @description Action handled, archived or spam on the listed ids only. Archive and spam make records eligible for deletion, so form posts without confirm=1 are sent to a confirmation page and JSON clients must send confirm true. Decided applications are skipped.
         */
        post: operations["bulkSubmissionAction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Export one form’s submissions as safe CSV
         * @description Returns text/csv for the submissions matching the filter; spreadsheet formula characters are neutralised.
         */
        post: operations["exportSubmissions"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/submissions/{id}/note": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add an internal note
         * @description Appends a staff-only note (max 4000 characters); notes cannot be edited or deleted and are never shown to the submitter.
         */
        post: operations["addSubmissionNote"];
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
        CursorMeta: {
            /** @description Opaque keyset cursor scoped to the filters; null on the last page. */
            nextCursor: string | null;
        };
        /**
         * @description Program that hosts the public form page.
         * @enum {string}
         */
        FormProgram: "worship" | "production" | "academy" | "web";
        /**
         * @description Decides which bind keys a form must define before it can be published.
         * @enum {string}
         */
        FormKind: "musician_application" | "technician_application" | "instructor_application" | "church_request" | "production_request" | "contact" | "partner_interest";
        /** @enum {string} */
        FormStatus: "draft" | "published" | "closed";
        /** @enum {string} */
        SubmissionStatus: "new" | "in_review" | "approved" | "declined" | "closed";
        /** @description Form definition: sections of questions as parsed by parseFormSchema. Open-ended on the wire; staff-authored drafts and published versions both use this shape. */
        FormSchema: {
            [key: string]: unknown;
        };
        FormSummary: {
            id: components["schemas"]["Identifier"];
            slug: string;
            program: components["schemas"]["FormProgram"];
            kind: components["schemas"]["FormKind"];
            title: string;
            status: components["schemas"]["FormStatus"];
            /** @description Latest published version number; null while only a draft exists. */
            currentVersion: number | null;
            updatedAt: components["schemas"]["Timestamp"];
        };
        FormDetail: {
            id: components["schemas"]["Identifier"];
            slug: string;
            program: components["schemas"]["FormProgram"];
            kind: components["schemas"]["FormKind"];
            title: string;
            description?: string | null;
            status: components["schemas"]["FormStatus"];
            confirmationMessage?: string | null;
            currentVersionId?: components["schemas"]["Identifier"] | null;
            currentVersion?: number | null;
            draftSchema: components["schemas"]["FormSchema"];
            updatedAt: components["schemas"]["Timestamp"];
        };
        CreateFormInput: {
            slug: string;
            program: components["schemas"]["FormProgram"];
            kind: components["schemas"]["FormKind"];
            title: string;
            description?: string;
            confirmationMessage?: string;
            schema?: components["schemas"]["FormSchema"];
        };
        SaveFormDraftInput: {
            title?: string;
            description?: string;
            confirmationMessage?: string;
            schema: components["schemas"]["FormSchema"];
        };
        FormResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["FormDetail"];
        };
        FormListResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["FormSummary"][];
        };
        PublishFormResponse: {
            /** @constant */
            success: true;
            data: {
                formId: components["schemas"]["Identifier"];
                versionId: components["schemas"]["Identifier"];
                version: number;
            };
        };
        FormUploadSummary: {
            id: components["schemas"]["Identifier"];
            questionId: string;
            /** @enum {string} */
            kind: "image" | "video" | "pdf" | "other";
            filename: string;
            contentType: string;
            bytes: number;
            /** @enum {string} */
            status: "pending" | "verified" | "rejected";
        };
        SubmissionSummary: {
            id: components["schemas"]["Identifier"];
            /** @description Human reference such as GW-2026-0001 (GW worship, GP production, GS web). */
            reference: string;
            formId: components["schemas"]["Identifier"];
            formTitle: string;
            kind: components["schemas"]["FormKind"];
            status: components["schemas"]["SubmissionStatus"];
            submitterName?: string | null;
            /** Format: email */
            submitterEmail?: string | null;
            submittedAt: components["schemas"]["Timestamp"];
        };
        SubmissionDetail: {
            id: components["schemas"]["Identifier"];
            reference: string;
            formId: components["schemas"]["Identifier"];
            formVersionId: components["schemas"]["Identifier"];
            kind: components["schemas"]["FormKind"];
            status: components["schemas"]["SubmissionStatus"];
            submitterName?: string | null;
            /** Format: email */
            submitterEmail?: string | null;
            submitterPhone?: string | null;
            /** @description The form version the applicant answered, so removed questions still render. */
            schema: components["schemas"]["FormSchema"];
            /** @description Answers keyed by question id. */
            answers: {
                [key: string]: unknown;
            };
            /** @description Values extracted through bind keys (contact.*, roster.*, request.*). */
            binds?: {
                [key: string]: unknown;
            };
            uploads: components["schemas"]["FormUploadSummary"][];
            staffNotes?: string | null;
            submittedAt: components["schemas"]["Timestamp"];
            reviewedAt?: components["schemas"]["Timestamp"] | null;
        };
        SubmissionListResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["SubmissionSummary"][];
            meta?: components["schemas"]["CursorMeta"];
        };
        SubmissionResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["SubmissionDetail"];
        };
        SubmissionStatusInput: {
            /**
             * @description approved and declined are set only by the approve and decline actions.
             * @enum {string}
             */
            status: "new" | "in_review" | "closed";
            notes?: string;
        };
        SubmissionStatusResponse: {
            /** @constant */
            success: true;
            data: {
                id: components["schemas"]["Identifier"];
                status: components["schemas"]["SubmissionStatus"];
            };
        };
        ApplicationDecisionInput: {
            notes?: string;
        };
        ApplicationDecisionResponse: {
            /** @constant */
            success: true;
            data: {
                id: components["schemas"]["Identifier"];
                /** @enum {string} */
                status: "approved" | "declined";
                /** @description Set on approval; null on decline. */
                rosterMemberId: components["schemas"]["Identifier"] | null;
                /** @description false when the submission was already decided (repeat is a no-op). */
                changed: boolean;
            };
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
        RosterMember: {
            id: components["schemas"]["Identifier"];
            submissionId: components["schemas"]["Identifier"];
            /** @enum {string} */
            program: "worship" | "production" | "academy";
            displayName: string;
            /** Format: email */
            email: string;
            phone?: string | null;
            roles: string[];
            city?: string | null;
            canTeach: boolean;
            /** @enum {string} */
            status: "active" | "paused" | "removed";
            /** @description Date received only; no tax identifiers are stored. */
            w9ReceivedAt?: components["schemas"]["Timestamp"] | null;
            approvedAt: components["schemas"]["Timestamp"];
        };
        RosterListResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["RosterMember"][];
            meta?: components["schemas"]["CursorMeta"];
        };
        SendOfferInput: {
            rosterMemberId: components["schemas"]["Identifier"];
            role: string;
            /** @description Integer minor units (USD cents) offered to the musician; never reduced by an administrative allocation. */
            payCents: number;
        };
        SendOfferResponse: {
            /** @constant */
            success: true;
            data: {
                offerId: components["schemas"]["Identifier"];
                /** @description Earlier of 72 hours after sending or the service start. */
                expiresAt: components["schemas"]["Timestamp"];
            };
        };
        WithdrawOfferResponse: {
            /** @constant */
            success: true;
            data: {
                offerId: components["schemas"]["Identifier"];
                /** @constant */
                status: "withdrawn";
            };
        };
        /** @description application/x-www-form-urlencoded body of the offer page POST. */
        OfferResponseForm: {
            /** @enum {string} */
            action: "accept" | "decline";
        };
        /**
         * @description gamo_admin lines are refused (400 gamo_admin_not_approved) unless GAMO_ADMIN_FEE_APPROVED=true; fees are proposals until approved. Musician pay and Gamo lines are always separate line items.
         * @enum {string}
         */
        InvoiceLineKind: "musician_pay" | "lesson" | "production" | "other" | "gamo_admin";
        /** @enum {string} */
        PaymentMethod: "stripe" | "check" | "zelle" | "ach" | "cash" | "other";
        InvoiceLine: {
            id: components["schemas"]["Identifier"];
            kind: components["schemas"]["InvoiceLineKind"];
            description: string;
            quantity: number;
            unitAmountCents: number;
            /** @description quantity x unitAmountCents, integer minor units. */
            amountCents: number;
            /** @description Set for musician_pay lines. */
            payeeRosterMemberId?: components["schemas"]["Identifier"] | null;
            payoutRecordedAt?: components["schemas"]["Timestamp"] | null;
        };
        Invoice: {
            id: components["schemas"]["Identifier"];
            /** @description Sequential per year, e.g. GS-2026-0001. */
            number: string;
            /** @enum {string} */
            sourceType: "service_request" | "academy_registration" | "manual";
            sourceId?: string | null;
            billToName: string;
            /** Format: email */
            billToEmail: string;
            /** @enum {string} */
            status: "draft" | "open" | "paid" | "void";
            /** @constant */
            currency: "usd";
            totalCents: number;
            /** Format: date */
            dueDate?: string | null;
            stripeInvoiceId?: string | null;
            /** Format: uri */
            hostedUrl?: string | null;
            paidAt?: components["schemas"]["Timestamp"] | null;
            paidMethod?: components["schemas"]["PaymentMethod"] | null;
            paidReference?: string | null;
            lines: components["schemas"]["InvoiceLine"][];
            createdAt: components["schemas"]["Timestamp"];
        };
        CreateInvoiceInput: {
            /** @enum {string} */
            sourceType: "service_request" | "academy_registration" | "manual";
            /** @description Service request or academy registration id; omit for manual invoices. */
            sourceId?: string;
            billToName: string;
            /** Format: email */
            billToEmail: string;
            /** Format: date */
            dueDate?: string;
            /** @description When omitted for a service_request source, lines are prefilled from accepted offers. */
            lines?: {
                kind: components["schemas"]["InvoiceLineKind"];
                description: string;
                /** @default 1 */
                quantity: number;
                unitAmountCents: number;
                payeeRosterMemberId?: components["schemas"]["Identifier"];
            }[];
        };
        InvoiceResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["Invoice"];
        };
        InvoiceListResponse: {
            /** @constant */
            success: true;
            data: components["schemas"]["Invoice"][];
            meta?: components["schemas"]["CursorMeta"];
        };
        SendInvoiceResponse: {
            /** @constant */
            success: true;
            data: {
                invoiceId: components["schemas"]["Identifier"];
                /**
                 * @description stripe only with Stripe test credentials; otherwise manual instructions are emailed.
                 * @enum {string}
                 */
                mode: "stripe" | "manual";
                /** Format: uri */
                hostedUrl?: string | null;
                /** @constant */
                status: "open";
            };
        };
        MarkPaidInput: {
            method: components["schemas"]["PaymentMethod"];
            reference?: string;
        };
        RecordPayoutInput: {
            method: components["schemas"]["PaymentMethod"];
            reference?: string;
        };
        RecordPayoutResponse: {
            /** @constant */
            success: true;
            data: {
                payoutId: components["schemas"]["Identifier"];
                invoiceLineId: components["schemas"]["Identifier"];
                amountCents: number;
            };
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
        /** @description Fields of one form-builder or submissions action, sent as JSON or as an HTML form post. The route validates them against the draft schema or submission rules and rejects what does not fit (400); `return` is an optional same-origin path used for the 303 redirect. */
        BuilderActionInput: {
            return?: string;
        } & {
            [key: string]: unknown;
        };
        BuilderActionResponse: {
            /** @description Result of the action; shape depends on the action and carries no personal data. */
            data: {
                [key: string]: unknown;
            };
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
        /** @description Admin middleware denies access (no staff session). */
        StaffUnauthorized: {
            headers: {
                "WWW-Authenticate"?: string;
                [name: string]: unknown;
            };
            content: {
                "text/html": string;
                "application/json": components["schemas"]["LegacyError"];
            };
        };
        /** @description Form-post form of the action succeeded; redirects back to the admin screen (the JSON form answers 200). */
        SeeOther: {
            headers: {
                Location?: string;
                [name: string]: unknown;
            };
            content?: never;
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
        limit: number;
        /** @description Opaque keyset cursor from meta.nextCursor. */
        cursor: string;
        /** @description Question id inside the draft form schema. */
        qid: string;
        /** @description Section id inside the draft form schema. */
        sid: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
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
    listForms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Forms. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FormListResponse"];
                };
            };
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createForm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateFormInput"];
                "application/x-www-form-urlencoded": components["schemas"]["CreateFormInput"];
            };
        };
        responses: {
            /** @description Created. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FormResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    getForm: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Form. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FormResponse"];
                };
            };
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormDraft: {
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
                "application/json": components["schemas"]["SaveFormDraftInput"];
                "application/x-www-form-urlencoded": components["schemas"]["SaveFormDraftInput"];
            };
        };
        responses: {
            /** @description Saved. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FormResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormDraftForm: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    publishForm: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Published. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublishFormResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    listSubmissions: {
        parameters: {
            query?: {
                formId?: string;
                program?: components["schemas"]["FormProgram"];
                status?: components["schemas"]["SubmissionStatus"];
                limit?: components["parameters"]["limit"];
                /** @description Opaque keyset cursor from meta.nextCursor. */
                cursor?: components["parameters"]["cursor"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Submissions. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubmissionListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    getSubmission: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Submission. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubmissionResponse"];
                };
            };
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    setSubmissionStatus: {
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
                "application/json": components["schemas"]["SubmissionStatusInput"];
                "application/x-www-form-urlencoded": components["schemas"]["SubmissionStatusInput"];
            };
        };
        responses: {
            /** @description Updated. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubmissionStatusResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    approveApplication: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ApplicationDecisionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["ApplicationDecisionInput"];
            };
        };
        responses: {
            /** @description Decided. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApplicationDecisionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    declineApplication: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ApplicationDecisionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["ApplicationDecisionInput"];
            };
        };
        responses: {
            /** @description Decided. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApplicationDecisionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    listRoster: {
        parameters: {
            query?: {
                program?: "worship" | "production" | "academy";
                role?: string;
                city?: string;
                status?: "active" | "paused" | "removed";
                limit?: components["parameters"]["limit"];
                /** @description Opaque keyset cursor from meta.nextCursor. */
                cursor?: components["parameters"]["cursor"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Roster members. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RosterListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    sendOffer: {
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
                "application/json": components["schemas"]["SendOfferInput"];
                "application/x-www-form-urlencoded": components["schemas"]["SendOfferInput"];
            };
        };
        responses: {
            /** @description Offer sent. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SendOfferResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    withdrawOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Withdrawn. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WithdrawOfferResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    listInvoices: {
        parameters: {
            query?: {
                status?: "draft" | "open" | "paid" | "void";
                limit?: components["parameters"]["limit"];
                /** @description Opaque keyset cursor from meta.nextCursor. */
                cursor?: components["parameters"]["cursor"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Invoices. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceListResponse"];
                };
            };
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    createInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateInvoiceInput"];
                "application/x-www-form-urlencoded": components["schemas"]["CreateInvoiceInput"];
            };
        };
        responses: {
            /** @description Created. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    sendInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SendInvoiceResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    markInvoicePaid: {
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
                "application/json": components["schemas"]["MarkPaidInput"];
                "application/x-www-form-urlencoded": components["schemas"]["MarkPaidInput"];
            };
        };
        responses: {
            /** @description Done. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    voidInvoice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvoiceResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
            503: components["responses"]["LegacyError"];
        };
    };
    recordInvoiceLinePayout: {
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
                "application/json": components["schemas"]["RecordPayoutInput"];
                "application/x-www-form-urlencoded": components["schemas"]["RecordPayoutInput"];
            };
        };
        responses: {
            /** @description Recorded. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordPayoutResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            409: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    getUploadedFile: {
        parameters: {
            query?: never;
            header?: {
                /** @description Single byte range, e.g. bytes=0-1048575. */
                Range?: string;
            };
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File bytes. */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox";
                    "Accept-Ranges"?: "bytes";
                    [name: string]: unknown;
                };
                content: {
                    "*/*": string;
                };
            };
            /** @description Partial content. */
            206: {
                headers: {
                    "Content-Range"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "*/*": string;
                };
            };
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            416: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    closeForm: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    reopenForm: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    restoreFormVersion: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormSettingsPut: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormSettings: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    addFormQuestion: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormQuestionPut: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    deleteFormQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    duplicateFormQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    moveFormQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    changeFormQuestionType: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Question id inside the draft form schema. */
                qid: components["parameters"]["qid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    addFormSection: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormSectionPut: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Section id inside the draft form schema. */
                sid: components["parameters"]["sid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    saveFormSection: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Section id inside the draft form schema. */
                sid: components["parameters"]["sid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    deleteFormSection: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Resource identifier from the path. */
                id: components["parameters"]["id"];
                /** @description Section id inside the draft form schema. */
                sid: components["parameters"]["sid"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    bulkSubmissionAction: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    exportSubmissions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
    addSubmissionNote: {
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
                "application/json": components["schemas"]["BuilderActionInput"];
                "application/x-www-form-urlencoded": components["schemas"]["BuilderActionInput"];
            };
        };
        responses: {
            /** @description Done (JSON clients). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuilderActionResponse"];
                };
            };
            303: components["responses"]["SeeOther"];
            400: components["responses"]["LegacyError"];
            401: components["responses"]["StaffUnauthorized"];
            403: components["responses"]["LegacyError"];
            404: components["responses"]["LegacyError"];
            500: components["responses"]["LegacyError"];
        };
    };
}
