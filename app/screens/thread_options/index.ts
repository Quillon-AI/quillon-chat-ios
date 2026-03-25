// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';

import {useServerUrl} from '@context/server';
import {observePost, observePostSaved} from '@queries/servers/post';
import {observeCurrentTeam} from '@queries/servers/team';

import ThreadOptions from './thread_options';

import type {WithDatabaseArgs} from '@typings/database/database';
import type ThreadModel from '@typings/database/models/servers/thread';

type Props = WithDatabaseArgs & {
    serverUrl?: string;
    thread: ThreadModel;
};

const enhanced = withObservables(['thread'], ({database, serverUrl, thread}: Props) => {
    return {
        isSaved: observePostSaved(database, thread.id, serverUrl),
        post: observePost(database, thread.id),
        team: observeCurrentTeam(database),
    };
});

const EnhancedThreadOptions = withDatabase(enhanced(ThreadOptions));

type EnhancedThreadOptionsProps = React.ComponentProps<typeof EnhancedThreadOptions>;

export default function ThreadOptionsWithServerUrl(props: Omit<EnhancedThreadOptionsProps, 'serverUrl'>) {
    const serverUrl = useServerUrl();
    return React.createElement(EnhancedThreadOptions, {
        ...props,
        serverUrl,
    });
}
