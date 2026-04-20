// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CONTROL_SIGNALS} from '@agents/constants';
import {clearConversationCache} from '@agents/store/conversation_store';
import streamingStore from '@agents/store/streaming_store';
import {BlockType, ToolCallStatusString, type ConversationResponse} from '@agents/types';
import {act} from '@testing-library/react-native';
import React from 'react';

import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import AgentPostNew from './agent_post_new';

import type PostModel from '@typings/database/models/servers/post';

// Mock Markdown to surface the rendered text content for assertion.
jest.mock('@components/markdown', () => {
    const {Text} = require('react-native');
    const MockMarkdown = ({value}: {value: string}) => (
        <Text testID='mock-markdown'>{value}</Text>
    );
    return MockMarkdown;
});

// Mock server context to avoid requiring ServerUrlProvider.
jest.mock('@context/server', () => ({
    useServerUrl: () => 'https://test.mattermost.com',
}));

// Mock conversation fetch so the store resolves synchronously in tests.
const mockFetchConversation = jest.fn();
jest.mock('@agents/actions/remote/conversation', () => ({
    fetchConversation: (...args: unknown[]) => mockFetchConversation(...args),
}));

// Prevent network calls for control buttons.
jest.mock('@agents/actions/remote/generation_controls', () => ({
    regenerateResponse: jest.fn().mockResolvedValue({}),
    stopGeneration: jest.fn().mockResolvedValue({}),
}));
jest.mock('@agents/actions/remote/tool_approval', () => ({
    submitToolApproval: jest.fn().mockResolvedValue({}),
}));
jest.mock('@agents/actions/remote/tool_result', () => ({
    submitToolResult: jest.fn().mockResolvedValue({}),
}));

const POST_ID = 'post1';
const CONV_ID = 'conv1';
const USER_ID = 'userA';

function makePost(overrides: Partial<PostModel> = {}): PostModel {
    return TestHelper.fakePostModel({
        id: POST_ID,
        message: '',
        props: {conversation_id: CONV_ID},
        ...overrides,
    });
}

function makeConversation(overrides: Partial<ConversationResponse> = {}): ConversationResponse {
    return {
        id: CONV_ID,
        user_id: USER_ID,
        bot_id: 'bot',
        channel_id: null,
        root_post_id: POST_ID,
        title: '',
        operation: 'dm',
        turns: [],
        ...overrides,
    };
}

// Flush microtasks so Promise.resolve() chains run before assertions.
async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    streamingStore.clear();
    clearConversationCache();
    mockFetchConversation.mockReset();
});

describe('AgentPostNew — streaming text (Bug #1)', () => {
    it('renders streaming text as it arrives over the wire', async () => {
        // Conversation fetch returns empty (no anchor turn yet since stream is active).
        mockFetchConversation.mockResolvedValue({data: makeConversation()});

        const {getByText, queryByText} = renderWithIntlAndTheme(
            <AgentPostNew
                post={makePost()}
                conversationId={CONV_ID}
                currentUserId={USER_ID}
                location={'Channel' as any}
                isDM={true}
            />,
        );

        // Simulate the plugin's websocket events in order.
        await act(async () => {
            streamingStore.handleWebSocketMessage({post_id: POST_ID, control: CONTROL_SIGNALS.START});
            await flush();
        });

        // While in precontent, the generating placeholder shows.
        expect(getByText('Generating response...')).toBeTruthy();

        await act(async () => {
            streamingStore.handleWebSocketMessage({post_id: POST_ID, next: 'Hello from the bot'});
            await flush();
        });

        // Streaming text renders, and the precontent placeholder is gone.
        expect(getByText('Hello from the bot')).toBeTruthy();
        expect(queryByText('Generating response...')).toBeNull();
    });
});

