#!/usr/bin/env tsx
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-process-env, no-console */

import fs from 'fs';
import http, {type IncomingMessage, type RequestOptions} from 'http';
import https from 'https';

const SITE_1_URL = process.env.SITE_1_URL as string;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD as string;
const TWO_USERS = process.argv.includes('--two-users');
const ENV_FILE = '.maestro-test-env.sh';

if (!SITE_1_URL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('[seed] Error: SITE_1_URL, ADMIN_USERNAME, and ADMIN_PASSWORD are required');
    process.exit(1);
}

// Generate a short random prefix to keep test entities unique across runs
function randomPrefix(): string {
    return Math.random().toString(36).slice(2, 8);
}

function request(method: string, urlPath: string, body: object | null, token?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const url = new URL(SITE_1_URL + urlPath);
        const lib = url.protocol === 'https:' ? https : http;
        const payload = body ? JSON.stringify(body) : null;
        const options: RequestOptions = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? {Authorization: `Bearer ${token}`} : {}),
                ...(payload ? {'Content-Length': Buffer.byteLength(payload)} : {}),
            },
        };

        const req = lib.request(options, (res: IncomingMessage) => {
            let data = '';
            res.on('data', (chunk: string) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if ((res.statusCode ?? 0) >= 400) {
                        reject(new Error(`[seed] HTTP ${res.statusCode} on ${method} ${urlPath}: ${parsed.message || data}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`[seed] Failed to parse response from ${method} ${urlPath}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

function loginAndGetToken(): Promise<{user: any; token: string}> {
    return new Promise((resolve, reject) => {
        const url = new URL(SITE_1_URL + '/api/v4/users/login');
        const lib = url.protocol === 'https:' ? https : http;
        const loginId = ADMIN_USERNAME;
        const payload = JSON.stringify({login_id: loginId, password: ADMIN_PASSWORD});
        const options: RequestOptions = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = lib.request(options, (res: IncomingMessage) => {
            let data = '';
            res.on('data', (chunk: string) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if ((res.statusCode ?? 0) >= 400) {
                        reject(new Error(`[seed] Login failed (HTTP ${res.statusCode}): ${parsed.message || data}`));
                        return;
                    }
                    const sessionToken = res.headers.token as string;
                    if (!sessionToken) {
                        reject(new Error('[seed] Login succeeded but no session token in response headers'));
                        return;
                    }
                    resolve({user: parsed, token: sessionToken});
                } catch (e) {
                    reject(new Error(`[seed] Failed to parse login response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function createUser(adminToken: string, prefix: string, index: string | number = ''): Promise<any> {
    const suffix = index ? `_${index}` : '';
    const email = `maestro_${prefix}${suffix}@example.com`;
    const username = `maestro_${prefix}${suffix}`;
    const password = 'Test1234!';

    const user = await request('POST', '/api/v4/users', {
        email,
        username,
        password,
        first_name: 'Maestro',
        last_name: `Test${suffix}`,
    }, adminToken);

    console.log(`[seed] Created user: ${username} (id: ${user.id})`);
    return {...user, email, password};
}

async function createTeam(adminToken: string, prefix: string): Promise<any> {
    const team = await request('POST', '/api/v4/teams', {
        name: `maestro-${prefix}`,
        display_name: `Maestro ${prefix}`,
        type: 'O',
    }, adminToken);

    console.log(`[seed] Created team: ${team.name} (id: ${team.id})`);
    return team;
}

async function createChannel(adminToken: string, teamId: string, prefix: string): Promise<any> {
    const channel = await request('POST', '/api/v4/channels', {
        team_id: teamId,
        name: `maestro-${prefix}`,
        display_name: `Maestro ${prefix}`,
        type: 'O',
    }, adminToken);

    console.log(`[seed] Created channel: ${channel.name} (id: ${channel.id})`);
    return channel;
}

async function addUserToTeam(adminToken: string, teamId: string, userId: string): Promise<void> {
    await request('POST', `/api/v4/teams/${teamId}/members`, {
        team_id: teamId,
        user_id: userId,
    }, adminToken);
    console.log(`[seed] Added user ${userId} to team ${teamId}`);
}

async function addUserToChannel(adminToken: string, channelId: string, userId: string): Promise<void> {
    await request('POST', `/api/v4/channels/${channelId}/members`, {
        user_id: userId,
    }, adminToken);
    console.log(`[seed] Added user ${userId} to channel ${channelId}`);
}

function writeEnvFile(vars: Record<string, string>): void {
    const lines = Object.entries(vars).
        map(([k, v]) => `export ${k}="${v}"`).
        join('\n');
    fs.writeFileSync(ENV_FILE, `#!/bin/bash\n# Auto-generated by maestro/fixtures/seed.ts — do not edit\n${lines}\n`);
    console.log(`[seed] Wrote env vars to ${ENV_FILE}`);
}

async function ensureEnterpriseLicense(adminToken: string): Promise<void> {
    try {
        const license = await request('GET', '/api/v4/license/client?format=old', null, adminToken);
        if (license.IsLicensed === 'true') {
            console.log('[seed] Server already has Enterprise license.');
            return;
        }
    } catch {
        // Could not check license, try requesting trial anyway
    }

    console.log('[seed] No Enterprise license — requesting trial...');
    try {
        await request('POST', '/api/v4/trial-license', {
            users: 100,
            terms_accepted: true,
            receive_emails_accepted: true,
            contact_name: 'E2E Test',
            contact_email: 'admin@example.mattermost.com',
            company_name: 'Mattermost E2E',
            company_country: 'US',
            company_size: 'ONE_TO_50',
        }, adminToken);
        console.log('[seed] Trial Enterprise license activated.');
    } catch (err: any) {
        console.warn(`[seed] Failed to request trial license: ${err.message}`);
    }
}

async function main(): Promise<void> {
    const {user: adminUser, token: adminToken} = await loginAndGetToken();
    console.log(`[seed] Admin session token obtained (admin id: ${adminUser.id})`);

    await ensureEnterpriseLicense(adminToken);

    const prefix = randomPrefix();
    const team = await createTeam(adminToken, prefix);
    const channel = await createChannel(adminToken, team.id, prefix);

    // Add admin to team/channel so they can manage it
    await addUserToTeam(adminToken, team.id, adminUser.id);
    await addUserToChannel(adminToken, channel.id, adminUser.id);

    const envVars: Record<string, string> = {
        SITE_1_URL,
        ADMIN_TOKEN: adminToken,
        TEST_TEAM_NAME: team.name,
        TEST_TEAM_ID: team.id,
        TEST_CHANNEL_NAME: channel.name,
        TEST_CHANNEL_ID: channel.id,
    };

    if (TWO_USERS) {
        // Create two distinct users for multi-device tests
        const userA = await createUser(adminToken, prefix, 'a');
        const userB = await createUser(adminToken, prefix, 'b');

        for (const u of [userA, userB]) {
            // eslint-disable-next-line no-await-in-loop
            await addUserToTeam(adminToken, team.id, u.id);
            // eslint-disable-next-line no-await-in-loop
            await addUserToChannel(adminToken, channel.id, u.id);
        }

        envVars.USER_A_EMAIL = userA.email;
        envVars.USER_A_PASSWORD = userA.password;
        envVars.USER_A_ID = userA.id;
        envVars.USER_B_EMAIL = userB.email;
        envVars.USER_B_PASSWORD = userB.password;
        envVars.USER_B_ID = userB.id;
    } else {
        // Single user for standard flows
        const testUser = await createUser(adminToken, prefix);
        await addUserToTeam(adminToken, team.id, testUser.id);
        await addUserToChannel(adminToken, channel.id, testUser.id);

        envVars.TEST_USER_EMAIL = testUser.email;
        envVars.TEST_USER_PASSWORD = testUser.password;
        envVars.TEST_USER_ID = testUser.id;
    }

    writeEnvFile(envVars);
    console.log('[seed] Done.');
}

main().catch((err: Error) => {
    console.error('[seed] Fatal error:', err.message);
    process.exit(1);
});
