// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {adminEmail, adminPassword, adminUsername} from '@support/test_config';
import {v4 as uuidv4} from 'uuid';

export * from './email';
export * from './detoxhelpers';

/**
 * Explicit `wait` should not normally used but made available for special cases.
 * @param {number} ms - duration in millisecond
 * @return {Promise} promise with timeout
 */
export const wait = async (ms: number): Promise<any> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Check if android.
 * @return {boolean} true if android
 */
export const isAndroid = (): boolean => {
    return device.getPlatform() === 'android';
};

/**
 * Check if ios.
 * @return {boolean} true if ios
 */
export const isIos = (): boolean => {
    return device.getPlatform() === 'ios';
};

/**
 * Check if running on iPad simulator.
 * @return {boolean} true if iPad
 */
export const isIpad = (): boolean => {
    return isIos() && device.name.toLowerCase().includes('ipad');
};

/**
 * Get random id.
 * @param {number} length - length on random string to return, e.g. 6 (default)
 * @return {string} random string
 */
export const getRandomId = (length = 6): string => {
    const MAX_SUBSTRING_INDEX = 27;

    return uuidv4().replace(/-/g, '').substring(MAX_SUBSTRING_INDEX - length, MAX_SUBSTRING_INDEX);
};

/**
 * Capitalize first character of text.
 * @param {string} text
 * @return {string} capitalized text
 */
export const capitalize = (text: string): string => {
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Get admin account.
 */
export const getAdminAccount = () => {
    return {
        username: adminUsername,
        password: adminPassword,
        email: adminEmail,
    };
};

const SECOND = 1000 * (process.env.LOW_BANDWIDTH_MODE === 'true' ? 5 : 1);
const MINUTE = 60 * 1000;

export const timeouts = {
    HALF_SEC: SECOND / 2,
    ONE_SEC: SECOND,
    TWO_SEC: SECOND * 2,
    THREE_SEC: SECOND * 3,
    FOUR_SEC: SECOND * 4,
    FIVE_SEC: SECOND * 5,
    TEN_SEC: SECOND * 10,
    TWENTY_SEC: SECOND * 20,
    HALF_MIN: MINUTE / 2,
    ONE_MIN: MINUTE,
    TWO_MIN: MINUTE * 2,
    FOUR_MIN: MINUTE * 4,
};

/**
 * Retry a function with reload
 * @param {function} func - function to retry
 * @param {number} retries - number of retries
 * @param {string} serverUrl - optional server URL to reconnect after reload
 * @param {string} serverDisplayName - optional server display name to reconnect after reload
 * @return {Promise<void>} - promise that resolves when the function succeeds
 * @throws {Error} - if the function fails after the specified number of retries
 */
export async function retryWithReload(
    func: () => Promise<void>,
    retries: number = 2,
    ServerScreen: any,
    serverUrl?: string,
    serverDisplayName?: string,
): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await func();
            return;
        } catch (err) {
            if (attempt < retries) {
                // eslint-disable-next-line no-await-in-loop
                await device.reloadReactNative();
                // eslint-disable-next-line no-await-in-loop
                await new Promise((res) => setTimeout(res, 10000));

                // If server connection details provided, reconnect after reload
                if (serverUrl && serverDisplayName) {
                    // Dynamically import to avoid circular dependencies
                    // eslint-disable-next-line no-await-in-loop
                    await ServerScreen.connectToServer(serverUrl, serverDisplayName);
                }
            } else {
                throw err;
            }
        }
    }
}

/**
 * Long-press an element with automatic retry, re-scrolling the list between attempts.
 *
 * After posting a message the keyboard dismiss animation temporarily blocks React Native's
 * gesture responder system. A plain longPress can fire without effect during this window
 * even after a fixed wait. This helper retries the gesture (with a fresh scroll to settle
 * the UI) so tests are self-healing regardless of animation timing.
 *
 * On iOS 26.2 the gesture responder system takes longer to become available after keyboard
 * dismiss animations complete. Use FIVE_SEC wait (up from THREE_SEC) and a smaller scroll
 * distance (50px vs 100px) to avoid over-scrolling past the target post.
 *
 * @param target - The element to long-press
 * @param scrollTarget - A scrollable list to scroll before each attempt (dismisses keyboard + settles UI)
 * @param checkElement - An element that should exist once the long-press succeeds (e.g. PostOptionsScreen)
 * @param maxAttempts - How many times to retry before throwing (default: 5)
 */
