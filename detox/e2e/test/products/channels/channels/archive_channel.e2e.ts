// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

import {Channel, Post, Setup, System} from '@support/server_api';
import {serverOneUrl, siteOneUrl} from '@support/test_config';
import {
    BrowseChannelsScreen,
    ChannelScreen,
    ChannelListScreen,
    ChannelDropdownMenuScreen,
    ChannelInfoScreen,
    ChannelSettingsScreen,
    HomeScreen,
    LoginScreen,
    ManageChannelMembersScreen,
    PermalinkScreen,
    PostOptionsScreen,
    SavedMessagesScreen,
    SearchMessagesScreen,
    ServerScreen,
} from '@support/ui/screen';
import {
    isAndroid,
    timeouts,
    wait,
    waitForElementToBeVisible,
} from '@support/utils';
import {expect, waitFor} from 'detox';

/**
 * Navigate back from a channel that was opened via Browse Channels.
 * Channel back → Browse Channels, then close Browse Channels.
 * On Android, device.pressBack() is more reliable than tapping the close button
 * (avoids bridge-idle sync stalls and modal-stack differences).
 */
async function closeBrowseChannelsChannel() {
    await ChannelScreen.back();
    await wait(timeouts.ONE_SEC);

    // After the app awaits switchToChannelById, the Browse Channels modal may already
    // be dismissed (dismissAllModalsAndPopToScreen closes it during navigation). Check
    // whether Browse Channels is still on screen before trying to close it.
    if (isAndroid()) {
        // On Android the modal stack can collapse differently — use pressBack
        // which reliably dismisses the current screen regardless of stack depth.
        try {
            await waitFor(BrowseChannelsScreen.closeButton).toExist().withTimeout(timeouts.FOUR_SEC);
            await BrowseChannelsScreen.closeButton.tap();
        } catch {
            // Browse Channels was already dismissed when Channel.back() popped the stack
            await device.pressBack();
        }
    } else {
        try {
            await waitFor(BrowseChannelsScreen.closeButton).toExist().withTimeout(timeouts.FOUR_SEC);
            await BrowseChannelsScreen.closeButton.tap();
        } catch {
            // Browse Channels was already dismissed by switchToChannelById navigation
        }
    }
}

