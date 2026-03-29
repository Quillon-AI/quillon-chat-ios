// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable no-await-in-loop, no-console */

import {execSync} from 'child_process';

import {ClaudePromptHandler} from '@support/pilot/ClaudePromptHandler';
import {System, User} from '@support/server_api';
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
    // On Android, explicitly clear app data before every launch. Two reasons:
    // 1) The first-file path (newInstance, no delete) can inherit stale state
    //    from a previous CI run or pre-boot step.
    // 2) Detox's delete:true on subsequent files occasionally fails to fully
    //    clear data on CI emulators (observed: app shows channel list instead
    //    of server screen after delete:true).
    if (device.getPlatform() === 'android') {
        try {
            execSync(`adb shell pm clear ${BUNDLE_ID}`, {stdio: 'pipe'});
        } catch {
            // Package might not be installed yet on first run
        }
    }

    const isFirstFile = !process.env.DETOX_SETUP_DONE;
    const launchPermissions = {notifications: 'YES', camera: 'NO', medialibrary: 'NO', photos: 'NO'} as const;
    const launchArgs = {detoxDisableSynchronization: 'YES'};

    if (isFirstFile) {
        process.env.DETOX_SETUP_DONE = 'true';

        // First file: app is freshly installed by Detox or CI pre-boot step.
        await device.launchApp({
            newInstance: true,
            permissions: launchPermissions,
            launchArgs,
        });
    } else {
        // Subsequent files: delete + reinstall for clean state (wipes DB, Keychain, caches).
        // The delete path is fragile on CI — Detox occasionally loses connection to the
        // app after uninstall/reinstall (especially on iPad simulators).  Retry up to 2
        // additional times, falling back to newInstance on the last attempt.
        const MAX_LAUNCH_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_LAUNCH_ATTEMPTS; attempt++) {
            try {
                if (attempt < MAX_LAUNCH_ATTEMPTS) {
                    await device.launchApp({
                        delete: true,
                        permissions: launchPermissions,
                        launchArgs,
                    });
                } else {
                    // Last resort: skip delete, just relaunch fresh instance.
                    // State may not be perfectly clean but the connection will survive.
                    console.warn('⚠️ delete:true failed twice, falling back to newInstance:true');
                    await device.launchApp({
                        newInstance: true,
                        permissions: launchPermissions,
                        launchArgs,
                    });
                }
                break; // success
            } catch (launchError) {
                if (attempt === MAX_LAUNCH_ATTEMPTS) {
                    throw launchError;
                }
                console.warn(`⚠️ device.launchApp attempt ${attempt} failed, retrying in 3s...`, String(launchError).slice(0, 200));
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }
    }

    grantAndroidNotificationPermission();

    // Wait for the React Native bundle to fully load and the server screen to render.
    // CI simulators/emulators can take 30-60s after fresh install for ART compilation,
    // JS bundle parsing, and initial render. 60s for both platforms.
    const appReadyTimeout = 60000;
    await waitFor(element(by.id('server.screen'))).toExist().withTimeout(appReadyTimeout);

    console.info('✅ App launched');

    // Initialize Claude AI prompt handler if available
    try {
        if (process.env.ANTHROPIC_API_KEY) {
            pilot.init(new ClaudePromptHandler(process.env.ANTHROPIC_API_KEY));
        }
    } catch (e) {
        console.warn('Claude init failed:', e);
    }

    // Admin login — populates the cookie jar for this file's apiInit() calls.
    // Server config + plugin cleanup already done once in global_setup.js.
    await loginAdmin();
});
