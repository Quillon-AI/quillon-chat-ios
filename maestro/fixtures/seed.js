#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-process-env, no-console */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');

const SITE_1_URL = process.env.SITE_1_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TWO_USERS = process.argv.includes('--two-users');
const ENV_FILE = '.maestro-test-env.sh';

if (!SITE_1_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('[seed] Error: SITE_1_URL, ADMIN_EMAIL, and ADMIN_PASSWORD are required');
    process.exit(1);
}

// Generate a short random prefix to keep test entities unique across runs
function randomPrefix() {
    return Math.random().toString(36).slice(2, 8);
}

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(SITE_1_URL + path);
        const lib = url.protocol === 'https:' ? https : http;
        const payload = body ? JSON.stringify(body) : null;
        const options = {
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

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`[seed] HTTP ${res.statusCode} on ${method} ${path}: ${parsed.message || data}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`[seed] Failed to parse response from ${method} ${path}: ${data}`));
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

async function loginAndGetToken() {
    return new Promise((resolve, reject) => {
        const url = new URL(SITE_1_URL + '/api/v4/users/login');
        const lib = url.protocol === 'https:' ? https : http;
        const payload = JSON.stringify({login_id: ADMIN_EMAIL, password: ADMIN_PASSWORD});
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const sessionToken = res.headers.token;
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

async function createUser(adminToken, prefix, index = '') {
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

async function createTeam(adminToken, prefix) {
    const team = await request('POST', '/api/v4/teams', {
        name: `maestro-${prefix}`,
        display_name: `Maestro ${prefix}`,
        type: 'O',
    }, adminToken);

    console.log(`[seed] Created team: ${team.name} (id: ${team.id})`);
    return team;
}

async function createChannel(adminToken, teamId, prefix) {
    const channel = await request('POST', '/api/v4/channels', {
        team_id: teamId,
        name: `maestro-${prefix}`,
        display_name: `Maestro ${prefix}`,
        type: 'O',
    }, adminToken);

    console.log(`[seed] Created channel: ${channel.name} (id: ${channel.id})`);
    return channel;
}

async function addUserToTeam(adminToken, teamId, userId) {
    await request('POST', `/api/v4/teams/${teamId}/members`, {
        team_id: teamId,
        user_id: userId,
    }, adminToken);
    console.log(`[seed] Added user ${userId} to team ${teamId}`);
}

async function addUserToChannel(adminToken, channelId, userId) {
    await request('POST', `/api/v4/channels/${channelId}/members`, {
        user_id: userId,
    }, adminToken);
    console.log(`[seed] Added user ${userId} to channel ${channelId}`);
}

function writeEnvFile(vars) {
    const lines = Object.entries(vars).
        map(([k, v]) => `export ${k}="${v}"`).
        join('\n');
    fs.writeFileSync(ENV_FILE, `#!/bin/bash\n# Auto-generated by maestro/fixtures/seed.js — do not edit\n${lines}\n`);
    console.log(`[seed] Wrote env vars to ${ENV_FILE}`);
}

async function main() {
    const {user: adminUser, token: adminToken} = await loginAndGetToken();
    console.log(`[seed] Admin session token obtained (admin id: ${adminUser.id})`);

    const prefix = randomPrefix();
    const team = await createTeam(adminToken, prefix);
    const channel = await createChannel(adminToken, team.id, prefix);

    // Add admin to team/channel so they can manage it
    await addUserToTeam(adminToken, team.id, adminUser.id);
    await addUserToChannel(adminToken, channel.id, adminUser.id);

    const envVars = {
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

main().catch((err) => {
    console.error('[seed] Fatal error:', err.message);
    process.exit(1);
});
