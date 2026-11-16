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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
