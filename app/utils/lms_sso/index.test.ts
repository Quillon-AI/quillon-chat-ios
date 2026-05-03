// Copyright (c) 2026-present Quillon, Inc. All Rights Reserved.

import {isMattermostAuthError, tryLmsProvisionMattermostUser} from './';

const mockResponse = (ok: boolean, status = ok ? 200 : 401) => ({ok, status} as Response);

describe('lms_sso', () => {
    describe('isMattermostAuthError', () => {
        it('returns true for 401 status_code', () => {
            expect(isMattermostAuthError({status_code: 401})).toBe(true);
        });

        it('returns true for known invalid-credentials server_error_id', () => {
            expect(isMattermostAuthError({
                status_code: 400,
                server_error_id: 'api.user.login.invalid_credentials_email_username',
            })).toBe(true);
            expect(isMattermostAuthError({server_error_id: 'app.user.missing_account.const'})).toBe(true);
        });

        it('returns false for non-auth errors', () => {
            expect(isMattermostAuthError({status_code: 500})).toBe(false);
            expect(isMattermostAuthError({status_code: 400, server_error_id: 'api.context.mfa_required.app_error'})).toBe(false);
        });

        it('returns false for null/undefined/non-object', () => {
            expect(isMattermostAuthError(null)).toBe(false);
            expect(isMattermostAuthError(undefined)).toBe(false);
            expect(isMattermostAuthError('string error')).toBe(false);
            expect(isMattermostAuthError(42)).toBe(false);
        });
    });

    describe('tryLmsProvisionMattermostUser', () => {
        const originalFetch = global.fetch;

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it('returns false on empty creds without making any call', async () => {
            const fetchMock = jest.fn();
            global.fetch = fetchMock;
            expect(await tryLmsProvisionMattermostUser('', 'pw')).toBe(false);
            expect(await tryLmsProvisionMattermostUser('user', '')).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('calls LMS auth then provision when both succeed', async () => {
            const fetchMock = jest.fn()
                .mockResolvedValueOnce(mockResponse(true))
                .mockResolvedValueOnce(mockResponse(true));
            global.fetch = fetchMock;

            const result = await tryLmsProvisionMattermostUser('alice@quillon.ru', 'pw');

            expect(result).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(fetchMock.mock.calls[0][0]).toContain('/users/auth/');
            expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/users/mattermost_provision/');
            const authBody = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(authBody).toEqual({username: 'alice@quillon.ru', password: 'pw'});
        });

        it('returns false (and skips provision) if LMS auth fails', async () => {
            const fetchMock = jest.fn().mockResolvedValueOnce(mockResponse(false, 401));
            global.fetch = fetchMock;

            const result = await tryLmsProvisionMattermostUser('alice@quillon.ru', 'wrong');

            expect(result).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('returns false if provision fails after auth succeeds', async () => {
            const fetchMock = jest.fn()
                .mockResolvedValueOnce(mockResponse(true))
                .mockResolvedValueOnce(mockResponse(false, 503));
            global.fetch = fetchMock;

            const result = await tryLmsProvisionMattermostUser('alice@quillon.ru', 'pw');

            expect(result).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('returns false on network error', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
            const result = await tryLmsProvisionMattermostUser('alice@quillon.ru', 'pw');
            expect(result).toBe(false);
        });

        it('trims whitespace from loginId', async () => {
            const fetchMock = jest.fn()
                .mockResolvedValueOnce(mockResponse(true))
                .mockResolvedValueOnce(mockResponse(true));
            global.fetch = fetchMock;

            await tryLmsProvisionMattermostUser('  alice@quillon.ru  ', 'pw');

            const authBody = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(authBody.username).toBe('alice@quillon.ru');
        });
    });
});
