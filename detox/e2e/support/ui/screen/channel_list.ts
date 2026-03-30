// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    PlusMenu,
    TeamSidebar,
} from '@support/ui/component';
import {HomeScreen} from '@support/ui/screen';
import {dismissSystemDialogIfVisible, timeouts, wait} from '@support/utils';
import {expect, waitFor} from 'detox';

class ChannelListScreen {
    testID = {
        categoryHeaderPrefix: 'channel_list.category_header.',
        categoryPrefix: 'channel_list.category.',
        draftChannelInfo: 'draft_post.channel_info',
        draftbuttonListScreen: 'channel_list.drafts.button',
        draftCountListScreen: 'channel_list.drafts.count',
        scheduledMessageCountListScreen: 'channel_list.scheduled_post.count',
        teamItemPrefix: 'team_sidebar.team_list.team_item.',
        channelListScreen: 'channel_list.screen',
        serverIcon: 'channel_list.servers.server_icon',
        headerTeamDisplayName: 'channel_list_header.team_display_name',
        headerServerDisplayName: 'channel_list_header.server_display_name',
        headerPlusButton: 'channel_list_header.plus.button',
        subheaderSearchFieldButton: 'channel_list_subheader.search_field.button',
        findChannelsInput: 'channel_list.search_field.find_channels.input',
        threadsButton: 'channel_list.threads.button',
    };

    channelListScreen = element(by.id(this.testID.channelListScreen));
    serverIcon = element(by.id(this.testID.serverIcon));
    headerTeamDisplayName = element(by.id(this.testID.headerTeamDisplayName));
    headerServerDisplayName = element(by.id(this.testID.headerServerDisplayName));
    headerPlusButton = element(by.id(this.testID.headerPlusButton));
    subheaderSearchFieldButton = element(by.id(this.testID.subheaderSearchFieldButton));
    findChannelsInput = element(by.id(this.testID.findChannelsInput));
    threadsButton = element(by.id(this.testID.threadsButton));

    // convenience props
    teamFlatList = TeamSidebar.teamFlatList;
    browseChannelsItem = PlusMenu.browseChannelsItem;
    createNewChannelItem = PlusMenu.createNewChannelItem;
    openDirectMessageItem = PlusMenu.openDirectMessageItem;
    invitePeopleToTeamItem = PlusMenu.invitePeopleToTeamItem;

    getCategoryCollapsed = (categoryKey: string) => {
        return element(by.id(`${this.testID.categoryHeaderPrefix}${categoryKey}.collapsed.true`));
    };

    getCategoryExpanded = (categoryKey: string) => {
        return element(by.id(`${this.testID.categoryHeaderPrefix}${categoryKey}.collapsed.false`));
    };

    getCategoryHeaderDisplayName = (categoryKey: string) => {
        return element(by.id(`${this.testID.categoryHeaderPrefix}${categoryKey}.display_name`));
    };

    getChannelItem = (categoryKey: string, channelName: string) => {
        return element(by.id(`${this.testID.categoryPrefix}${categoryKey}.channel_item.${channelName}`));
    };

    getChannelItemDisplayName = (categoryKey: string, channelName: string) => {
        return element(by.id(`${this.testID.categoryPrefix}${categoryKey}.channel_item.${channelName}.display_name`));
    };

    /**
     * Public channel rows can appear under Unreads (when grouped unreads is on), Channels, or
     * Favorites. Wait until any matching row is visible, then tap the one that is on screen.
     */
    waitForSidebarPublicChannelDisplayNameVisible = async (channelName: string, timeout = timeouts.TEN_SEC) => {
        const unreads = this.getChannelItemDisplayName('unreads', channelName);
        const channels = this.getChannelItemDisplayName('channels', channelName);
        const favorites = this.getChannelItemDisplayName('favorites', channelName);
        const candidates = [unreads, channels, favorites];
        const deadline = Date.now() + timeout;
        let lastError: unknown;
        /* eslint-disable no-await-in-loop -- poll sidebar rows until one is visible */
        while (Date.now() < deadline) {
            for (const el of candidates) {
                try {
                    await waitFor(el).toBeVisible().withTimeout(500);
                    return;
                } catch (error) {
                    lastError = error;
                }
            }
            await wait(200);
        }
        /* eslint-enable no-await-in-loop */
        throw lastError instanceof Error ? lastError : new Error('Sidebar channel display name not visible');
    };

