// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable no-await-in-loop, no-console */

import {execSync} from 'child_process';

import {ClaudePromptHandler} from '@support/pilot/ClaudePromptHandler';
import {System, User} from '@support/server_api';
import {siteOneUrl} from '@support/test_config';

const BUNDLE_ID = 'com.mattermost.rnbeta';

// ─── iOS app state reset ─────────────────────────────────────────────────────
// On iOS, `device.launchApp({ delete: true })` triggers a full uninstall +
// reinstall cycle. This is notoriously fragile on CI — Detox frequently loses
// its WebSocket connection to the app during the reinstall, especially on
// resource-constrained macOS-15 runners (3 cores, 7 GB RAM) with iOS 26.x
// simulators.  The failure mode: `server.screen` never appears within 60 s.
//
// Fix: clear the app's data container via simctl + clear keychain, then
// relaunch with `newInstance: true`.  The app binary stays installed (matching
// the CI pre-boot step), so Detox never drops its connection.

function getSimulatorId(): string {
    // Detox exposes the allocated device UDID via an internal API.
    // Fallback to the CI-provided env var set during pre-boot.
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const udid = (device as any)._deviceId || (device as any).id || process.env.SIMULATOR_ID || '';
        return typeof udid === 'string' ? udid : '';
    } catch {
        return process.env.SIMULATOR_ID || '';
    }
}

function clearIOSAppData(): void {
    const simId = getSimulatorId();
    if (!simId) {
        console.warn('[clearIOSAppData] No simulator ID — skipping data wipe');
        return;
    }

    // 1. Terminate the app if running (simctl terminate can hang on iOS 26.x — timeout it)
    try {
        execSync(`timeout 10 xcrun simctl terminate "${simId}" ${BUNDLE_ID}`, {stdio: 'pipe'});
    } catch {
        // App might not be running — that's fine
    }

    // 2. Find the app's data container and delete its contents.
    //    This wipes databases, caches, preferences — equivalent to a fresh install
    //    but without touching the app binary.
    try {
        const dataContainer = execSync(
            `xcrun simctl get_app_container "${simId}" ${BUNDLE_ID} data 2>/dev/null`,
            {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
        ).trim();

        if (dataContainer) {
            // Remove all contents of Documents, Library, tmp (but keep the container dir)
            execSync(`find "${dataContainer}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +`, {stdio: 'pipe'});
            console.info(`[clearIOSAppData] Cleared data container: ${dataContainer}`);
        }
    } catch {
        console.warn('[clearIOSAppData] Could not clear data container (app may not be installed yet)');
    }

    // 3. Clear the keychain (removes stored auth tokens, certificates)
    try {
        execSync(`xcrun simctl keychain "${simId}" reset`, {stdio: 'pipe'});
    } catch {
        // Older simctl versions may not support keychain reset — non-fatal
    }
}

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
        // Subsequent files: reset app state and relaunch.
        //
        // IMPORTANT: We intentionally avoid `delete: true` on iOS. That flag
        // triggers uninstall → reinstall → launch, which frequently breaks the
        // Detox WebSocket connection on CI (macOS-15 runners with 3 cores / 7 GB
        // RAM + iOS 26.x simulators). ~30% of shards fail with "server.screen
        // never appeared within 60 s" because the reinstall race kills the
        // connection.
        //
        // Instead we:
        //   iOS:     Clear the data container + keychain via simctl, then
        //            relaunch with newInstance:true.  The app binary stays
        //            installed (matching the CI pre-boot), Detox never drops
        //            its connection.
        //   Android: Already handled above — `adb shell pm clear` at line 69
        //            wipes data without uninstalling.
        if (device.getPlatform() === 'ios') {
            clearIOSAppData();
        }

        const MAX_LAUNCH_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_LAUNCH_ATTEMPTS; attempt++) {
            try {
                await device.launchApp({
                    newInstance: true,
                    permissions: launchPermissions,
                    launchArgs,
                });
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
    // JS bundle parsing, and initial render.
    //
    // If the first attempt times out (common on slow CI runners), try one recovery
    // cycle: kill → relaunch → wait again.  This catches the case where the app
    // silently crashed during launch or the RN bridge didn't initialise.
    const appReadyTimeout = 60000;
    try {
        await waitFor(element(by.id('server.screen'))).toExist().withTimeout(appReadyTimeout);
    } catch (waitError) {
        console.warn('⚠️ server.screen did not appear within 60 s — attempting recovery relaunch...');

        // Kill and relaunch the app one more time
        try {
            await device.terminateApp();
        } catch {
            // terminateApp can hang on iOS 26.x — not fatal
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await device.launchApp({
            newInstance: true,
            permissions: {notifications: 'YES', camera: 'NO', medialibrary: 'NO', photos: 'NO'} as const,
            launchArgs: {detoxDisableSynchronization: 'YES'},
        });

        // Second attempt with longer timeout
        try {
            await waitFor(element(by.id('server.screen'))).toExist().withTimeout(appReadyTimeout);
            console.info('✅ Recovery relaunch succeeded');
        } catch {
            // Re-throw the original error with context
            throw new Error(
                'server.screen did not appear after recovery relaunch. ' +
                `Original error: ${String(waitError).slice(0, 300)}`,
            );
        }
    }

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
