// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Content-block discriminator values. Must stay in sync with Go constants in
 * mattermost-plugin-agents/conversation/content_block.go.
 */
export const BlockType = {
    Text: 'text',
    Thinking: 'thinking',
    ToolUse: 'tool_use',
    ToolResult: 'tool_result',
    File: 'file',
    Image: 'image',
    Annotations: 'annotations',
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type BlockType = typeof BlockType[keyof typeof BlockType];

/**
 * Tool-call status strings used on the wire for conversation entity content
 * blocks. Distinct from the numeric ToolCallStatus enum the mobile UI uses,
 * which is translated at the boundary via turn_content utils.
 */
export const ToolCallStatusString = {
    Pending: 'pending',
    Accepted: 'accepted',
    Rejected: 'rejected',
    Error: 'error',
    Success: 'success',
    AutoApproved: 'auto_approved',
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- TypeScript supports same-name type/value pairs as enum alternative
export type ToolCallStatusString = typeof ToolCallStatusString[keyof typeof ToolCallStatusString];

export interface Citation {
    type: string;
    url?: string;
    title?: string;
    start_index: number;
    end_index: number;
}

export interface WebSearchContext {
    results: unknown;
    executed_queries: unknown;
    count: number;
}

/**
 * Flat content block that carries all shapes — the Type field discriminates
 * which of the optional fields are meaningful. Mirrors the Go struct so the
 * JSON shape is identical.
 */
export interface ContentBlock {
    type: string;

    // Text / Thinking fields
    text?: string;
    signature?: string;
    citations?: Citation[];

    // ToolUse fields
    id?: string;
    name?: string;
    server_origin?: string;
    input?: Record<string, unknown> | null;
    status?: ToolCallStatusString;
    shared?: boolean;

    // ToolResult fields
    tool_use_id?: string;
    content?: string;

    // Timestamp (ms) at which the share/keep-private decision was recorded.
    // Undefined → decision still pending; defined → decision made, no approval UI.
    decided_at?: number;

    // File / Image fields
    filename?: string;
    mime_type?: string;
    file_id?: string;

    // Annotations fields
    web_search_context?: WebSearchContext;
}

export type TurnRole = 'user' | 'assistant' | 'tool_result';

export interface Turn {
    id: string;
    conversation_id?: string;
    post_id: string | null;
    role: TurnRole;
    content: ContentBlock[];
    tokens_in: number;
    tokens_out: number;
    sequence: number;
    created_at?: number;

    // Set only on post-anchor assistant turns. Server-computed from the
    // conversation state: 'call' → pending Accept/Reject; 'result' → pending
    // Share/Keep private; 'done' → no user decision remains.
    approval_state?: 'call' | 'result' | 'done';
}

export interface ConversationResponse {
    id: string;
    user_id: string;
    bot_id: string;
    channel_id: string | null;
    root_post_id: string | null;
    title: string;
    operation: string;
    turns: Turn[];
}