describe('AgentPostNew — old conversation tool calls (Bug #2)', () => {
    it('renders tool cards on the first mount when the conversation is already cached', async () => {
        // Realistic turn layout from the plugin: tool_use blocks are in a
        // turn BEFORE the anchor (post_id=null), and the anchor turn carries
        // only the final text.
        const conversation = makeConversation({
            turns: [
                {id: 't0', post_id: null, role: 'user', content: [], sequence: 0, tokens_in: 0, tokens_out: 0},
                {
                    id: 't1',
                    post_id: null,
                    role: 'assistant',
                    sequence: 1,
                    tokens_in: 0,
                    tokens_out: 0,
                    content: [
                        {
                            type: BlockType.ToolUse,
                            id: 'tu1',
                            name: 'search_docs',
                            input: {query: 'hi'},
                            status: ToolCallStatusString.Success,
                        },
                    ],
                },
                {
                    id: 't2',
                    post_id: null,
                    role: 'tool_result',
                    sequence: 2,
                    tokens_in: 0,
                    tokens_out: 0,
                    content: [
                        {type: BlockType.ToolResult, tool_use_id: 'tu1', content: 'result body', shared: true},
                    ],
                },
                {
                    id: 't3',
                    post_id: POST_ID,
                    role: 'assistant',
                    sequence: 3,
                    tokens_in: 0,
                    tokens_out: 0,
                    content: [
                        {type: BlockType.Text, text: 'Final response text'},
                    ],
                },
            ],
        });
        mockFetchConversation.mockResolvedValue({data: conversation});

        const {findByText} = renderWithIntlAndTheme(
            <AgentPostNew
                post={makePost({message: 'Final response text'})}
                conversationId={CONV_ID}
                currentUserId={USER_ID}
                location={'Channel' as any}
                isDM={true}
            />,
        );

        // The tool display name is title-cased. With a realistic turn layout
        // (tool_use blocks sit before the anchor turn), collectResponseTurns
        // must walk backwards through them.
        expect(await findByText('Search Docs')).toBeTruthy();
    });

    it('still renders tool cards on a stream-end transition when the invalidated fetch returns fresh turns', async () => {
        // Initial fetch: conversation has no anchor turn yet because the
        // stream has not ended.
        mockFetchConversation.mockResolvedValueOnce({data: makeConversation()});

        // After stream end we invalidate and re-fetch; now the anchor turn exists.
        const finalConversation = makeConversation({
            turns: [
                {id: 't0', post_id: null, role: 'user', content: [], sequence: 0, tokens_in: 0, tokens_out: 0},
                {
                    id: 't1',
                    post_id: null,
                    role: 'assistant',
                    sequence: 1,
                    tokens_in: 0,
                    tokens_out: 0,
                    content: [
                        {
                            type: BlockType.ToolUse,
                            id: 'tu1',
                            name: 'search_docs',
                            input: {query: 'hi'},
                            status: ToolCallStatusString.Success,
                        },
                    ],
                },
                {
                    id: 't3',
                    post_id: POST_ID,
                    role: 'assistant',
                    sequence: 2,
                    tokens_in: 0,
                    tokens_out: 0,
                    content: [{type: BlockType.Text, text: 'Done'}],
                },
            ],
        });
        mockFetchConversation.mockResolvedValueOnce({data: finalConversation});

        const {queryByText, findByText} = renderWithIntlAndTheme(
            <AgentPostNew
                post={makePost()}
                conversationId={CONV_ID}
                currentUserId={USER_ID}
                location={'Channel' as any}
                isDM={true}
            />,
        );

        // Kick off a stream, receive tool calls over the wire, then end.
        await act(async () => {
            streamingStore.handleWebSocketMessage({post_id: POST_ID, control: 'start'});
            await flush();
        });
        await act(async () => {
            streamingStore.handleWebSocketMessage({
                post_id: POST_ID,
                control: 'tool_call',
                tool_call: JSON.stringify([{
                    id: 'tu1',
                    name: 'search_docs',
                    description: '',
                    arguments: {query: 'hi'},
                    status: 4,
                }]),
            });
            await flush();
        });

        // Live rendering uses the streaming state — the tool card is visible.
        expect(await findByText('Search Docs')).toBeTruthy();

        // Now end the stream. Effect 3 invalidates, the re-fetch resolves with
        // the finalized turns, Effect 1 re-populates from the conversation.
        await act(async () => {
            streamingStore.handleWebSocketMessage({post_id: POST_ID, control: 'end'});
            await flush();
        });

        // Tool card still visible after the handoff.
        expect(queryByText('Search Docs')).toBeTruthy();
    });

    it('renders tool cards when conversation and turn both populate asynchronously', async () => {
        let resolveFetch: (value: {data: ConversationResponse}) => void = () => {};
        mockFetchConversation.mockReturnValue(new Promise((resolve) => {
            resolveFetch = resolve;
        }));

        const {queryByText, findByText} = renderWithIntlAndTheme(
            <AgentPostNew
                post={makePost({message: 'Final response'})}
                conversationId={CONV_ID}
                currentUserId={USER_ID}
                location={'Channel' as any}
                isDM={true}
            />,
        );

        // Before the fetch resolves, nothing tool-related is on screen.
        expect(queryByText('Search Docs')).toBeNull();

        await act(async () => {
            resolveFetch({
                data: makeConversation({
                    turns: [
                        {id: 't0', post_id: null, role: 'user', content: [], sequence: 0, tokens_in: 0, tokens_out: 0},
                        {
                            id: 't1',
                            post_id: POST_ID,
                            role: 'assistant',
                            sequence: 1,
                            tokens_in: 0,
                            tokens_out: 0,
                            content: [
                                {
                                    type: BlockType.ToolUse,
                                    id: 'tu1',
                                    name: 'search_docs',
                                    input: {query: 'hi'},
                                    status: ToolCallStatusString.Success,
                                },
                            ],
                        },
                    ],
                }),
            });
            await flush();
        });

        // Now tool cards render.
        expect(await findByText('Search Docs')).toBeTruthy();
    });
});