export async function longPressWithScrollRetry(
    target: Detox.NativeElement,
    scrollTarget: Detox.NativeElement,
    checkElement: Detox.NativeElement,
    maxAttempts = 5,
): Promise<void> {
    const {waitFor: detoxWaitFor} = require('detox');
    /* eslint-disable no-await-in-loop */
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Scroll a small amount to settle the UI and dismiss any keyboard.
        // 50px is enough to trigger gesture-responder re-registration without
        // scrolling past the target post. Ignore if the list cannot scroll.
        try {
            await scrollTarget.scroll(50, 'down', 0.5, 0.5);
        } catch {
            // List is already at scroll boundary — proceed with longPress anyway
        }

        // On iOS 26.2 the gesture responder takes longer to become available
        // after keyboard dismiss animations. Use FIVE_SEC wait (up from THREE_SEC).
        await wait(timeouts.FIVE_SEC);
        await target.longPress(timeouts.FIVE_SEC);
        try {
            await detoxWaitFor(checkElement).toExist().withTimeout(timeouts.HALF_MIN);
            return;
        } catch {
            if (attempt === maxAttempts) {
                throw new Error(`Element did not appear after ${maxAttempts} longPress attempts`);
            }
        }
    }
    /* eslint-enable no-await-in-loop */
}

/**
 * Long-press an element with automatic retry (no scroll).
 *
 * Similar to `longPressWithScrollRetry` but for screens where scrolling is
 * unnecessary or the list reference is unavailable.  Between attempts the helper
 * simply waits a moment and retries with a longer press duration on Android,
 * where the gesture responder can be unresponsive during animations.
 *
 * @param target        - The element to long-press
 * @param checkElement  - An element that should exist once the long-press succeeds (e.g. PostOptionsScreen)
 * @param maxAttempts   - How many times to retry before throwing (default: 5)
 */
export async function longPressWithRetry(
    target: Detox.NativeElement,
    checkElement: Detox.NativeElement,
    maxAttempts = 5,
): Promise<void> {
    const {waitFor: detoxWaitFor} = require('detox');
    /* eslint-disable no-await-in-loop */
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Use a longer press duration on Android where gestures are less reliable.
        const pressDuration = isAndroid() ? timeouts.FOUR_SEC : timeouts.TWO_SEC;
        await target.longPress(pressDuration);
        try {
            await detoxWaitFor(checkElement).toExist().withTimeout(timeouts.TEN_SEC);
            return;
        } catch {
            if (attempt === maxAttempts) {
                throw new Error(`Element did not appear after ${maxAttempts} longPress attempts`);
            }

            // Brief pause before retrying
            await wait(timeouts.THREE_SEC);
        }
    }
    /* eslint-enable no-await-in-loop */
}

/**
 * Poll for an element to become visible without waiting for React Native bridge to be idle.
 * This is useful when the bridge is busy with animations or state updates but the UI is already rendered.
 *
 * @param {Detox.NativeElement} detoxElement - The Detox element to wait for
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 10 seconds)
 * @param {number} pollInterval - How often to check in milliseconds (default: 500ms)
 * @return {Promise<void>} - Resolves when element is visible, throws if timeout is reached
 * @throws {Error} - If element is not visible after timeout
 *
 * @example
 * const button = element(by.id('my.button'));
 * await waitForElementToBeVisible(button, timeouts.TEN_SEC);
 */
export async function waitForElementToBeVisible(
    detoxElement: Detox.NativeElement,
    timeout: number = isAndroid() ? timeouts.TWENTY_SEC : timeouts.TEN_SEC,
    pollInterval: number = timeouts.HALF_SEC,
): Promise<void> {
    const {expect: detoxExpect} = require('detox');
    const startTime = Date.now();
    /* eslint-disable no-await-in-loop */
    while (Date.now() - startTime < timeout) {
        try {
            await detoxExpect(detoxElement).toBeVisible();
            return; // Element found and visible
        } catch (error) {
            // Element not visible yet, wait and try again
            if ((Date.now() - startTime) + pollInterval >= timeout) {
                // About to timeout, throw the error
                throw error;
            }
            await wait(pollInterval);
        }
    }
    /* eslint-enable no-await-in-loop */
    // Final check - will throw if still not found
    await detoxExpect(detoxElement).toBeVisible();
}
