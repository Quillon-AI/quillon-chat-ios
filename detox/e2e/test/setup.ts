// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable no-await-in-loop, no-console */

import {execSync, spawn} from 'child_process';

import {ClaudePromptHandler} from '@support/pilot/ClaudePromptHandler';
import {Plugin, System, User} from '@support/server_api';
import {siteOneUrl} from '@support/test_config';
import {timeouts, wait} from '@support/utils';

// Number of retry attempts
const MAX_RETRY_ATTEMPTS = 2;

// Delay between retries (in milliseconds)
const RETRY_DELAY = 5000;

let isFirstLaunch = true;

/**
 * Verify Detox connection to app is healthy
 * @param maxAttempts - Maximum number of verification attempts
 * @param delayMs - Delay between attempts in milliseconds
 * @returns {Promise<void>}
 */
async function verifyDetoxConnection(
    maxAttempts = 3,
    delayMs = 2000,
): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Simple health check: verify device is responsive
            device.getPlatform();
            console.info(`✅ Detox connection verified on attempt ${attempt}`);
            return;
        } catch (error) {
            console.warn(
                `❌ Detox connection check failed on attempt ${attempt}/${maxAttempts}: ${(error as Error).message}`,
            );

            if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
            }
        }
    }

    throw new Error(
        'Detox connection verification failed after maximum attempts',
    );
}

/**
 * Ensure the app is on the server screen before each test file runs.
 *
 * Each test file's beforeAll calls ServerScreen.connectToServer(), which requires
 * server.screen to be visible. This function detects and recovers from three states:
 *
 * 1. server.screen  — clean state after successful logout; proceed immediately.
 * 2. channel_list.screen — previous test's HomeScreen.logout() failed silently;
 *    force a cleanup logout so the server is removed and server.screen appears.
 * 3. server_list.screen — inactive servers remain from a prior test (e.g.
 *    server_login.e2e.ts logs out Server 2 but keeps it in the list); tap
 *    "Add a server" to open server.screen so the next beforeAll can connect.
 *
 * Also acts as the app-readiness check (polls until a known screen appears).
 */
