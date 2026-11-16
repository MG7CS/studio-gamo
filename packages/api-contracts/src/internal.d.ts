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
    parameters: never;
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
}
