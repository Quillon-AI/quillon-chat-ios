// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

/**
 * Tests for push notification tap navigation to correct channel/thread.
 *
 * Proposed in issue #YAS-156
 */

import {
    Channel,
    Post,
    Setup,
} from '@support/server_api';
import {
    serverOneUrl,
    siteOneUrl,
} from '@support/test_config';
import {
    ChannelScreen,
    ChannelListScreen,
    HomeScreen,
    LoginScreen,
    ServerScreen,
} from '@support/ui/screen';
import {getRandomId, timeouts, wait} from '@support/utils';
import {expect, device} from 'detox';

describe('Push Notification Navigation', () => {
    const serverOneDisplayName = 'Server 1';
    const channelsCategory = 'channels';
    let testChannel: any;
    let testPost: any;

    beforeAll(async () => {
        const {channel, user} = await Setup.apiInit(siteOneUrl);
        testChannel = channel;
        testUser = user;

        // Create a post for notification testing
        const {post} = await Post.apiCreatePost(siteOneUrl, {
            channelId: channel.id,
            message: `Test post for notification ${getRandomId()}`,
        });
        testPost = post;

        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(user);
    });

    afterAll(async () => {
        await HomeScreen.logout();
    });

    beforeEach(async () => {
        // Ensure we're on channel list screen before each test
        await ChannelListScreen.toBeVisible();
    });

    it('should navigate to correct channel when tapping push notification', async () => {
        // # Terminate app to simulate background state
        await device.terminateApp();
        await wait(timeouts.ONE_SEC);

        // # Simulate push notification tap (using deep link as proxy)
        // Note: In real Detox tests with notification mocking, this would use
        // device.sendUserNotification() but that requires specific iOS/Android setup
        const deepLink = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}`;

        await device.launchApp({
            newInstance: false,
            url: deepLink,
        });

        // * Verify navigated to the correct channel
        await wait(timeouts.TWO_SEC);
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);
    });

    it('should navigate to thread when tapping push notification for thread reply', async () => {
        // # Terminate app to simulate background state
        await device.terminateApp();
        await wait(timeouts.ONE_SEC);

        // # Simulate push notification tap to thread (using deep link as proxy)
        const deepLink = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}/${testPost.id}`;

        await device.launchApp({
            newInstance: false,
            url: deepLink,
        });

        // * Verify navigated to permalink/thread view
        await wait(timeouts.THREE_SEC);
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);
    });

    it('should handle push notification when app is in foreground', async () => {
        // # Ensure app is in foreground on channel list
        await ChannelListScreen.toBeVisible();

        // # Simulate notification tap while app is foregrounded
        const deepLink = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}`;

        await device.launchApp({
            newInstance: false,
            url: deepLink,
        });

        // * Verify navigated to channel from channel list
        await wait(timeouts.TWO_SEC);
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);
    });

    it('should handle push notification during active channel view', async () => {
        // # Open a different channel first
        const {channel: otherChannel} = await Channel.apiCreateChannel(siteOneUrl, {
            teamId: testChannel.team_id,
            name: `notif-test-${getRandomId()}`,
            displayName: `Notif Test ${getRandomId()}`,
            type: 'O',
        });

        await ChannelScreen.open(channelsCategory, otherChannel.name);
        await ChannelScreen.toBeVisible();

        // # Simulate notification tap for different channel
        const deepLink = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}`;

        await device.launchApp({
            newInstance: false,
            url: deepLink,
        });

        // * Verify navigated to target channel from different channel
        await wait(timeouts.TWO_SEC);
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);
    });

    it('should preserve navigation state after push notification tap', async () => {
        // # Launch app with notification deep link
        const deepLink = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}`;

        await device.launchApp({
            newInstance: false,
            url: deepLink,
        });

        // * Verify channel is displayed
        await wait(timeouts.TWO_SEC);
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);

        // # Open channel info to verify navigation stack works
        await ChannelScreen.openChannelInfo();
        await ChannelScreen.toBeVisible();

        // # Go back
        await ChannelScreen.back();
        await ChannelScreen.toBeVisible();

        // * Verify channel state is preserved
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel.display_name);
    });

    it('should handle rapid push notification taps without corruption', async () => {
        // # Create another channel for rapid switching test
        const {channel: channel2} = await Channel.apiCreateChannel(siteOneUrl, {
            teamId: testChannel.team_id,
            name: `rapid-notif-${getRandomId()}`,
            displayName: `Rapid Notif ${getRandomId()}`,
            type: 'O',
        });

        // # Simulate rapid notification taps
        const deepLink1 = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${testChannel.name}`;
        const deepLink2 = `mattermost://${serverOneUrl}/channels/${testChannel.team_id}/${channel2.name}`;

        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < 2; i++) {
            await device.launchApp({
                newInstance: false,
                url: deepLink1,
            });
            await wait(timeouts.ONE_SEC);
            await ChannelScreen.toBeVisible();

            await device.launchApp({
                newInstance: false,
                url: deepLink2,
            });
            await wait(timeouts.ONE_SEC);
            await ChannelScreen.toBeVisible();
        }
        /* eslint-enable no-await-in-loop */

        // * Verify final state is stable
        await expect(ChannelScreen.headerTitle).toBeVisible();
    });
});
