// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {renderHook} from '@testing-library/react-native';

import {StateMachineEventType} from '@keyboard';

import {useKeyboardStateMachine} from './index';

jest.mock('react-native-reanimated', () => ({
    ...jest.requireActual('react-native-reanimated'),
    runOnUI: (fn: (...args: unknown[]) => void) => fn,
}));

function makeContext() {
    const processEvent = jest.fn();
    const isEmojiPickerActive = jest.fn(() => false);
    return {processEvent, isEmojiPickerActive};
}

describe('useKeyboardStateMachine', () => {
    describe('onUserFocusInput', () => {
        it('should dispatch USER_FOCUS_INPUT with undefined height and progress by default', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusInput();

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_FOCUS_INPUT,
                rawHeight: undefined,
                height: undefined,
                progress: undefined,
            });
        });

        it('should dispatch USER_FOCUS_INPUT with height=0 and progress=0 when asHardwareKeyboard=true', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusInput(true);

            expect(ctx.processEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: StateMachineEventType.USER_FOCUS_INPUT,
                    rawHeight: 0,
                    height: 0,
                    progress: 0,
                }),
            );
        });

        it('should also dispatch KEYBOARD_EVENT_START and KEYBOARD_EVENT_END when asHardwareKeyboard=true', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusInput(true);

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.KEYBOARD_EVENT_START,
                rawHeight: 0,
                height: 0,
                progress: 0,
            });
            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.KEYBOARD_EVENT_END,
                rawHeight: 0,
                height: 0,
                progress: 0,
            });
            expect(ctx.processEvent).toHaveBeenCalledTimes(3);
        });

        it('should NOT dispatch hardware keyboard events when asHardwareKeyboard=false', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusInput(false);

            expect(ctx.processEvent).toHaveBeenCalledTimes(1);
            expect(ctx.processEvent).not.toHaveBeenCalledWith(
                expect.objectContaining({type: StateMachineEventType.KEYBOARD_EVENT_START}),
            );
        });
    });

    describe('onUserOpenEmoji', () => {
        it('should dispatch USER_OPEN_EMOJI', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserOpenEmoji();

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_OPEN_EMOJI,
            });
        });
    });

    describe('onUserCloseEmoji', () => {
        it('should dispatch USER_CLOSE_EMOJI', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserCloseEmoji();

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_CLOSE_EMOJI,
            });
        });
    });

    describe('onUserFocusEmojiSearch', () => {
        it('should dispatch USER_FOCUS_EMOJI_SEARCH without hardware keyboard events by default', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusEmojiSearch();

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_FOCUS_EMOJI_SEARCH,
            });
            expect(ctx.processEvent).toHaveBeenCalledTimes(1);
        });

        it('should also dispatch KEYBOARD_EVENT_START and KEYBOARD_EVENT_END when asHardwareKeyboard=true', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserFocusEmojiSearch(true);

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_FOCUS_EMOJI_SEARCH,
            });
            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.KEYBOARD_EVENT_START,
                rawHeight: 0,
                height: 0,
                progress: 0,
            });
            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.KEYBOARD_EVENT_END,
                rawHeight: 0,
                height: 0,
                progress: 0,
            });
            expect(ctx.processEvent).toHaveBeenCalledTimes(3);
        });
    });

    describe('onUserBlurEmojiSearch', () => {
        it('should dispatch USER_BLUR_EMOJI_SEARCH', () => {
            const ctx = makeContext();
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            result.current.onUserBlurEmojiSearch();

            expect(ctx.processEvent).toHaveBeenCalledWith({
                type: StateMachineEventType.USER_BLUR_EMOJI_SEARCH,
            });
        });
    });

    describe('isEmojiPickerActive', () => {
        it('should delegate to context.isEmojiPickerActive', () => {
            const ctx = makeContext();
            ctx.isEmojiPickerActive.mockReturnValue(true);
            const {result} = renderHook(() => useKeyboardStateMachine(ctx as never));

            expect(result.current.isEmojiPickerActive()).toBe(true);
            expect(ctx.isEmojiPickerActive).toHaveBeenCalledTimes(1);
        });
    });
});
