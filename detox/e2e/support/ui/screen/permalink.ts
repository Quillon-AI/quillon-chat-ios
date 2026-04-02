// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PostList} from '@support/ui/component';
import {isAndroid, timeouts, wait} from '@support/utils';
import {expect, waitFor} from 'detox';

class PermalinkScreen {
    testID = {
        permalinkScreenPrefix: 'permalink.',
        permalinkScreen: 'permalink.screen',
        permalinkPostList: 'permalink.post_list',
        jumpToRecentMessagesButton: 'permalink.jump_to_recent_messages.button',
    };

    permalinkScreen = element(by.id(this.testID.permalinkScreen));
    permalinkPostList = element(by.id(this.testID.permalinkPostList));
    jumpToRecentMessagesButton = element(by.id(this.testID.jumpToRecentMessagesButton));

    postList = new PostList(this.testID.permalinkScreenPrefix);

    getPostListPostItem = (postId: string, text = '', postProfileOptions = {}) => {
        return this.postList.getPost(postId, text, postProfileOptions);
    };

    getPostMessageAtIndex = (index: number) => {
        return this.postList.getPostMessageAtIndex(index);
    };

    toBeVisible = async () => {
        await wait(timeouts.ONE_SEC);

        // On Android edge-to-edge displays the permalink screen container can render
        // with <50% area visible due to system bar insets, causing expect().toBeVisible()
        // to fail. Use toExist() on Android — the screen is present and interactive even
        // when the container's bounding rect is partially covered by the navigation bar.
        if (isAndroid()) {
            // Use HALF_MIN: permalink navigation involves modal dismissal + screen push,
            // which keeps the bridge busy longer than TEN_SEC on Android API 35 CI emulators.
            await waitFor(this.permalinkScreen).toExist().withTimeout(timeouts.HALF_MIN);
        } else {
            await expect(this.permalinkScreen).toBeVisible();
        }

        return this.permalinkScreen;
    };

    jumpToRecentMessages = async () => {
        // # Jump to recent messages
        await waitFor(this.jumpToRecentMessagesButton).toExist().withTimeout(timeouts.TEN_SEC);
        await this.jumpToRecentMessagesButton.tap();
        await expect(this.permalinkScreen).not.toBeVisible();

        // iOS 26.2 liquid-glass dimming overlay takes longer than 1s to clear
        // after the permalink screen dismisses. Use FOUR_SEC to ensure the
        // channel_list.screen transition completes before the next assertion.
        await wait(timeouts.FOUR_SEC);
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

const permalinkScreen = new PermalinkScreen();
export default permalinkScreen;
