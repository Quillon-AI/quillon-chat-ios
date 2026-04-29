// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

/**
 * Tests for server switch resetting navigation state correctly.
 *
 * Proposed in issue #YAS-156
 */

import {
    Setup,
} from '@support/server_api';
import {
    serverOneUrl,
    serverTwoUrl,
    siteOneUrl,
    siteTwoUrl,
} from '@support/test_config';
import {
    ChannelScreen,
    ChannelListScreen,
    ChannelInfoScreen,
    HomeScreen,
    LoginScreen,
    ServerScreen,
} from '@support/ui/screen';
import {expect} from 'detox';

describe('Server Switch Navigation Reset', () => {
    const serverOneDisplayName = 'Server 1';
    const serverTwoDisplayName = 'Server 2';
    const channelsCategory = 'channels';
    let testChannel1: any;
    let testChannel2: any;
    let testUser: any;

    beforeAll(async () => {
        // Setup on server 1
        const {channel: channel1, user} = await Setup.apiInit(siteOneUrl);
        testChannel1 = channel1;
        testUser = user;

        // Setup on server 2
        const {channel: channel2} = await Setup.apiInit(siteTwoUrl);
        testChannel2 = channel2;

        // Connect to server 1 first
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(testUser);
    });

    afterAll(async () => {
        await HomeScreen.logout();
    });

    beforeEach(async () => {
        // Ensure we're on channel list screen before each test
        await ChannelListScreen.toBeVisible();
    });

    it('should reset navigation state when switching servers from channel view', async () => {
        // # Open a channel on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // # Switch to server 2
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify navigation state is reset to channel list
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should reset navigation state when switching servers from channel info', async () => {
        // # Open channel and channel info on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.toBeVisible();

        // # Switch to server 2
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify channel info is closed and state is reset
        await ChannelListScreen.toBeVisible();
        await expect(ChannelInfoScreen.channelInfoScreen).not.toBeVisible();
    });

    it('should maintain clean navigation state after switching back to original server', async () => {
        // # Create navigation stack on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.toBeVisible();

        // # Switch to server 2
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);
        await ChannelListScreen.toBeVisible();

        // # Switch back to server 1
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);

        // * Verify server 1 has clean state (channel list, not channel info)
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should handle rapid server switches without navigation state corruption', async () => {
        // # Switch servers multiple times rapidly
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < 3; i++) {
            // Open channel on server 1
            await ChannelScreen.open(channelsCategory, testChannel1.name);
            await ChannelScreen.toBeVisible();

            // Switch to server 2
            await HomeScreen.openServerList();
            await ServerScreen.toBeVisible();
            await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);
            await ChannelListScreen.toBeVisible();

            // Switch back to server 1
            await HomeScreen.openServerList();
            await ServerScreen.toBeVisible();
            await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
            await ChannelListScreen.toBeVisible();
        }
        /* eslint-enable no-await-in-loop */

        // * Verify final state is stable
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should reset to channel list when switching from deep navigation stack', async () => {
        // # Create deep navigation stack on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.toBeVisible();

        // # Open channel info multiple times to build stack
        await ChannelInfoScreen.close();
        await ChannelScreen.toBeVisible();
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.toBeVisible();

        // # Switch to server 2
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify clean state on server 2
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should isolate navigation history between servers', async () => {
        // # Navigate on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // # Switch to server 2
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);
        await ChannelListScreen.toBeVisible();

        // # Navigate on server 2
        await ChannelScreen.open(channelsCategory, testChannel2.name);
        await ChannelScreen.toBeVisible();

        // # Switch back to server 1
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);

        // * Verify server 1 does not show server 2's navigation state
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.getChannelItem(testChannel1.name)).toBeVisible();
        await expect(ChannelListScreen.getChannelItem(testChannel2.name)).not.toBeVisible();
    });

    it('should handle server switch during channel loading', async () => {
        // # Start opening a channel on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // # Quickly switch server
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify server 2 is in stable state
        await ChannelListScreen.toBeVisible();
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should clear modal state when switching servers', async () => {
        // # Open channel and modal on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.toBeVisible();

        // # Switch to server 2 without closing modal
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify modal is closed on server 2
        await ChannelListScreen.toBeVisible();
        await expect(ChannelInfoScreen.channelInfoScreen).not.toBeVisible();
    });
});