async function ensureOnServerScreen(maxWaitMs = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
    // 1. Server screen — clean state, proceed.
    //    Also verify the URL input is visible before returning: the server.screen
    //    container can appear mid-transition (e.g. while a logout dialog is still
    //    animating out), so we need to confirm the form is fully ready.
        try {
            // Use toExist() (not toBeVisible()) for both elements — Detox's 75% visibility
            // threshold fails on FloatingInputContainer even when fully rendered on Android.
            // Use atIndex(0): FloatingInputContainer assigns the same testID to both the
            // outer View wrapper and the inner TextInput; without atIndex Android throws
            // "Multiple elements found", causing this check to fail on every iteration.
            // ServerScreen.connectToServer() re-checks before typing.
            await waitFor(element(by.id('server.screen'))).
                toExist().
                withTimeout(2000);
            await waitFor(element(by.id('server_form.server_url.input')).atIndex(0)).
                toExist().
                withTimeout(timeouts.TEN_SEC);
            console.info('✅ App is on server screen');
            return;
        } catch {
            /* not on server screen yet */
        }

        // 2. Channel list — previous test left app logged in; force logout.
        //    Detect and action are separated so that a tooltip or layout failure
        //    (e.g. on iPad where the tooltip covers the account tab) does not
        //    silently swallow the "we ARE on channel list" detection.
        let onChannelList = false;
        try {
            // Use toExist() not toBeVisible(): on iPad the sidebar occupies ~30% of the
            // screen width so the 75% visibility threshold can fail even when fully rendered.
            await waitFor(element(by.id('channel_list.screen'))).
                toExist().
                withTimeout(2000);
            onChannelList = true;
        } catch {
            /* not on channel list */
        }

        if (onChannelList) {
            console.info(
                'ℹ️ App still logged in from previous test — forcing cleanup logout',
            );

            // Dismiss iOS native dialogs that appear after login and block hit-tests.
            // On iOS 26+ the "Save Password?" sheet appears after every successful login;
            // its backdrop UIView covers the full screen including the account tab.
            if (device.getPlatform() === 'ios') {
                try {
                    await waitFor(element(by.label('Save Password?'))).
                        toExist().
                        withTimeout(2000);
                    await element(by.label('Not Now')).tap();
                    await wait(timeouts.HALF_SEC);
                } catch {
                    /* not present */
                }
                try {
                    await waitFor(
                        element(
                            by.text('Notifications cannot be received from this server'),
                        ),
                    ).
                        toExist().
                        withTimeout(1000);
                    await element(by.label('Okay')).tap();
                    await wait(timeouts.HALF_SEC);
                } catch {
                    /* not present */
                }
            }

            // Dismiss the "Scheduled Posts" tooltip that appears after first login.
            // On iPad the tooltip sits over the account tab and makes it non-hittable.
            try {
                await element(by.id('scheduled_post.tooltip.close.button')).tap();
                await wait(timeouts.HALF_SEC);
            } catch {
                /* no tooltip */
            }
            try {
                await element(by.id('scheduled_post_tutorial_tooltip.close')).tap();
                await wait(timeouts.HALF_SEC);
            } catch {
                /* no admin-variant tooltip */
            }

            try {
                await element(by.id('tab_bar.account.tab')).tap();
                await waitFor(element(by.id('account.screen'))).
                    toExist().
                    withTimeout(timeouts.TEN_SEC);
                await element(by.id('account.logout.option')).tap();
                if (device.getPlatform() === 'android') {
                    await element(by.text('LOG OUT')).tap();
                } else {
                    await element(by.label('Log out')).atIndex(1).tap();
                }
                await waitFor(element(by.id('account.screen'))).
                    not.toBeVisible().
                    withTimeout(timeouts.TEN_SEC);
            } catch (e) {
                // Logout via account tab failed — last resort: relaunch to clear state.
                console.warn(
                    `⚠️ Logout via account tab failed (${(e as Error).message?.slice(0, 80)}), relaunching app`,
                );
                await device.launchApp({newInstance: true});
                await wait(timeouts.TWO_SEC);
            }
            continue;
        }

        // 3. Server list — inactive servers remain (e.g. Server 2 from server_login.e2e.ts);
        //    open the add-server screen so the next test's beforeAll can connect normally.
        try {
            await waitFor(element(by.id('server_list.screen'))).
                toBeVisible().
                withTimeout(2000);
            console.info('ℹ️ App is on server list — opening add-server screen');
            await element(by.text('Add a server')).tap();
            await waitFor(element(by.id('server.screen'))).
                toBeVisible().
                withTimeout(timeouts.TEN_SEC);
            console.info('✅ Add-server screen is open');
            return;
        } catch {
            /* not on server list */
        }

        // 4. "Select team" screen — app has a valid session but the user has no accessible team
        //    (common after app reinstall when the iOS Keychain retains the previous session token).
        //    Tap the Log Out button to clear the session and return to server.screen.
        try {
            await waitFor(element(by.id('select_team.logout.button'))).
                toBeVisible().
                withTimeout(2000);
            console.info(
                'ℹ️ "No teams available" screen — logging out to clear stale session',
            );
            await element(by.id('select_team.logout.button')).tap();
            continue;
        } catch {
            /* not on select_team screen */
        }

        // 5. Channel screen — app is viewing a specific channel from a previous test.
        //    RNN pushes the channel on a navigation stack and hides the bottom tab bar,
        //    so tapping tab_bar.home.tab won't work. Navigate back using the header back
        //    button, then the next iteration's channel_list case will trigger the logout.
        try {
            await waitFor(element(by.id('channel.screen'))).
                toBeVisible().
                withTimeout(2000);
            console.info(
                'ℹ️ App is on channel screen — tapping back button to reach channel list',
            );
            await element(by.id('navigation.header.back')).tap();
            continue;
        } catch {
            /* not on channel screen */
        }

        // 6. Login screen — app navigated here after a 401 session-expired response on startup.
        //    Tapping the back button returns to server.screen.
        try {
            await waitFor(element(by.id('login.screen'))).
                toBeVisible().
                withTimeout(2000);
            console.info(
                'ℹ️ App is on login screen (session expired) — tapping back to reach server screen',
            );
            await element(by.id('screen.back.button')).tap();
            continue;
        } catch {
            /* not on login screen */
        }

        // 7. Android: OS-level notification permission dialog (Android 13+, POST_NOTIFICATIONS).
        //    Appears on first launch and blocks all known screens behind it.
        if (device.getPlatform() === 'android') {
            try {
                await waitFor(element(by.text('Allow'))).
                    toBeVisible().
                    withTimeout(2000);
                const permText = element(by.text('send you notifications'));
                await waitFor(permText).toExist().withTimeout(1000);
                console.info('ℹ️ Dismissing OS notification permission dialog');
                await element(by.text('Allow')).tap();
                continue;
            } catch {
                /* OS permission dialog not visible */
            }
        }

        // 7. Android: "Notifications cannot be received from this server" dialog may appear
        //    after connecting to a new server, blocking all known screens.
        if (device.getPlatform() === 'android') {
            try {
                await waitFor(
                    element(by.text('Notifications cannot be received from this server')),
                ).
                    toExist().
                    withTimeout(2000);
                console.info(
                    'ℹ️ Dismissing notification-config dialog to restore known state',
                );
                await element(by.text('OKAY')).tap();
                continue;
            } catch {
                /* dialog not visible */
            }
        }

        // 8. iOS: "Notifications cannot be received from this server" native UIAlertController.
        //    The alert's dimming UIView covers the full screen and blocks all hit-tests.
        //    On iOS the button label is "Okay" (by.label matches UIAlertController button titles).
        if (device.getPlatform() === 'ios') {
            try {
                await waitFor(
                    element(by.text('Notifications cannot be received from this server')),
                ).
                    toExist().
                    withTimeout(2000);
                console.info(
                    'ℹ️ Dismissing iOS notification-config alert to restore known state',
                );
                await element(by.label('Okay')).tap();
                continue;
            } catch {
                /* dialog not visible */
            }
        }

        // 9. iOS 26+: "Save Password?" native sheet appears after every successful login.
        //    Its backdrop UIView covers the full screen and blocks all hit-tests.
        if (device.getPlatform() === 'ios') {
            try {
                await waitFor(element(by.label('Save Password?'))).
                    toExist().
                    withTimeout(2000);
                console.info(
                    'ℹ️ Dismissing iOS "Save Password?" sheet to restore known state',
                );
                await element(by.label('Not Now')).tap();
                continue;
            } catch {
                /* dialog not visible */
            }
        }

        // App not yet in a known state — wait and retry
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`App did not reach server screen within ${maxWaitMs}ms`);
}

