// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Quillon SSO bridge: when MM rejects credentials with 401, ask LMS to validate
 * them and lazily create the matching MM user, then the caller can retry MM
 * login. Mirrors the web flow in `quillon-chat/login.html` (which calls
 * `quillon-lms-back` PRs #2 + #3).
 *
 * Flow:
 *   1. caller tries client.login() → MM 401 → throws
 *   2. caller calls tryLmsProvisionMattermostUser({loginId, password})
 *   3. helper asks LMS to (a) validate creds and (b) provision MM user
 *   4. caller retries client.login()
 */
import LocalConfig from '@assets/config.json';
import {logDebug} from '@utils/log';

const LMS_BASE = (LocalConfig as unknown as Record<string, string | undefined>).LMSBaseUrl || 'https://lms.quillon.ru';
const TIMEOUT_MS = 10_000;

const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, {...init, signal: controller.signal});
    } finally {
        clearTimeout(timeout);
    }
};

const post = (url: string, body: unknown) => fetchWithTimeout(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
});

/**
 * Returns true if a Mattermost user now exists with these credentials (either
 * because LMS just provisioned one, or because they already existed and LMS
 * just verified the password matches). Returns false on any failure — the
 * caller should treat that as "stick with the original MM error".
 */
export const tryLmsProvisionMattermostUser = async (loginId: string, password: string): Promise<boolean> => {
    const trimmed = loginId.trim();
    if (!trimmed || !password) {
        return false;
    }

    try {
        const auth = await post(`${LMS_BASE}/users/auth/`, {username: trimmed, password});
        if (!auth.ok) {
            logDebug('LMS auth rejected creds', auth.status);
            return false;
        }

        const provision = await post(`${LMS_BASE}/api/v1/users/mattermost_provision/`, {username: trimmed, password});
        if (!provision.ok) {
            logDebug('LMS mattermost_provision failed', provision.status);
            return false;
        }

        return true;
    } catch (err) {
        logDebug('LMS provision unreachable', String(err));
        return false;
    }
};

// MM returns these error ids when MFA is required or a submitted token is
// invalid. Mirrors `MFA_EXPECTED_ERRORS` in app/screens/login/form.tsx — keep
// in sync if MM adds new variants.
const MFA_ERROR_IDS = new Set([
    'mfa.validate_token.authenticate.app_error',
    'ent.mfa.validate_token.authenticate.app_error',
    'api.context.mfa_required.app_error',
]);

/**
 * Did MM reject this login because the user has MFA enabled and we either
 * didn't send a token or sent a wrong one? In that case the SSO bridge must
 * NOT trigger LMS provisioning — the user already exists, they just need to
 * complete the MFA step (handled by the original Mattermost login flow).
 */
export const isMfaRequiredError = (error: unknown): boolean => {
    const e = error as {server_error_id?: string} | undefined;
    if (!e || typeof e !== 'object' || !e.server_error_id) {
        return false;
    }
    return MFA_ERROR_IDS.has(e.server_error_id);
};

/**
 * Heuristic: did the MM /api/v4/users/login call reject because of bad/missing
 * credentials? We only want to fall back to LMS provisioning in that case —
 * not on network failures, MFA-required, or server-side problems.
 */
export const isMattermostAuthError = (error: unknown): boolean => {
    const e = error as {status_code?: number; server_error_id?: string} | undefined;
    if (!e || typeof e !== 'object') {
        return false;
    }

    // MFA-required also surfaces as 401, but it means "user exists, finish
    // 2FA", not "wrong password". Rule it out before the generic 401 check.
    if (isMfaRequiredError(e)) {
        return false;
    }
    if (e.status_code === 401) {
        return true;
    }

    // MM uses these error ids for "wrong password" / "user not found"
    return e.server_error_id === 'api.user.login.invalid_credentials_email_username' ||
        e.server_error_id === 'api.user.check_user_password.invalid.app_error' ||
        e.server_error_id === 'app.user.missing_account.const' ||
        e.server_error_id === 'store.sql_user.get_for_login.app_error';
};
