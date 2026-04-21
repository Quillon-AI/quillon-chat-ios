// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Tool call status values
 */
export const ToolCallStatus = {
    Pending: 0,
    Accepted: 1,
    Rejected: 2,
    Error: 3,
    Success: 4,
    AutoApproved: 5,
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type ToolCallStatus = typeof ToolCallStatus[keyof typeof ToolCallStatus];

/**
 * Tool approval stage values. Mirrors the server-computed approval state for
 * a post. 'done' means no user decision remains (auto-run, keep private, all
 * rejected, or no tool_use blocks at all) — render no buttons.
 */
export const ToolApprovalStage = {
    Call: 'call',
    Result: 'result',
    Done: 'done',
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type ToolApprovalStage = typeof ToolApprovalStage[keyof typeof ToolApprovalStage];

/**
 * Tool call data structure
 */
export interface ToolCall {
    id: string;
    name: string;
    description: string;
    arguments: any;
    result?: string;
    status: ToolCallStatus;
}

/**
 * Citation/annotation data structure
 */
export interface Annotation {
    type: string;
    start_index: number;
    end_index: number;
    url: string;
    title: string;
    cited_text?: string;
    index: number;
}

/**
 * WebSocket message data for agent post updates
 */
export interface PostUpdateWebsocketMessage {
    post_id: string;
    next?: string; // Full accumulated message text
    control?: string; // Control signals: 'start', 'end', 'cancel', 'reasoning_summary', 'tool_call', 'annotations'
    tool_call?: string; // JSON-encoded tool calls
    reasoning?: string; // Reasoning summary text
    annotations?: string; // JSON-encoded citations
}

/**
 * Streaming state for an active agent post
 */
export interface StreamingState {
    postId: string;
    generating: boolean;
    message: string;
    precontent: boolean; // True during 'start' before first content
    reasoning: string; // Accumulated reasoning text
    isReasoningLoading: boolean; // True while reasoning is being generated
    showReasoning: boolean; // True if reasoning should be displayed
    toolCalls: ToolCall[]; // Tool calls pending approval or processed
    annotations: Annotation[]; // Citations/annotations for the post
}

/**
 * AI thread data structure from the server.
 *
 * Wire shape differs between plugin versions:
 * - plugin < 2.0: `id` is the root post id; `channel_id` is always a string.
 * - plugin >= 2.0: `id` is the conversation id; `root_post_id` is the nullable
 *   root post id; `channel_id` may be null for threadless conversations; a new
 *   `bot_id` is present.
 *
 * Mobile normalises to the legacy shape at ingestion — see fetchAIThreads —
 * so by the time this interface reaches the handler, `id` is always the root
 * post id suitable for navigation.
 */
export interface AIThread {
    id: string; // Post ID (normalised on ingest)
    message: string; // Preview text
    title: string; // Thread title
    channel_id: string; // DM channel with bot
    reply_count: number; // Number of replies
    update_at: number; // Last update timestamp

    // Raw plugin >= 2.0 fields, surfaced for callers that need them.
    root_post_id?: string | null;
    bot_id?: string;
}

/**
 * Channel access level values
 */
export const ChannelAccessLevel = {
    All: 0,
    Allow: 1,
    Block: 2,
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type ChannelAccessLevel = typeof ChannelAccessLevel[keyof typeof ChannelAccessLevel];

/**
 * User access level values
 */
export const UserAccessLevel = {
    All: 0,
    Allow: 1,
    Block: 2,
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type UserAccessLevel = typeof UserAccessLevel[keyof typeof UserAccessLevel];

/**
 * LLM Bot data structure
 */
export interface LLMBot {
    id: string;
    displayName: string;
    username: string;
    lastIconUpdate: number;
    dmChannelID: string;
    channelAccessLevel: ChannelAccessLevel;
    channelIDs: string[];
    userAccessLevel: UserAccessLevel;
    userIDs: string[];
    teamIDs: string[];
}

/**
 * AI Bots response from the server
 */
export interface AIBotsResponse {
    bots: LLMBot[];
    searchEnabled: boolean;
    allowUnsafeLinks: boolean;
}

// ============================================================================
// Conversation Entity Types (plugin-agents >= 2.0)
// ============================================================================

export {
    BlockType,
    ToolCallStatusString,
    type Citation,
    type ContentBlock,
    type ConversationResponse,
    type Turn,
    type TurnRole,
    type WebSearchContext,
} from './conversation';

// ============================================================================
// Rewrite Types
// ============================================================================

export type {Agent} from './api';

/**
 * Available rewrite action types
 */
export type RewriteAction = 'shorten' | 'elaborate' | 'improve_writing' | 'fix_spelling' | 'simplify' | 'summarize' | 'custom';
