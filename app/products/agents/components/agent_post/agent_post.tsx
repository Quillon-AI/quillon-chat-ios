// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import AgentPostLegacy from './agent_post_legacy';
import AgentPostNew from './agent_post_new';

import type PostModel from '@typings/database/models/servers/post';
import type {AvailableScreens} from '@typings/screens/navigation';

export interface AgentPostProps {
    post: PostModel;
    currentUserId?: string;
    location: AvailableScreens;
    isDM: boolean;
}

/**
 * Dispatches to the correct agent post renderer based on whether the post
 * carries a conversation_id prop (plugin-agents >= 2.0) or not (older plugin
 * versions, and meeting-summary posts on any version). The mobile app ships
 * to the app store at its own cadence, so both renderers must coexist.
 */
const AgentPost = (props: AgentPostProps) => {
    const postProps = props.post.props as Record<string, unknown> | undefined;
    const rawConversationId = postProps?.conversation_id;
    const conversationId = typeof rawConversationId === 'string' && rawConversationId !== '' ? rawConversationId : undefined;

    if (conversationId) {
        return (
            <AgentPostNew
                post={props.post}
                conversationId={conversationId}
                currentUserId={props.currentUserId}
                location={props.location}
                isDM={props.isDM}
            />
        );
    }

    return (
        <AgentPostLegacy
            post={props.post}
            currentUserId={props.currentUserId}
            location={props.location}
            isDM={props.isDM}
        />
    );
};

export default AgentPost;
