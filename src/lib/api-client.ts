import { hc } from 'hono/client';
import type { AppType } from '$lib/server/api';

/**
 * Pre-compiled client type - fixes IDE/svelte-language-server performance issues.
 * See: https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended
 *
 * This trick calculates the type at compile time instead of having
 * tsserver instantiate complex types on every use.
 */
export type ApiClient = ReturnType<typeof hc<AppType>>;

export const hcWithType = (...args: Parameters<typeof hc>): ApiClient => hc<AppType>(...args);

/**
 * Convenience function with defaults for SvelteKit.
 * Pass SvelteKit's fetch in load functions for server-side calls (no network roundtrip).
 */
export function createApiClient(customFetch?: typeof fetch) {
	return hcWithType('/api', {
		fetch: customFetch ?? fetch
	});
}