/**
 * Dismiss React Native RedBox error overlay if visible in debug builds.
 * Native errors (e.g. RCTImageView event re-registration) are thrown before
 * JS runs and cannot be suppressed via LogBox — dismiss them here instead.
 */
async function dismissRedBoxIfVisible(): Promise<void> {
    if (device.getPlatform() !== 'ios') {
        return;
    }
    try {
    // Prefer "Reload" to reconnect to Metro rather than "Dismiss" which leaves app with no bundle
        await waitFor(element(by.text('Reload'))).
            toBeVisible().
            withTimeout(2000);
        await element(by.text('Reload')).tap();
        console.info('ℹ️ Tapped Reload on native RedBox to reconnect to Metro');

        // Give Metro time to serve the bundle
        await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch {
    // No RedBox visible, continue normally
    }
}

/**
 * Pre-terminate the iOS app with a timeout to work around `xcrun simctl terminate`
 * hanging indefinitely. If the graceful terminate doesn't complete within the timeout,
 * fall back to SIGKILL via `pkill -9` on the app process.
 *
 * This prevents the global beforeAll from burning its entire 240s Jest timeout waiting
 * for a stuck simctl terminate, which was causing ~50% of iOS CI failures.
 */
async function forceTerminateIosApp(bundleId: string, timeoutMs = 15000): Promise<void> {
    // Try graceful terminate with a timeout
    try {
        await new Promise<void>((resolve, reject) => {
            const proc = spawn('xcrun', ['simctl', 'terminate', 'booted', bundleId], {stdio: 'pipe'});
            const timer = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error(`simctl terminate timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            proc.on('close', () => {
                clearTimeout(timer);
                resolve();
            });
            proc.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
        console.info('✅ iOS app terminated gracefully');
    } catch (e) {
        console.warn(`⚠️ Graceful terminate failed (${(e as Error).message}), force-killing app process`);

        // Fall back to SIGKILL on the app process directly.
        // bundleId is a compile-time constant (e.g. "com.mattermost.rnbeta"), not user input.
        try {
            execSync(`pkill -9 -f "${bundleId}"`, {stdio: 'pipe'});

            // Give the simulator a moment to clean up after the force-kill
            await new Promise((resolve) => setTimeout(resolve, 2000));
            console.info('✅ iOS app force-killed via pkill');
        } catch {
            // pkill returns exit code 1 if no matching process — that's fine, app is already dead
            console.info('ℹ️ No matching app process found (app may already be terminated)');
        }
    }
}

/**
 * Launch the app with retry mechanism
 * @returns {Promise<void>}
 */
export async function launchAppWithRetry(): Promise<void> {
    // Disable iOS AutoFill password-save prompts before every launch.
    // The "Save Password?" sheet (ASCredentialProviderViewController) appears after every
    // successful login and presents a full-screen UIView backdrop that blocks all hit-tests —
    // including the account tab at the bottom of the screen.
    // Writing to the simulator's defaults domain prevents the sheet from being offered at all.
    // The simulator is already booted by Detox's global beforeAll before this function runs,
    // so "booted" targets the correct device on both local and CI (parallel shards each have
    // their own booted simulator).
    if (device.getPlatform() === 'ios') {
        try {
            execSync(
                'xcrun simctl spawn booted defaults write com.apple.Passwords AutoFill -bool NO',
                {stdio: 'pipe'},
            );
            console.info(
                '✅ Disabled iOS AutoFill (com.apple.Passwords) to suppress "Save Password?" sheet',
            );
        } catch (e) {
            console.warn(
                '⚠️ Could not write com.apple.Passwords AutoFill pref (non-fatal):',
                (e as Error).message?.slice(0, 80),
            );
        }
        try {
            execSync(
                'xcrun simctl spawn booted defaults write com.apple.SafariShared WBSAutoFillPasswordsEnabled -bool NO',
                {stdio: 'pipe'},
            );
        } catch {
            /* best-effort */
        }
    }

    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            if (isFirstLaunch) {
                // In CI, do a full clean install (delete: true) to guarantee a fresh app state.
                // Locally, skip delete: the app binary is often a symlink into the simulator's
                // bundle container — deleting the app destroys the symlink target, so the next
                // launch can't find the binary. newInstance: true alone clears in-memory state.
                const isCI = Boolean(process.env.CI);

                // Pre-terminate the app before the first launch to prevent `xcrun simctl terminate`
                // from hanging inside Detox's `device.launchApp({delete: true})`. Detox calls
                // simctl terminate internally with no timeout, which can block for 240s+ on iOS
                // simulators (known Xcode bug). By terminating with our own 15s timeout + SIGKILL
                // fallback, we ensure Detox's launchApp finds the app already dead.
                if (isCI && device.getPlatform() === 'ios') {
                    await forceTerminateIosApp('com.mattermost.rnbeta');
                }

                await device.launchApp({
                    newInstance: true,

                    // In CI: delete: true reinstalls the app, giving a clean state — no need for
                    // resetAppState (which requires the app to already be installed). Locally:
                    // resetAppState: true clears data without deleting the app binary (deleting
                    // breaks the simulator symlink, causing subsequent launches to fail).
                    ...(isCI ? {delete: true} : {resetAppState: true}),
                    permissions: {
                        notifications: 'YES',
                        camera: 'NO',
                        medialibrary: 'NO',
                        photos: 'NO',
                    },
                    launchArgs: {
                        detoxPrintBusyIdleResources: 'YES',
                        detoxDebugVisibility: 'YES',
                        detoxDisableSynchronization: 'YES',
                        detoxDisableHierarchyDump: 'YES',
                        reduceMotion: 'YES',
                    },
                });

                // Android 13+ (API 33+): grant POST_NOTIFICATIONS permission via adb so the
                // system permission dialog never appears during tests. The `permissions` key in
                // launchApp only works on iOS simulator; on Android we must use adb shell pm grant.
                // We grant immediately after launch — before the app has a chance to call
                // requestPermissions — so the OS treats it as already granted and skips the dialog.
                if (device.getPlatform() === 'android') {
                    try {
                        execSync(
                            'adb shell pm grant com.mattermost.rnbeta android.permission.POST_NOTIFICATIONS',
                            {stdio: 'pipe'},
                        );
                        console.info(
                            '✅ Granted POST_NOTIFICATIONS permission for Android 13+',
                        );
                    } catch (e) {
                        console.warn(
                            '⚠️ Could not grant POST_NOTIFICATIONS via adb (may already be granted or API < 33):',
                            e,
                        );
                    }
                }

                isFirstLaunch = false;
            } else {
                // For subsequent launches, restart the process without reinstalling.
                // newInstance: true kills and restarts the process (~5s) so in-memory
                // state is cleared. The app reads WatermelonDB on startup; after a
                // successful logout the DB has no servers, so it shows server.screen.
                // ensureOnServerScreen() below handles any remaining edge cases.
                await device.launchApp({
                    newInstance: true,
                    launchArgs: {
                        detoxPrintBusyIdleResources: 'YES',
                        detoxDebugVisibility: 'YES',
                        detoxDisableSynchronization: 'YES',
                        detoxURLBlacklistRegex: '.*localhost.*',
                    },
                });
            }

            console.info(`✅ App launched successfully on attempt ${attempt}`);

            // Dismiss any native RedBox error overlay that may appear in debug builds
            // (e.g. 'RCTImageView re-registered bubbling event' warning on iOS)
            await dismissRedBoxIfVisible();
            return;
        } catch (error) {
            lastError = error;
            console.warn(
                `❌ App launch failed on attempt ${attempt}/${MAX_RETRY_ATTEMPTS}: ${(error as Error).message}`,
            );

            if (attempt < MAX_RETRY_ATTEMPTS) {
                console.warn(`Waiting ${RETRY_DELAY}ms before retrying...`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    throw new Error(
        `Failed to launch app after ${MAX_RETRY_ATTEMPTS} attempts. Last error: ${(lastError as Error).message}`,
    );
}

/**
 * Initialize ClaudePromptHandler if ANTHROPIC_API_KEY is set
 * @returns {Promise<void>}
 */
async function initializeClaudePromptHandler(): Promise<void> {
    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        const promptHandler = new ClaudePromptHandler(
            process.env.ANTHROPIC_API_KEY,
        );
        pilot.init(promptHandler);
    } catch (e) {
        console.warn('Claude init failed, continuing without AI:', e);
    }
}

beforeAll(async () => {
    // Only do a full clean install (delete: true) for the very first test file per run.
    // process.env persists across Jest test files in the same worker (maxWorkers: 1 in CI),
    // so subsequent files use fast relaunch (~5s) instead of a full reinstall (~85s on iOS).
    isFirstLaunch = !process.env.DETOX_APP_INSTALLED;
    if (isFirstLaunch) {
        process.env.DETOX_APP_INSTALLED = 'true';
    }
    await launchAppWithRetry();

    // Verify Detox connection is healthy after app launch
    await verifyDetoxConnection();

    // Ensure the app is on the server screen before this test file's beforeAll runs.
    // Handles: logged-in state from a previous test, server list with inactive servers,
    // and general app readiness (polls until a known screen appears).
    await ensureOnServerScreen();
    await initializeClaudePromptHandler();

    // Login as sysadmin and verify the session is usable before proceeding.
    // Retries up to 3× with a short delay — guards against a brief race where
    // the cookie jar hasn't fully propagated the new MMAUTHTOKEN before the
    // first authenticated API call fires, which shows up as a 401 session_expired.
    await System.apiCheckSystemHealth(siteOneUrl);
    const MAX_LOGIN_ATTEMPTS = 3;
    for (
        let loginAttempt = 1;
        loginAttempt <= MAX_LOGIN_ATTEMPTS;
        loginAttempt++
    ) {
        const {error: loginError} = await User.apiAdminLogin(siteOneUrl);
        if (loginError) {
            if (loginAttempt === MAX_LOGIN_ATTEMPTS) {
                throw new Error(
                    `Admin login failed after ${MAX_LOGIN_ATTEMPTS} attempts: ${JSON.stringify(loginError)}`,
                );
            }
            console.warn(
                `⚠️ Admin login attempt ${loginAttempt} failed, retrying...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 2000 * loginAttempt));
            continue;
        }

        // Verify the session cookie is working by making an authenticated call.
        // If this returns a 401 (e.g. cookie not yet propagated), retry login.
        const {error: meError} = await User.apiGetMe(siteOneUrl);
        if (!meError) {
            console.info(`✅ Admin session verified on attempt ${loginAttempt}`);
            break;
        }
        if (loginAttempt === MAX_LOGIN_ATTEMPTS) {
            throw new Error(
                `Admin session not usable after ${MAX_LOGIN_ATTEMPTS} login attempts`,
            );
        }
        console.warn(
            `⚠️ Admin session check failed on attempt ${loginAttempt}, retrying login...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * loginAttempt));
    }

    await Plugin.apiDisableNonPrepackagedPlugins(siteOneUrl);
});
