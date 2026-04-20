// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isConversationRequester} from './requester';

import type {ConversationResponse} from '@agents/types';
import type PostModel from '@typings/database/models/servers/post';

function fakePost(props: Record<string, unknown> = {}): PostModel {
    return {props} as unknown as PostModel;
}

function fakeConversation(userId: string): ConversationResponse {
    return {
        id: 'c1',
        user_id: userId,
        bot_id: 'bot',
        channel_id: null,
        root_post_id: null,
        title: '',
        operation: '',
        turns: [],
    };
}

describe('isConversationRequester', () => {
    it('treats the conversation as authoritative when loaded', () => {
        const post = fakePost({llm_requester_user_id: 'otherUser'});

        expect(isConversationRequester({
            post,
            conversation: fakeConversation('userA'),
            currentUserId: 'userA',
        })).toBe(true);
    });

    it('returns false when the conversation owner is someone else', () => {
        const post = fakePost({llm_requester_user_id: 'userA'});

        expect(isConversationRequester({
            post,
            conversation: fakeConversation('userB'),
            currentUserId: 'userA',
        })).toBe(false);
    });

    it('falls back to llm_requester_user_id when the conversation has not loaded', () => {
        const post = fakePost({llm_requester_user_id: 'userA'});

        expect(isConversationRequester({
            post,
            conversation: undefined,
            currentUserId: 'userA',
        })).toBe(true);
    });

    it('returns false when no conversation is loaded and the legacy prop is absent', () => {
        const post = fakePost({});

        expect(isConversationRequester({
            post,
            conversation: undefined,
            currentUserId: 'userA',
        })).toBe(false);
    });
});
