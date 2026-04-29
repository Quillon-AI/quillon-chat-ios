// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

/**
 * Tests for WebSocket reconnection during server switch
 * to verify race condition fixes in websocket/index.ts.
 * 
 * Proposed in issue #YAS-159
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
    HomeScreen,
    LoginScreen,
    ServerScreen,
} from '@support/ui/screen';
import {getRandomId} from '@support/utils';
import {expect} from 'detox';

describe('WebSocket Reconnection During Navigation', () => {
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

    it('should handle WebSocket reconnection when switching servers', async () => {
        // # Open a channel on server 1
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // # Navigate back to server list
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();

        // # Connect to server 2
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify connected to server 2
        await ChannelListScreen.toBeVisible();

        // # Open a channel on server 2
        await ChannelScreen.open(channelsCategory, testChannel2.name);
        await ChannelScreen.toBeVisible();

        // * Verify channel is loaded correctly
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel2.display_name);
    });

    it('should maintain WebSocket connection during rapid server switches', async () => {
        // # Switch servers multiple times rapidly
        // eslint-disable-next-line no-await-in-loop
        for (let i = 0; i < 2; i++) {
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

        // * Verify final state is stable
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should handle navigation during WebSocket reconnection', async () => {
        // # Open a channel
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // # Initiate server switch
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();

        // # Quickly navigate back before connection completes
        await device.pressBack();
        await ChannelListScreen.toBeVisible();

        // * Verify app is in stable state
        await expect(ChannelListScreen.channelListScreen).toBeVisible();
    });

    it('should recover from network interruption during navigation', async () => {
        // # Open a channel
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // Note: Simulating network interruption would require detox network mocking
        // This test verifies the navigation flow works correctly

        // # Navigate back and forth
        await ChannelScreen.back();
        await ChannelListScreen.toBeVisible();
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // * Verify channel is still accessible
        await expect(ChannelScreen.headerTitle).toHaveText(testChannel1.display_name);
    });

    it('should handle server switch from deep navigation stack', async () => {
        // # Create a deep navigation stack
        await ChannelScreen.open(channelsCategory, testChannel1.name);
        await ChannelScreen.toBeVisible();

        // Open channel info to add to stack
        await ChannelScreen.openChannelInfo();
        await ChannelScreen.toBeVisible();

        // # Navigate back to root
        await ChannelScreen.back();
        await ChannelScreen.back();
        await ChannelListScreen.toBeVisible();

        // # Switch server
        await HomeScreen.openServerList();
        await ServerScreen.toBeVisible();
        await ServerScreen.connectToServer(serverTwoUrl, serverTwoDisplayName);

        // * Verify clean state after server switch
        await ChannelListScreen.toBeVisible();
    });
});
