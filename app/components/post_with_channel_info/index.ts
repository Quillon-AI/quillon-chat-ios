// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {of as of$} from 'rxjs';

import {useServerUrl} from '@context/server';
import {observeIsChannelAutotranslated} from '@queries/servers/channel';
import {observePostSaved} from '@queries/servers/post';
import {observeIsCRTEnabled} from '@queries/servers/thread';

import PostWithChannelInfo from './post_with_channel_info';

import type {WithDatabaseArgs} from '@typings/database/database';
import type PostModel from '@typings/database/models/servers/post';

type OwnProps = {
    post: PostModel;
    serverUrl?: string;
    skipSavedPostsHighlight?: boolean;
} & WithDatabaseArgs;

const enhance = withObservables(['post', 'skipSavedPostsHighlight'], ({database, post, serverUrl, skipSavedPostsHighlight}: OwnProps) => {
    return {
        isCRTEnabled: observeIsCRTEnabled(database),
        isSaved: skipSavedPostsHighlight ? of$(false) : observePostSaved(database, post.id, serverUrl),
        isChannelAutotranslated: observeIsChannelAutotranslated(database, post.channelId),
    };
});

const EnhancedPostWithChannelInfo = withDatabase(enhance(PostWithChannelInfo));

type EnhancedPostWithChannelInfoProps = React.ComponentProps<typeof EnhancedPostWithChannelInfo>;

export default function PostWithChannelInfoWithServerUrl(props: Omit<EnhancedPostWithChannelInfoProps, 'serverUrl'>) {
    const serverUrl = useServerUrl();
    return React.createElement(EnhancedPostWithChannelInfo, {
        ...props,
        serverUrl,
    });
}