describe('Channels - Archive and Archived Channels', () => {
    const serverOneDisplayName = 'Server 1';
    const channelsCategory = 'channels';
    let testTeam: any;
    let testUser: any;

    beforeAll(async () => {
        // # Ensure archived channels are visible in browse channels
        // Set config BEFORE login so the config is fetched during connection
        await System.apiUpdateConfig(siteOneUrl, {
            TeamSettings: {ExperimentalViewArchivedChannels: true},
        });
        await wait(timeouts.ONE_SEC);

        const {team, user} = await Setup.apiInit(siteOneUrl);
        testTeam = team;
        testUser = user;

        // # Log in to server
        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(testUser);
        await ChannelListScreen.toBeVisible();
    });

    beforeEach(async () => {
        // * Verify on channel list screen
        await ChannelListScreen.toBeVisible();
    });

    afterAll(async () => {
        // # Log out
        await HomeScreen.logout();
    });

    it('MM-T4932_1 - should be able to archive a public channel and confirm', async () => {
        // # Open a public channel screen, open channel info screen, go to channel settings, and tap on archive channel option and confirm
        const {channel: publicChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            publicChannel.id,
        );
        await ChannelListScreen.waitForSidebarPublicChannelDisplayNameVisible(publicChannel.name, timeouts.ONE_MIN);
        await ChannelScreen.open(channelsCategory, publicChannel.name);
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.openChannelSettings();
        await ChannelSettingsScreen.toBeVisible();
        await ChannelSettingsScreen.archivePublicChannel({confirm: true});

        // * Verify the close channel button is visible (confirms archived state)
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back to channel list via back button
        await ChannelScreen.back();
        await ChannelListScreen.toBeVisible();
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.searchInput.replaceText(publicChannel.name);

        // * Verify search returns no results in the default public channels view
        await waitFor(element(by.text(`No matches found for \u201C${publicChannel.name}\u201D`))).toBeVisible().withTimeout(timeouts.TEN_SEC);

        // # Go back to channel list screen
        await BrowseChannelsScreen.close();
    });

    it('MM-T4932_2 - should be able to archive a public channel and cancel', async () => {
        // # Open a public channel screen, open channel info screen, go to channel settings, and tap on archive channel option and cancel
        const {channel: publicChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            publicChannel.id,
        );
        await ChannelListScreen.waitForSidebarPublicChannelDisplayNameVisible(publicChannel.name, timeouts.ONE_MIN);
        await ChannelScreen.open(channelsCategory, publicChannel.name);
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.openChannelSettings();
        await ChannelSettingsScreen.toBeVisible();
        await ChannelSettingsScreen.archivePublicChannel({confirm: false});

        // * Verify still on channel settings screen
        await ChannelSettingsScreen.toBeVisible();

        // # Go back to channel list screen
        await ChannelSettingsScreen.close();
        await ChannelInfoScreen.close();
        await ChannelScreen.back();
    });

    it('MM-T4932_3 - should be able to archive a private channel and confirm', async () => {
        // # Open a private channel screen, open channel info screen, go to channel settings, and tap on archive channel option and confirm
        const {channel: privateChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'P', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            privateChannel.id,
        );
        await ChannelListScreen.waitForSidebarPublicChannelDisplayNameVisible(privateChannel.name, timeouts.ONE_MIN);
        await ChannelScreen.open(channelsCategory, privateChannel.name);
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.openChannelSettings();
        await ChannelSettingsScreen.toBeVisible();
        await ChannelSettingsScreen.archivePrivateChannel({confirm: true});

        // * Verify the close channel button is visible (confirms archived state)
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back to channel list via back button
        await ChannelScreen.back();
        await ChannelListScreen.toBeVisible();
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.searchInput.replaceText(privateChannel.name);

        // * Verify search returns no results in the default public channels view
        await waitFor(element(by.text(`No matches found for \u201C${privateChannel.name}\u201D`))).toBeVisible().withTimeout(timeouts.TEN_SEC);

        // # Go back to channel list screen
        await BrowseChannelsScreen.close();
    });

    it('MM-T3208 - should show confirmation dialog when archiving a channel and archive on confirm', async () => {
        // # Create a new public channel and navigate to it
        const {channel: publicChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            publicChannel.id,
        );
        await ChannelListScreen.waitForSidebarPublicChannelDisplayNameVisible(publicChannel.name, timeouts.ONE_MIN);
        await ChannelScreen.open(channelsCategory, publicChannel.name);

        // # Open channel info, go to channel settings
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.openChannelSettings();
        await ChannelSettingsScreen.toBeVisible();

        // # Tap archive and cancel — verify still on channel settings screen
        await ChannelSettingsScreen.archivePublicChannel({confirm: false});
        await ChannelSettingsScreen.toBeVisible();

        // # Tap archive and confirm
        await ChannelSettingsScreen.archivePublicChannel({confirm: true});

        // * Verify the close channel button is visible (confirms archived state)
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back to channel list via back button
        await ChannelScreen.back();

        // * Verify channel list is shown (channel was archived successfully)
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1697 - should show archived channels option in browse public channels dropdown', async () => {
        // # Open browse channels screen
        await BrowseChannelsScreen.open();

        // * Verify the channel dropdown is visible
        await expect(BrowseChannelsScreen.channelDropdown).toBeVisible();

        // # Tap on the channel dropdown to open it
        await ChannelDropdownMenuScreen.open();

        // * Verify the archived channels option is present in the dropdown
        await expect(ChannelDropdownMenuScreen.archivedChannelsItem).toBeVisible();

        // * Verify the public channels option is also present
        await expect(ChannelDropdownMenuScreen.publicChannelsItem).toBeVisible();

        // # Select archived channels to verify it can be selected
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();

        // * Verify dropdown is dismissed and the archived channels filter is applied
        await BrowseChannelsScreen.toBeVisible();
        await expect(
            BrowseChannelsScreen.channelDropdownTextArchived,
        ).toBeVisible();

        // # Go back to channel list screen
        await BrowseChannelsScreen.close();
    });

    it('MM-T1703 - should be able to open archived channels and verify read-only state', async () => {
        // # Create and archive a public channel via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await ChannelListScreen.waitForSidebarPublicChannelDisplayNameVisible(archivedChannel.name, timeouts.ONE_MIN);

        // # Navigate to the channel and archive it via UI
        await ChannelScreen.open(channelsCategory, archivedChannel.name);
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.openChannelSettings();
        await ChannelSettingsScreen.toBeVisible();
        await ChannelSettingsScreen.archivePublicChannel({confirm: true});

        // * Verify the archived post draft view is shown (channel is read-only)
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // * Verify the close channel button is visible at the bottom
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back to channel list via back button
        await ChannelScreen.back();

        // * Verify back on channel list screen
        await ChannelListScreen.toBeVisible();

        // # Open browse channels, switch to archived channels, and search for the archived channel
        await BrowseChannelsScreen.open();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // * Verify archived channel appears in the list
        await wait(timeouts.ONE_SEC);
        await expect(
            BrowseChannelsScreen.getChannelItemDisplayName(archivedChannel.name),
        ).toHaveText(archivedChannel.display_name);

        // # Tap on the archived channel to open it
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify archived channel displays and is read-only (archived post draft shown)
        // Use a longer timeout: navigating from the Browse Channels modal to a channel
        // involves dismissing the modal and pushing a new screen, which can take >10s on
        // slow iOS CI runners.
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // * Verify the close channel button is visible at the bottom
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back: channel → Browse Channels → channel list
        await closeBrowseChannelsChannel();

        // * Verify back on channel list screen
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1671_1 - should be able to view members in an archived channel', async () => {
        // # Create a public channel, add user, and archive it via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, and open the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel screen is visible in read-only state
        // Use a longer timeout: navigating from Browse Channels modal to a channel
        // involves dismissing the modal + pushing a new screen; can take >10s on slow CI.
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Open channel info
        await ChannelInfoScreen.open();

        // * Verify the Members section option is visible in channel info
        await waitFor(ChannelInfoScreen.membersOption).
            toExist().
            withTimeout(timeouts.TEN_SEC);
        await expect(ChannelInfoScreen.membersOption).toBeVisible();

        // # Go back to channel list screen
        await ChannelInfoScreen.close();
        await closeBrowseChannelsChannel();
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1685_1 - should be able to leave an archived public channel from channel info', async () => {
        // # Create a public channel, add user, and archive it via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, and open the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel screen is visible in read-only state
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Open channel info and leave the channel
        await ChannelInfoScreen.open();
        await ChannelInfoScreen.leaveChannel({confirm: true});

        // * Verify user is back on channel list screen (left the channel)
        await ChannelListScreen.toBeVisible();

        // * Verify the archived channel is no longer in the user's channel list sidebar
        await expect(
            ChannelListScreen.getChannelItemDisplayName(
                channelsCategory,
                archivedChannel.name,
            ),
        ).not.toExist();
    });

    it('MM-T1718_1 - should not show add reaction option in post options for archived channels', async () => {
        // # Create a public channel, post a message, and archive it via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        const message = 'Test message for archived channel reaction test';
        await Post.apiCreatePost(siteOneUrl, {
            channelId: archivedChannel.id,
            message,
        });
        const {post} = await Post.apiGetLastPostInChannel(
            siteOneUrl,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, and open the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel is in read-only state
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Long-press on the post to open post options
        await ChannelScreen.openPostOptionsFor(post.id, message);
        await PostOptionsScreen.toBeVisible();

        // * Verify the reaction bar / add reaction button is NOT visible (archived channels cannot add reactions)
        await expect(PostOptionsScreen.pickReactionButton).not.toBeVisible();

        // # Close post options and return to channel list
        await PostOptionsScreen.close();
        await closeBrowseChannelsChannel();
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1720_1 - should not be able to interact with existing reactions in an archived channel', async () => {
        // # Create a public channel, post a message, add a reaction via API, and archive the channel
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        const message = 'Test message for existing reaction test';
        await Post.apiCreatePost(siteOneUrl, {
            channelId: archivedChannel.id,
            message,
        });
        const {post} = await Post.apiGetLastPostInChannel(
            siteOneUrl,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, and open the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel is in read-only state
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Long-press on the post to open post options and verify reactions cannot be added
        await ChannelScreen.openPostOptionsFor(post.id, message);
        await PostOptionsScreen.toBeVisible();

        // * Verify neither the reaction bar nor pick reaction button is visible (archived channel)
        await expect(PostOptionsScreen.pickReactionButton).not.toBeVisible();

        // # Close post options and return to channel list
        await PostOptionsScreen.close();
        await closeBrowseChannelsChannel();
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1719_1 - should not be able to remove members from an archived channel', async () => {
        // # Create a public channel, add user, and archive it via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, and open the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel screen is visible in read-only state
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Open channel info
        await ChannelInfoScreen.open();

        // # Tap on the Members option to open the manage members screen
        await waitFor(ChannelInfoScreen.membersOption).
            toExist().
            withTimeout(timeouts.TEN_SEC);
        await ChannelInfoScreen.membersOption.tap();
        await ManageChannelMembersScreen.toBeVisible();

        if (isAndroid()) {
            // The tutorial modal creates a foreground native window on Android,
            // making background screen testIDs unfindable via toExist(). Wait for
            // the tutorial text itself (it's in the foreground window) as a proxy
            // that the Members screen has loaded, then dismiss via dismissTutorial().
            try {
                await waitFor(
                    element(by.text("Long-press on an item to view a user's profile")),
                ).
                    toBeVisible().
                    withTimeout(timeouts.TEN_SEC);
            } catch {
                // Tutorial may not appear if already dismissed in a previous run
            }
            await ManageChannelMembersScreen.closeTutorial();
        }

        // * Verify there is no manage/remove button available (cannot remove members from archived channel)
        await expect(ManageChannelMembersScreen.manageButton).not.toBeVisible();

        // # Go back to channel list screen
        // Android: use device.pressBack() for reliability (back button can be temporarily
        // occluded after tutorial dismissal on first-access to the members screen).
        if (isAndroid()) {
            await device.pressBack();
        } else {
            await ManageChannelMembersScreen.close();
        }
        await ChannelInfoScreen.close();
        await closeBrowseChannelsChannel();
        await ChannelListScreen.toBeVisible();
    });

    it('MM-T1679_1 - should be able to open an archived channel from search results', async () => {
        // # Create a public channel, post a message, and archive it via API
        const uniqueMessage = `archived-search-test-${Date.now()}`;
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Post.apiCreatePost(siteOneUrl, {
            channelId: archivedChannel.id,
            message: uniqueMessage,
        });
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open search screen and search for the message posted in the archived channel
        await SearchMessagesScreen.open();
        await SearchMessagesScreen.searchInput.replaceText(uniqueMessage);

        // * Verify the search result contains the message from the archived channel
        // Disable synchronization before tapReturnKey: the search keeps the dispatch
        // queue busy while processing network/DB work, which would otherwise cause
        // tapReturnKey to block indefinitely waiting for Detox idle.
        await device.disableSynchronization();
        await SearchMessagesScreen.searchInput.tapReturnKey();

        // Wait for the search result text to appear (text element, not the composed matcher
        // which uses withDescendant and can be unreliable when text is highlighted/split).
        const searchResultText = element(
            by.
                text(uniqueMessage).
                withAncestor(by.id(SearchMessagesScreen.postList.testID.flatList)),
        );
        await waitForElementToBeVisible(searchResultText, timeouts.ONE_MIN);
        await device.enableSynchronization();

        // # Tap on the search result to open the permalink view for the archived channel
        // Tap the text element directly (the ID+text composed matcher is unreliable
        // when the search result text is highlighted/split across nested Text nodes).
        await searchResultText.tap();

        // * Verify the permalink screen opens (search results navigate via showPermalink)
        await PermalinkScreen.toBeVisible();

        // # Jump to recent messages to open the archived channel in read-only state
        await PermalinkScreen.jumpToRecentMessages();

        // * Verify the archived channel opens in read-only state
        await ChannelScreen.toBeVisible();
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // * Verify the close channel button is visible (confirming archived/read-only state)
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back to channel list
        // On Android the permalink→channel navigation stack returns to Search on close;
        // use open() (taps home tab) to reliably land on channel list on both platforms.
        await ChannelScreen.back();
        await ChannelListScreen.open();
    });

    it('MM-T1722_1 - should show reply/jump arrow in saved messages for posts from archived channels', async () => {
        // # Create a public channel, post a message, save the post via API, and archive the channel
        const message = `saved-post-archived-channel-${Date.now()}`;
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Post.apiCreatePost(siteOneUrl, {
            channelId: archivedChannel.id,
            message,
        });
        const {post} = await Post.apiGetLastPostInChannel(
            siteOneUrl,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open saved messages screen
        await SavedMessagesScreen.open();

        // # Return to channel list, open browse channels, switch to archived filter,
        // # open the archived channel, and save the post
        await ChannelListScreen.open();
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // Wait for the channel item to appear after search — fixed 1s sleep was
        // insufficient on API 35 where the archived list renders more slowly.
        await waitFor(BrowseChannelsScreen.getChannelItem(archivedChannel.name)).toExist().withTimeout(timeouts.TEN_SEC);
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the archived channel screen is visible in read-only state
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // # Long-press the post to open post options and save it
        await ChannelScreen.openPostOptionsFor(post.id, message);
        await PostOptionsScreen.toBeVisible();
        await PostOptionsScreen.savePostOption.tap();
        await wait(timeouts.ONE_SEC);

        // # Close the archived channel and navigate to saved messages
        await closeBrowseChannelsChannel();
        await ChannelListScreen.toBeVisible();
        await SavedMessagesScreen.open();

        // * Verify the saved post from the archived channel is displayed in saved messages
        const {postListPostItem} = SavedMessagesScreen.getPostListPostItem(
            post.id,
            message,
        );
        await waitFor(postListPostItem).toExist().withTimeout(timeouts.TEN_SEC);
        await expect(postListPostItem).toBeVisible();

        // * Verify the channel info (jump link) is visible on the saved post from the archived channel
        const {postListPostItemChannelInfoChannelDisplayName} =
            SavedMessagesScreen.getPostListPostItem(post.id, message);
        await expect(postListPostItemChannelInfoChannelDisplayName).toBeVisible();

        // # Go back to channel list screen
        await ChannelListScreen.open();
    });

    it('MM-T1716 - should not show post input box in archived channels (read-only, cannot post)', async () => {
        // # Create a public channel, add user, and archive it via API
        const {channel: archivedChannel} = await Channel.apiCreateChannel(
            siteOneUrl,
            {type: 'O', teamId: testTeam.id},
        );
        await Channel.apiAddUserToChannel(
            siteOneUrl,
            testUser.id,
            archivedChannel.id,
        );
        await Channel.apiDeleteChannel(siteOneUrl, archivedChannel.id);
        await wait(timeouts.FOUR_SEC);

        // # Open browse channels, switch to archived filter, search for the archived channel
        await BrowseChannelsScreen.open();
        await BrowseChannelsScreen.dismissScheduledPostTooltip();

        // * Verify the channel dropdown is visible before tapping
        await expect(BrowseChannelsScreen.channelDropdown).toBeVisible();
        await ChannelDropdownMenuScreen.open();
        await ChannelDropdownMenuScreen.archivedChannelsItem.tap();
        await wait(timeouts.ONE_SEC);
        await BrowseChannelsScreen.searchInput.replaceText(archivedChannel.name);

        // * Verify archived channel appears in the list
        await wait(timeouts.ONE_SEC);
        await expect(
            BrowseChannelsScreen.getChannelItemDisplayName(archivedChannel.name),
        ).toHaveText(archivedChannel.display_name);

        // # Tap on the archived channel to open it
        await BrowseChannelsScreen.getChannelItem(archivedChannel.name).tap();

        // * Verify the channel screen is visible
        await ChannelScreen.toBeVisible(timeouts.HALF_MIN);

        // * Verify main thread has no active post input box
        await expect(ChannelScreen.postInput).not.toBeVisible();

        // * Verify the archived post draft view is shown instead (channel is read-only)
        await expect(ChannelScreen.postDraftArchived).toBeVisible();

        // * Verify the close channel button is visible
        await expect(
            ChannelScreen.postDraftArchivedCloseChannelButton,
        ).toBeVisible();

        // # Navigate back: channel → Browse Channels → channel list
        await closeBrowseChannelsChannel();

        // * Verify back on channel list screen
        await ChannelListScreen.toBeVisible();
    });
});
