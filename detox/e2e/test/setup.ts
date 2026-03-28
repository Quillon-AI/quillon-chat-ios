// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable no-await-in-loop, no-console */

import {execSync} from 'child_process';

import {ClaudePromptHandler} from '@support/pilot/ClaudePromptHandler';
import {Plugin, System, User} from '@support/server_api';
import {siteOneUrl} from '@support/test_config';

const BUNDLE_ID = 'com.mattermost.rnbeta';

// ─── Admin API login ─────────────────────────────────────────────────────────

async function loginAdmin(): Promise<void> {
    await System.apiCheckSystemHealth(siteOneUrl);

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const {error: loginError} = await User.apiAdminLogin(siteOneUrl);
        if (loginError) {
            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Admin login failed after ${MAX_ATTEMPTS} attempts: ${JSON.stringify(loginError)}`);
            }
            console.warn(`⚠️ Admin login attempt ${attempt} failed, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            continue;
        }

        const {error: meError} = await User.apiGetMe(siteOneUrl);
        if (!meError) {
            console.info(`✅ Admin session verified on attempt ${attempt}`);
            return;
        }
        if (attempt === MAX_ATTEMPTS) {
            throw new Error(`Admin session not usable after ${MAX_ATTEMPTS} login attempts`);
        }
        console.warn(`⚠️ Session check failed on attempt ${attempt}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
}

// Android 13+ (API 33+): the `permissions` key in device.launchApp() only works
// on iOS simulators. On Android, notification permission must be granted via adb.
function grantAndroidNotificationPermission(): void {
    if (device.getPlatform() !== 'android') {
        return;
    }
    try {
        execSync(`adb shell pm grant ${BUNDLE_ID} android.permission.POST_NOTIFICATIONS`, {stdio: 'pipe'});
    } catch {
        // API < 33 or already granted
    }
}

// ─── Global beforeAll ────────────────────────────────────────────────────────
// Runs before each test file.
// Responsibilities: launch app with clean state, admin login, plugin cleanup.

beforeAll(async () => {
    const isFirstFile = !process.env.DETOX_SETUP_DONE;

    if (isFirstFile) {
        process.env.DETOX_SETUP_DONE = 'true';

        // First file: app is freshly installed by Detox or CI pre-boot step.
        await device.launchApp({
            newInstance: true,
            permissions: {notifications: 'YES', camera: 'NO', medialibrary: 'NO', photos: 'NO'},
            launchArgs: {detoxDisableSynchronization: 'YES'},
        });
    } else {
        // Subsequent files: delete + reinstall for clean state (wipes DB, Keychain, caches).
        await device.launchApp({
            delete: true,
            permissions: {notifications: 'YES', camera: 'NO', medialibrary: 'NO', photos: 'NO'},
            launchArgs: {detoxDisableSynchronization: 'YES'},
        });
    }

    grantAndroidNotificationPermission();
    console.info('✅ App launched');

    // Initialize Claude AI prompt handler if available
    try {
        if (process.env.ANTHROPIC_API_KEY) {
            pilot.init(new ClaudePromptHandler(process.env.ANTHROPIC_API_KEY));
        }
    } catch (e) {
        console.warn('Claude init failed:', e);
    }

    // Admin login for test data setup + disable interfering plugins
    await loginAdmin();
    await Plugin.apiDisableNonPrepackagedPlugins(siteOneUrl);
});
