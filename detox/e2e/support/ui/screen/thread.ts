// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    CameraQuickAction,
    FileQuickAction,
    ImageQuickAction,
    InputQuickAction,
    PostDraft,
    PostList,
    SendButton,
} from '@support/ui/component';
import {PostOptionsScreen} from '@support/ui/screen';
import {isAndroid, isIos, longPressWithScrollRetry, timeouts, wait, waitForElementToBeVisible, waitForElementToExist} from '@support/utils';
import {by, element, expect, waitFor} from 'detox';

class ThreadScreen {
    testID = {
        threadScreenPrefix: 'thread.',
        threadScreen: 'thread.screen',
        backButton: 'screen.back.button',
        followButton: 'thread.follow_thread.button',
        followingButton: 'thread.following_thread.button',
        scheduledPostTooltipCloseButton: 'scheduled_post.tooltip.close.button',
        scheduledPostTooltipCloseButtonAdminAccount: 'scheduled_post_tutorial_tooltip.close',
    };

    threadScreen = element(by.id(this.testID.threadScreen));
    backButton = element(by.id(this.testID.backButton));
    followButton = element(by.id(this.testID.followButton));
    followingButton = element(by.id(this.testID.followingButton));
    scheduledPostTooltipCloseButton = element(by.id(this.testID.scheduledPostTooltipCloseButton));
    scheduledPostTooltipCloseButtonAdminAccount = element(by.id(this.testID.scheduledPostTooltipCloseButtonAdminAccount));

    // convenience props
    atInputQuickAction = InputQuickAction.getAtInputQuickAction(this.testID.threadScreenPrefix);
    atInputQuickActionDisabled = InputQuickAction.getAtInputQuickActionDisabled(this.testID.threadScreenPrefix);
    slashInputQuickAction = InputQuickAction.getSlashInputQuickAction(this.testID.threadScreenPrefix);
    slashInputQuickActionDisabled = InputQuickAction.getSlashInputQuickActionDisabled(this.testID.threadScreenPrefix);
    fileQuickAction = FileQuickAction.getFileQuickAction(this.testID.threadScreenPrefix);
    fileQuickActionDisabled = FileQuickAction.getFileQuickActionDisabled(this.testID.threadScreenPrefix);
    imageQuickAction = ImageQuickAction.getImageQuickAction(this.testID.threadScreenPrefix);
    imageQuickActionDisabled = ImageQuickAction.getImageQuickActionDisabled(this.testID.threadScreenPrefix);
    cameraQuickAction = CameraQuickAction.getCameraQuickAction(this.testID.threadScreenPrefix);
    cameraQuickActionDisabled = CameraQuickAction.getCameraQuickActionDisabled(this.testID.threadScreenPrefix);
    postDraft = PostDraft.getPostDraft(this.testID.threadScreenPrefix);
    postDraftArchived = PostDraft.getPostDraftArchived(this.testID.threadScreenPrefix);
    postDraftReadOnly = PostDraft.getPostDraftReadOnly(this.testID.threadScreenPrefix);
    postInput = PostDraft.getPostInput(this.testID.threadScreenPrefix);
    sendButton = SendButton.getSendButton(this.testID.threadScreenPrefix);
    sendButtonDisabled = SendButton.getSendButtonDisabled(this.testID.threadScreenPrefix);

    postList = new PostList(this.testID.threadScreenPrefix);

    getThreadOverview = () => {
        return this.postList.getThreadOverview();
    };

    getThreadOverviewRepliesCount = () => {
        return this.postList.getThreadOverviewRepliesCount();
    };

    getThreadOverviewNoReplies = () => {
        return this.postList.getThreadOverviewNoReplies();
    };

    getThreadOverviewSaveButton = () => {
        return this.postList.getThreadOverviewSaveButton();
    };

    getThreadOverviewUnsaveButton = () => {
        return this.postList.getThreadOverviewUnsaveButton();
    };

    getThreadOverviewPostOptionsButton = () => {
        return this.postList.getThreadOverviewPostOptionsButton();
    };

    getFlatPostList = () => {
        return this.postList.getFlatList();
    };

    getPostListPostItem = (postId: string, text = '', postProfileOptions: any = {}) => {
        return this.postList.getPost(postId, text, postProfileOptions);
    };

    getPostMessageAtIndex = (index: number) => {
        return this.postList.getPostMessageAtIndex(index);
    };

    dismissScheduledPostTooltip = async () => {
        // Try to close scheduled post tooltip if it exists (try both regular and admin account versions)
        try {
            await waitFor(this.scheduledPostTooltipCloseButton).toBeVisible().withTimeout(timeouts.FOUR_SEC);
            await this.scheduledPostTooltipCloseButton.tap();
            await wait(timeouts.HALF_SEC);
        } catch {
            // Try admin account version
            try {
                await waitFor(this.scheduledPostTooltipCloseButtonAdminAccount).toBeVisible().withTimeout(timeouts.FOUR_SEC);
                await this.scheduledPostTooltipCloseButtonAdminAccount.tap();
                await wait(timeouts.HALF_SEC);
            } catch {
                // Tooltip not visible, continue
            }
        }
    };

    toBeVisible = async () => {
        const timeout = isAndroid() ? timeouts.HALF_MIN : timeouts.TEN_SEC;
        await waitFor(this.threadScreen).toExist().withTimeout(timeout);

        return this.threadScreen;
    };

