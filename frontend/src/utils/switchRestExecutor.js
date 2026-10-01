// Talks directly to a switch's onboard REST API from the browser (Netgear M4300/M4250
// "ConfigAgent" API, HTTPS on :8443). Nothing here ever calls back to ShowReady's own
// backend -- credentials and the switch's IP never leave the browser.
//
// Two things a viewer needs to do once per switch before this can work, both outside
// our control: (1) accept the switch's self-signed certificate by visiting its HTTPS
// admin URL directly in a new tab, and (2) grant Chrome's "local network access"
// permission prompt, which fires automatically on the first request below. Both are
// Chrome/Edge-only browser features.
//
// The exact login response shape and per-endpoint payloads are best-effort (see
// app/services/switch_drivers/netgear_m4300.py's module docstring for why) -- this
// tries a bearer token first and falls back to cookie-based session auth so it keeps
// working either way once the real shape is confirmed.

const LOGIN_TOKEN_KEYS = ['token', 'access_token', 'jwt', 'session_token'];

function extractAuthToken(payload) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of LOGIN_TOKEN_KEYS) {
        if (typeof payload[key] === 'string') return payload[key];
    }
    // Netgear's documented shape nests the request body under its own key
    // (e.g. {"login": {...}}); check one level down for the same token keys.
    for (const value of Object.values(payload)) {
        if (value && typeof value === 'object') {
            for (const key of LOGIN_TOKEN_KEYS) {
                if (typeof value[key] === 'string') return value[key];
            }
        }
    }
    return null;
}

function baseUrl(ip) {
    return `https://${ip}:8443`;
}

function friendlyConnectError(ip) {
    return (
        `Could not reach the switch at ${ip}. If you haven't already, open ${baseUrl(ip)} ` +
        'in a new tab and accept the certificate warning, then try again. This also requires ' +
        'Chrome or Edge, with the "local network" permission allowed when prompted.'
    );
}

// { ok, token?, message? }
export async function testSwitchRestConnection({ ip, username, password }) {
    try {
        const res = await fetch(`${baseUrl(ip)}/api/v1/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: { username, password } }),
        });
        if (!res.ok) {
            return { ok: false, message: `The switch rejected the connection (HTTP ${res.status}). Check the username and password.` };
        }
        let token = null;
        try {
            const payload = await res.json();
            token = extractAuthToken(payload);
        } catch {
            // No JSON body / not a token-based session -- fine, we'll rely on the cookie.
        }
        return { ok: true, token };
    } catch {
        return { ok: false, message: friendlyConnectError(ip) };
    }
}

function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Runs an ordered REST step plan (from GET /switches/{id}/rest_plan) against the
// switch directly. Calls onStepUpdate(index, result) after each step so the caller can
// render live progress. Steps marked `implemented: false` are skipped, not attempted --
// their exact endpoint/payload isn't confirmed yet.
export async function runSwitchRestPlan({ ip, token }, steps, onStepUpdate) {
    const results = [];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (!step.implemented) {
            const result = { status: 'skipped', message: 'Not yet supported for this switch -- skipped.' };
            results.push(result);
            onStepUpdate?.(i, result);
            continue;
        }

        try {
            const res = await fetch(`${baseUrl(ip)}${step.path}`, {
                method: step.method,
                credentials: 'include',
                headers: authHeaders(token),
                body: step.body ? JSON.stringify(step.body) : undefined,
            });
            const result = res.ok
                ? { status: 'success', message: null }
                : { status: 'failed', message: `HTTP ${res.status}` };
            results.push(result);
            onStepUpdate?.(i, result);
            if (!res.ok) {
                // Keep going -- one failed step (e.g. a VLAN that already exists)
                // shouldn't abort the rest of an otherwise-good run.
                continue;
            }
        } catch {
            const result = { status: 'failed', message: friendlyConnectError(ip) };
            results.push(result);
            onStepUpdate?.(i, result);
        }
    }
    return results;
}
