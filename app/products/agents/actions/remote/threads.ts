// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getFullErrorMessage} from '@utils/errors';
import {logError} from '@utils/log';

import type {AIThread} from '@agents/types';

/**
 * Raw wire shape — the union of plugin < 2.0 and plugin >= 2.0 fields. The
 * plugin 2.0 shape introduces a conversation id as the primary `id` and
 * splits the root post id into its own nullable field; older servers put
 * the root post id in `id` directly.
 */
type RawAIThread = {
    id: string;
    message?: string;
    title?: string;
    channel_id?: string | null;
    reply_count?: number;
    update_at?: number;
    root_post_id?: string | null;
    bot_id?: string;
};

/**
 * Normalise a wire-format thread to the mobile-internal shape where `id` is
 * always the root post id suitable for navigation and `channel_id` is always
 * a string. Returns null when the thread cannot be opened because no post id
 * is available (plugin 2.0 conversation without a root post yet).
 *
 * Plugin version is inferred from whether `root_post_id` is present on the
 * wire: plugin < 2.0 omits the key entirely (`undefined`), plugin >= 2.0
 * always includes it (string or null).
 */
function normaliseThread(raw: RawAIThread): AIThread | null {
    const hasRootPostField = 'root_post_id' in raw;
    let postId: string;
    if (hasRootPostField) {
        if (!raw.root_post_id) {
            return null;
        }
        postId = raw.root_post_id;
    } else {
        if (!raw.id) {
            return null;
        }
        postId = raw.id;
    }

    return {
        id: postId,
        message: raw.message ?? '',
        title: raw.title ?? '',
        channel_id: raw.channel_id ?? '',
        reply_count: raw.reply_count ?? 0,
        update_at: raw.update_at ?? 0,
        root_post_id: raw.root_post_id ?? undefined,
        bot_id: raw.bot_id,
    };
}

/**
 * Fetch all AI threads (conversations with agent bots) from the server and store them in the database
 * @param serverUrl The server URL
 * @returns {threads, error} - Array of AI threads on success, error on failure
 */
export async function fetchAIThreads(
    serverUrl: string,
): Promise<{threads?: AIThread[]; error?: unknown}> {
    try {
        const client = NetworkManager.getClient(serverUrl);
        const response = await client.getAIThreads() as unknown as RawAIThread[] | null;

        // Handle null/undefined response from API - treat as empty array
        const rawThreads: RawAIThread[] = Array.isArray(response) ? response : [];
        const threads: AIThread[] = [];
        for (const raw of rawThreads) {
            const normalised = normaliseThread(raw);
            if (normalised) {
                threads.push(normalised);
            }
        }

        // Store threads in database and remove any that no longer exist on the server
        const {operator} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        await operator.handleAIThreads({
            threads,
            prepareRecordsOnly: false,
        });

        return {threads};
    } catch (error) {
        logError('[fetchAIThreads] Failed to fetch AI threads', error);
        return {error: getFullErrorMessage(error)};
    }
}
