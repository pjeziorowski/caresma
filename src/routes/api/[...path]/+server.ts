import type { RequestHandler } from './$types';
import app from '$lib/server/api';

// Handle all HTTP methods by passing the request to Hono
// Strip /api prefix since Hono routes are defined without it
const handler: RequestHandler = ({ request }) => {
	const url = new URL(request.url);
	url.pathname = url.pathname.replace(/^\/api/, '') || '/';
	return app.fetch(new Request(url, request));
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
