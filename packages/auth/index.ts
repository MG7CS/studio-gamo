import { Lucia } from "lucia";
import { D1Adapter } from "@lucia-auth/adapter-sqlite";

// We'll create a factory function so each Cloudflare Worker can initialize it with its own D1 binding.
export function initializeAuth(dbBinding: D1Database) {
	const adapter = new D1Adapter(dbBinding, {
		user: "users",
		session: "sessions"
	});

	return new Lucia(adapter, {
		sessionCookie: {
			attributes: {
				secure: true // process.env.NODE_ENV === "production"
			}
		},
		getUserAttributes: (attributes) => {
			return {
				email: attributes.email,
        status: attributes.status
			};
		}
	});
}

declare module "lucia" {
	interface Register {
		Auth: ReturnType<typeof initializeAuth>;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	email: string;
  status: string;
}
