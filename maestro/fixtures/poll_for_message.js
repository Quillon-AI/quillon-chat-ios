// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-process-env, no-console */

'use strict';

const http = require('http');
const https = require('https');

const SITE_1_URL = process.env.SITE_1_URL;
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const TEST_CHANNEL_ID = process.env.TEST_CHANNEL_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 2000;

if (!SITE_1_URL || !SYNC_TOKEN || !TEST_CHANNEL_ID || !ADMIN_TOKEN) {
    console.error('[poll_for_message] Error: SITE_1_URL, SYNC_TOKEN, TEST_CHANNEL_ID, and ADMIN_TOKEN are required');
    process.exit(1);
}

function get(url, token) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {Authorization: `Bearer ${token}`},
        };
        lib.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`[poll_for_message] Failed to parse response: ${data}`));
                }
            });
        }).on('error', reject);
    });
}

async function pollForMessage() {
    for (let i = 0; i < MAX_POLLS; i++) {
        // eslint-disable-next-line no-await-in-loop
        const posts = await get(
            `${SITE_1_URL}/api/v4/channels/${TEST_CHANNEL_ID}/posts?per_page=10`,
            ADMIN_TOKEN,
        );
        const found = Object.values(posts.posts || {}).some(
            (p) => p.message && p.message.includes(SYNC_TOKEN),
        );
        if (found) {
            console.log(`[poll_for_message] Found message with token ${SYNC_TOKEN} after ${i + 1} polls`);
            process.exit(0);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.error(`[poll_for_message] Timed out waiting for message with token ${SYNC_TOKEN}`);
    process.exit(1);
}

pollForMessage().catch((err) => {
    console.error('[poll_for_message] Error:', err.message);
    process.exit(1);
});