    back = async () => {
        await this.backButton.tap();
        await waitFor(this.threadScreen).not.toBeVisible().withTimeout(timeouts.TEN_SEC);

        // Wait for the previous screen to be fully loaded and rendered
        await wait(timeouts.TWO_SEC);
    };

    openPostOptionsFor = async (postId: string, text: string) => {
        const {postListPostItem} = this.getPostListPostItem(postId, text);

        // Poll for the post to become visible without waiting for idle bridge
        await waitForElementToBeVisible(postListPostItem, timeouts.TEN_SEC);

        // On Android, dismiss the keyboard before long-pressing. The soft keyboard
        // stays open after postMessage() and intercepts the long-press gesture on
        // API 35 — the post options bottom sheet never appears because Android's
        // gesture system routes the touch to the keyboard's window instead of the
        // post list. A swipe gesture on the post list triggers keyboardDismissMode
        // 'on-drag' which reliably dismisses the keyboard. Detox's scroll() API
        // may use programmatic scrolling that doesn't trigger on-drag dismissal,
        // whereas swipe() performs a real touch gesture.
        if (isAndroid()) {
            try {
                await this.postList.getFlatList().swipe('up', 'fast', 0.3);
            } catch { /* ignore — list may be too short */ }
            await wait(timeouts.TWO_SEC);
        }

        // On iOS, the most-recent post can sit right at the bottom edge of the list,
        // partially covered by the post-input bar. Its "hittable point" (the centre)
        // lies behind the input, making long-press throw "View is not hittable at its
        // visible point". Scroll the list up slightly to push the post away from the
        // input area so the gesture lands cleanly.
        if (isIos()) {
            try {
                await this.postList.getFlatList().scroll(100, 'up');
                await wait(timeouts.ONE_SEC);
            } catch { /* ignore — list may be at the boundary */ }
        }

        // On Android, long-press on the inner text element — more reliable than the
        // compound-matched post container, which can silently swallow the gesture.
        const longPressTarget = isAndroid()
            ? element(by.text(text).withAncestor(by.id(`${this.testID.threadScreenPrefix}post_list.post.${postId}`)))
            : postListPostItem;

        await longPressWithScrollRetry(
            longPressTarget,
            this.postList.getFlatList(),
            PostOptionsScreen.postOptionsScreen,
        );
        await wait(timeouts.TWO_SEC);
    };

    postMessage = async (message: string) => {
        // # Post message
        await this.postInput.tap();
        await this.postInput.replaceText(`${message}\n`);
        await this.tapSendButton();

        // # Wait for message to be rendered
        await wait(timeouts.FOUR_SEC);
    };

    enterMessageToSchedule = async (message: string) => {
        await this.postInput.tap();
        await this.postInput.clearText();
        await this.postInput.replaceText(message);
    };

    longPressSendButton = async () => {
        // # Dismiss the scheduled-post tooltip before long-pressing the send button.
        // On Android the tooltip overlay intercepts the long-press gesture, preventing
        // the scheduling sheet from opening. Dismissing it first ensures the press lands
        // on the actual send button element.
        await this.dismissScheduledPostTooltip();

        // # Wait for the send button to be visible before attempting the long press.
        // enterMessageToSchedule calls replaceText() which may not have triggered the
        // React state update that renders the send button by the time we get here.
        // Use polling (waitForElementToBeVisible) instead of waitFor().toBeVisible()
        // so the wait does not depend on bridge-idle sync, which is permanently busy
        // on both iOS 26.x (main run loop) and Android API 35 (JS bridge after input).
        await waitForElementToBeVisible(this.sendButton, timeouts.FOUR_SEC);

        // # On Android, the soft keyboard stays open after replaceText(). Swipe the
        // post list to trigger keyboardDismissMode='on-drag' and dismiss the keyboard
        // BEFORE disabling sync. With sync disabled the gesture system is unrestricted,
        // so the long-press must land on the actual send button — the keyboard must be
        // gone by then or it will intercept the press.
        if (isAndroid()) {
            try {
                await this.postList.getFlatList().swipe('up', 'fast', 0.3);
            } catch { /* ignore — post list may be too short to scroll */ }
            await wait(timeouts.ONE_SEC);
        }

        // # Disable Detox synchronization before the long press. On iOS 26 the main
        // run loop never fully idles, and on Android the JS bridge stays busy after
        // text input. This causes longPress() to hang waiting for idle-sync. Disabling
        // sync lets the gesture dispatch immediately; we then poll for the bottom sheet.
        await device.disableSynchronization();
        try {
            await this.sendButton.longPress();

            // Wait for the schedule picker bottom sheet using polling (no sync dependency).
            await waitForElementToExist(
                element(by.id('scheduled_post_options_bottom_sheet')),
                timeouts.HALF_MIN,
            );
        } finally {
            await device.enableSynchronization();
        }
    };

    tapSendButton = async () => {
        // # Tap send button
        await this.sendButton.tap();
        await expect(this.sendButton).not.toExist();
        await expect(this.sendButtonDisabled).toBeVisible();
    };

    hasPostMessage = async (postId: string, postMessage: string) => {
        const {postListPostItem} = this.getPostListPostItem(postId, postMessage);
        await expect(postListPostItem).toBeVisible();
    };

    hasPostMessageAtIndex = async (index: number, postMessage: string) => {
        await expect(
            this.getPostMessageAtIndex(index),
        ).toHaveText(postMessage);
    };
}

const threadScreen = new ThreadScreen();
export default threadScreen;