    tapSidebarPublicChannelDisplayName = async (channelName: string, timeout = timeouts.TEN_SEC) => {
        await this.waitForSidebarPublicChannelDisplayNameVisible(channelName, timeout);
        const unreads = this.getChannelItemDisplayName('unreads', channelName);
        const channels = this.getChannelItemDisplayName('channels', channelName);
        const favorites = this.getChannelItemDisplayName('favorites', channelName);
        try {
            await expect(unreads).toBeVisible();
            await unreads.tap();
            return;
        } catch {
            // try next
        }
        try {
            await expect(channels).toBeVisible();
            await channels.tap();
            return;
        } catch {
            // try next
        }
        await favorites.tap();
    };

    getTeamItemSelected = (teamId: string) => {
        return element(by.id(`${this.testID.teamItemPrefix}${teamId}.selected`));
    };

    getTeamItemNotSelected = (teamId: string) => {
        return element(by.id(`${this.testID.teamItemPrefix}${teamId}.not_selected`));
    };

    getTeamItemDisplayNameAbbreviation = (teamId: string) => {
        return element(by.id(`${this.testID.teamItemPrefix}${teamId}.team_icon.display_name_abbreviation`));
    };

    toBeVisible = async () => {
        // iOS 26.2 on macos-15 CI runners takes longer than 10s to settle the channel
        // list screen after login navigation (React Native bridge + Metro warm-up).
        // Android CI emulators are also slow — use HALF_MIN for both so we never race.
        // Use toExist() (not toBeVisible()) because Android edge-to-edge rendering
        // can cause the channel list screen to exist but not meet the 50% visibility
        // threshold, which cascades into every subsequent test in the suite.
        const timeout = timeouts.HALF_MIN;
        try {
            await waitFor(this.channelListScreen).toExist().withTimeout(timeout);
        } catch (firstError) {
            // A previous test may have left the app mid-navigation (e.g. DM screen open,
            // bottom sheet animating). Recovery: relaunch the app with a new instance so
            // the server screen appears, then wait for the server screen to hand off to
            // the channel list. This prevents a single mid-navigation failure from
            // cascading into every remaining test in the suite.
            // eslint-disable-next-line no-console
            console.warn('[ChannelListScreen.toBeVisible] Channel list not found — attempting recovery relaunch');
            try {
                await device.launchApp({newInstance: true});

                // After a newInstance relaunch the app restores the previous
                // session. iOS may immediately present a "Save Password?" system
                // dialog whose dimming overlay blocks all subsequent taps even
                // though the channel list is already visible. Dismiss it before
                // waiting for the channel list screen so that later interactions
                // (e.g. tapping headerPlusButton) are not blocked.
                await dismissSystemDialogIfVisible();
                await waitFor(this.channelListScreen).toExist().withTimeout(timeouts.TWO_MIN);
            } catch (recoveryError) {
                // Log recovery failure, then re-throw the original error so the test failure message is meaningful
                // eslint-disable-next-line no-console
                console.warn('[ChannelListScreen.toBeVisible] Recovery relaunch also failed:', recoveryError);
                throw firstError;
            }
        }

        return this.channelListScreen;
    };

    open = async () => {
        // # Open channel list screen
        await HomeScreen.channelListTab.tap();

        return this.toBeVisible();
    };

    draftsButton = {
        toBeVisible: async () => {
            await waitFor(element(by.id(this.testID.draftbuttonListScreen))).toBeVisible().withTimeout(timeouts.ONE_SEC);
        },
        toNotBeVisible: async () => {
            await waitFor(element(by.id(this.testID.draftbuttonListScreen))).not.toBeVisible().withTimeout(timeouts.ONE_SEC);
        },
        tap: async () => {
            await element(by.id(this.testID.draftbuttonListScreen)).tap();
        },
    };

    getDraftChannelInfo = () => {
        return element(by.id(this.testID.draftChannelInfo));
    };
}

const channelListScreen = new ChannelListScreen();
export default channelListScreen;
