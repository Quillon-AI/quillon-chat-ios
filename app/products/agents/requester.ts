// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isPostRequester} from '@agents/utils';

import type {ConversationResponse} from '@agents/types';
import type PostModel from '@typings/database/models/servers/post';

interface Params {
    post: PostModel | Post;
    conversation?: ConversationResponse;
    currentUserId: string;
}

/**
 * Resolve whether the current user owns the conversation behind an agent post.
 *
 * - If a conversation entity is loaded, its `user_id` is authoritative.
 * - Otherwise, fall back to the legacy `llm_requester_user_id` prop, which the
 *   plugin still sets for meeting-summarization posts and for posts produced
 *   by plugin versions before conversation entities existed.
 */
export function isConversationRequester({post, conversation, currentUserId}: Params): boolean {
    if (conversation) {
        return conversation.user_id === currentUserId;
    }
    return isPostRequester(post, currentUserId);
}
