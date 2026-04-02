// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ProfilePicture} from '@support/ui/component';
import {ChannelListScreen} from '@support/ui/screen';
import {isAndroid, isIos, timeouts, wait, waitForElementToBeVisible, waitForElementToExist} from '@support/utils';
import {expect, waitFor} from 'detox';

class CreateDirectMessageScreen {
    testID = {
        selectedDMUserPrefix: 'create_direct_message.',
        selectedUserPrefix: 'create_direct_message.selected_user.',
        userItemPrefix: 'create_direct_message.user_list.user_item.',
        createDirectMessageScreen: 'create_direct_message.screen',
        closeButton: 'close.create_direct_message.button',
        startButton: 'create_direct_message.start.button',
        searchInput: 'create_direct_message.search_bar.search.input',
        searchClearButton: 'create_direct_message.search_bar.search.clear.button',
        searchCancelButton: 'create_direct_message.search_bar.search.cancel.button',
        flatUserList: 'create_direct_message.user_list.flat_list',
        sectionUserList: 'create_direct_message.user_list.section_list',
        tutorialHighlight: 'tutorial_highlight',
        tutorialSwipeLeft: 'tutorial_swipe_left',
        scheduledPostTooltipCloseButton: 'scheduled_post.tooltip.close.button',
    };

    scheduledPostTooltipCloseButton = element(by.id(this.testID.scheduledPostTooltipCloseButton));
    createDirectMessageScreen = element(by.id(this.testID.createDirectMessageScreen));
    closeButton = element(by.id(this.testID.closeButton));
    startButton = element(by.id(this.testID.startButton));
    searchInput = element(by.id(this.testID.searchInput));
    searchClearButton = element(by.id(this.testID.searchClearButton));
    searchCancelButton = element(by.id(this.testID.searchCancelButton));
    flatUserList = element(by.id(this.testID.flatUserList));
    sectionUserList = element(by.id(this.testID.sectionUserList));
    tutorialHighlight = element(by.id(this.testID.tutorialHighlight));
    tutorialSwipeLeft = element(by.id(this.testID.tutorialSwipeLeft));

    getSelectedUser = (userId: string) => {
        return element(by.id(`${this.testID.selectedUserPrefix}${userId}`));
    };

    getSelectedUserDisplayName = (userId: string) => {
        return element(by.id(`${this.testID.selectedUserPrefix}${userId}.display_name`));
    };

    getSelectedDMUserDisplayName = (userId: string) => {
        return element(by.id(`${this.testID.selectedDMUserPrefix}${userId}.display_name`));
    };

    getSelectedUserRemoveButton = (userId: string) => {
        return element(by.id(`${this.testID.selectedUserPrefix}${userId}.remove.button`));
    };

    getUserItem = (userId: string) => {
        return element(by.id(`${this.testID.userItemPrefix}${userId}.${userId}`));
    };

    getUserItemProfilePicture = (userId: string) => {
        return element(ProfilePicture.getProfilePictureItemMatcher(this.testID.userItemPrefix, userId));
    };

    getUserItemDisplayName = (userId: string) => {
        return element(by.id(`${this.testID.userItemPrefix}${userId}.${userId}.display_name`));
    };

    toBeVisible = async () => {
        if (isAndroid()) {
            // Android CI emulators have the JS bridge (mqt_js) perpetually busy while the
            // DM screen animates in. waitFor().toExist().withTimeout() uses Espresso's
            // IdlingResource synchronization and blocks indefinitely even though the screen
            // IS rendering. The root SafeAreaView (testID=create_direct_message.screen) is
            // from react-native-safe-area-context and its layout can time out on CI, causing
            // its tag to not be set when we check.
            //
            // Strategy: disable sync, wait for the search input (a plain RN View that tags
            // reliably) with polling, then re-enable sync. The search bar renders after the
            // SafeAreaView layout, so finding it implies the screen is fully ready.
            await device.disableSynchronization();
            try {
                await waitForElementToExist(this.searchInput, timeouts.ONE_MIN);
            } finally {
                await device.enableSynchronization();
            }
        } else {
            // Wait for the search input to be ready on iOS.
            // A RNSVGGroup (part of the plus-menu icon animation) sits on top of the
            // input immediately after navigation and intercepts taps even though the element
            // is in the hierarchy. Waiting for the input to be visible gives the SVG layer
            // time to finish its animation, and the extra 500ms ensures it has cleared.
            await waitFor(this.createDirectMessageScreen).toExist().withTimeout(timeouts.HALF_MIN);
            await waitFor(this.searchInput).toBeVisible().withTimeout(timeouts.TEN_SEC);
        }
        await wait(timeouts.HALF_SEC);

        return this.createDirectMessageScreen;
    };

    open = async () => {
        // # Open create direct message screen
        // Wait for the plus button to exist before tapping. The button only renders
        // when the team displayName is loaded — after a recovery relaunch or a slow
        // login flow the team data may not be hydrated yet, causing the tap to fail
        // with "No elements found". Using toExist() (not toBeVisible()) also handles
        // alert dimming overlays left by previous tests.
        await waitFor(ChannelListScreen.headerPlusButton).toExist().withTimeout(timeouts.HALF_MIN);
        await ChannelListScreen.headerPlusButton.tap();

        // Wait for the bottom-sheet menu to animate open before tapping the item.
        // On Android a fixed ONE_SEC sleep is insufficient — the sheet can still be
        // mid-animation, causing the tap to land on the backdrop and dismiss it instead.
        await waitFor(ChannelListScreen.openDirectMessageItem).toExist().withTimeout(timeouts.TEN_SEC);
        await ChannelListScreen.openDirectMessageItem.tap();
        await this.toBeVisible();

        // Dismiss the "Long-press on an item to view a user's profile" tutorial overlay
        // if it appears. The overlay blocks 50% of the search input on first open and
        // intercepts taps, causing subsequent interactions to fail. Calling closeTutorial()
        // here makes the dismissal explicit regardless of the searchInput visibility approach.
        await this.closeTutorial();

        return this.createDirectMessageScreen;
    };

    close = async () => {
        await this.closeButton.tap();
        await expect(this.createDirectMessageScreen).not.toBeVisible();
    };

    closeTutorial = async () => {
        try {
            if (isIos()) {
                await waitFor(this.tutorialHighlight).toExist().withTimeout(timeouts.TEN_SEC);
                await this.tutorialSwipeLeft.tap();
            } else {
                await waitForElementToBeVisible(this.tutorialHighlight, timeouts.TEN_SEC);
                await device.pressBack();
            }
            await waitFor(this.tutorialHighlight).not.toExist().withTimeout(timeouts.TEN_SEC);
        } catch {
            // Tutorial may not appear if already dismissed in a previous run
        }
    };
}

const createDirectMessageScreen = new CreateDirectMessageScreen();
export default createDirectMessageScreen;
