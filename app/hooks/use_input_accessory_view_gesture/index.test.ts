// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react-native';
import {Keyboard, type GestureResponderEvent} from 'react-native';

import {useKeyboardState} from '@context/keyboard_state';

import {useInputAccessoryViewGesture} from './index';

jest.mock('@context/keyboard_state', () => ({
    useKeyboardState: jest.fn(),
}));

jest.mock('react-native-reanimated', () => ({
    ...jest.requireActual('react-native-reanimated'),

    // The real withTiming is a worklet — returns an animation descriptor, never assigns
    // the target value and never calls its callback in Jest. Override for synchronous tests.
    withTiming: (toValue: number, _config?: unknown, callback?: (finished: boolean) => void) => {
        callback?.(true);
        return toValue;
    },

    // The real runOnJS schedules via queueMicrotask when not in a worklet context,
    // making callbacks fire asynchronously outside act(). Override to call synchronously.
    runOnJS: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

function makeEvent(pageY: number): GestureResponderEvent {
    return {nativeEvent: {pageY}} as unknown as GestureResponderEvent;
}

const mockScrollToOffset = jest.fn();
const mockListRef = {current: {scrollToOffset: mockScrollToOffset}};

const mockStateContext = {
    postInputContainerHeight: {value: 60},
    inputAccessoryHeight: {value: 300},
    postInputTranslateY: {value: 0},
    isDraggingKeyboard: {value: false},
    scrollPosition: {value: 0},
};

function makeKeyboardStateMock(showInputAccessoryView = true) {
    jest.mocked(useKeyboardState).mockReturnValue({
        showInputAccessoryView,
        stateContext: mockStateContext,
        listRef: mockListRef,
    } as unknown as ReturnType<typeof useKeyboardState>);
}

const WINDOW_HEIGHT = 800;
const CONTAINER_HEIGHT = 60;
const PICKER_HEIGHT = 300;

// Emoji picker bounds: top=440, bottom=740
const PICKER_TOP = WINDOW_HEIGHT - CONTAINER_HEIGHT - PICKER_HEIGHT;
const PICKER_BOTTOM = WINDOW_HEIGHT - CONTAINER_HEIGHT;

function renderGestureHook(showInputAccessoryView = true) {
    makeKeyboardStateMock(showInputAccessoryView);
    const onDismiss = jest.fn();
    const {result} = renderHook(() =>
        useInputAccessoryViewGesture({
            effectiveWindowHeight: WINDOW_HEIGHT,
            onDismiss,
        }),
    );
    return {result, onDismiss};
}

describe('useInputAccessoryViewGesture', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateContext.postInputContainerHeight.value = CONTAINER_HEIGHT;
        mockStateContext.inputAccessoryHeight.value = PICKER_HEIGHT;
        mockStateContext.postInputTranslateY.value = 0;
        mockStateContext.isDraggingKeyboard.value = false;
        mockStateContext.scrollPosition.value = 0;
        jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('handleTouchMove — early returns', () => {
        it('should do nothing when showInputAccessoryView is false', () => {
            const {result} = renderGestureHook(false);

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 10));
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
            expect(mockStateContext.inputAccessoryHeight.value).toBe(PICKER_HEIGHT);
        });

        it('should do nothing when the keyboard is visible', () => {
            jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
            const {result} = renderGestureHook();

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 10));
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
        });

        it('should do nothing when fingerY is null', () => {
            const {result} = renderGestureHook();
            const eventWithNullY = {nativeEvent: {pageY: null}} as unknown as GestureResponderEvent;

            act(() => {
                result.current.handleTouchMove(eventWithNullY);
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
        });

        it('should do nothing when the first touch is above the emoji picker', () => {
            const {result} = renderGestureHook();

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP - 10));
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
            expect(mockStateContext.inputAccessoryHeight.value).toBe(PICKER_HEIGHT);
        });

        it('should do nothing when the first touch is below the emoji picker', () => {
            const {result} = renderGestureHook();

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_BOTTOM + 10));
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
        });
    });

    describe('handleTouchMove — gesture tracking', () => {
        it('should set isDraggingKeyboard=true on the first in-bounds touch', () => {
            const {result} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 10));
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(true);
        });

        it('should update inputAccessoryHeight based on finger position', () => {
            const {result} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            // fingerY=500: distanceFromBottom=300, emojiPickerHeight=300-60=240
            act(() => {
                result.current.handleTouchMove(makeEvent(500));
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(240);
        });

        it('should update postInputTranslateY to match inputAccessoryHeight', () => {
            const {result} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            act(() => {
                result.current.handleTouchMove(makeEvent(500));
            });

            expect(mockStateContext.postInputTranslateY.value).toBe(240);
        });

        it('should clamp inputAccessoryHeight to 0 when finger goes below the container', () => {
            const {result} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            // Activate gesture with an in-bounds first touch
            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 10));
            });

            // Drag past the container bottom: emojiPickerHeight = (800-780)-60 = -40 → clamped to 0
            act(() => {
                result.current.handleTouchMove(makeEvent(780));
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(0);
            expect(mockStateContext.postInputTranslateY.value).toBe(0);
        });

        it('should clamp inputAccessoryHeight to originalEmojiPickerHeight when finger overshoots the top', () => {
            const {result} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            // fingerY=100: emojiPickerHeight = (800-100)-60 = 640 > 300 → clamped to 300
            act(() => {
                result.current.handleTouchMove(makeEvent(100));
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(PICKER_HEIGHT);
        });
    });

    describe('handleTouchEnd — gesture did not start in emoji picker', () => {
        it('should reset isDraggingKeyboard and not call onDismiss', () => {
            const {result, onDismiss} = renderGestureHook();
            mockStateContext.isDraggingKeyboard.value = true;

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
            expect(onDismiss).not.toHaveBeenCalled();
        });
    });

    describe('handleTouchEnd — swipe down dismisses the picker', () => {
        function setupSwipeDown() {
            const {result, onDismiss} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 50));
            });
            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 100));
            });

            return {result, onDismiss};
        }

        it('should call onDismiss', () => {
            const {result, onDismiss} = setupSwipeDown();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(onDismiss).toHaveBeenCalledTimes(1);
        });

        it('should set inputAccessoryHeight to 0', () => {
            const {result} = setupSwipeDown();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(0);
        });

        it('should set postInputTranslateY to 0', () => {
            const {result} = setupSwipeDown();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.postInputTranslateY.value).toBe(0);
        });

        it('should reset gesture state so subsequent touches outside the picker are ignored', () => {
            const {result} = setupSwipeDown();

            act(() => {
                result.current.handleTouchEnd();
            });

            // After reset, a touch above the collapsed picker should have no effect
            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP - 10));
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(0);
        });
    });

    describe('handleTouchEnd — swipe up expands the picker', () => {
        function setupSwipeUp() {
            const {result, onDismiss} = renderGestureHook();
            result.current.originalEmojiPickerHeightRef.current = PICKER_HEIGHT;

            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 100));
            });
            act(() => {
                result.current.handleTouchMove(makeEvent(PICKER_TOP + 50));
            });

            return {result, onDismiss};
        }

        it('should not call onDismiss', () => {
            const {result, onDismiss} = setupSwipeUp();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(onDismiss).not.toHaveBeenCalled();
        });

        it('should restore inputAccessoryHeight to originalEmojiPickerHeight', () => {
            const {result} = setupSwipeUp();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.inputAccessoryHeight.value).toBe(PICKER_HEIGHT);
        });

        it('should restore postInputTranslateY to originalEmojiPickerHeight', () => {
            const {result} = setupSwipeUp();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.postInputTranslateY.value).toBe(PICKER_HEIGHT);
        });

        it('should clear isDraggingKeyboard after the animation completes', () => {
            const {result} = setupSwipeUp();

            act(() => {
                result.current.handleTouchEnd();
            });

            expect(mockStateContext.isDraggingKeyboard.value).toBe(false);
        });
    });

    describe('return values', () => {
        it('should return originalEmojiPickerHeightRef with current=0', () => {
            const {result} = renderGestureHook();
            expect(result.current.originalEmojiPickerHeightRef.current).toBe(0);
        });

        it('should return handleTouchMove and handleTouchEnd as functions', () => {
            const {result} = renderGestureHook();
            expect(typeof result.current.handleTouchMove).toBe('function');
            expect(typeof result.current.handleTouchEnd).toBe('function');
        });
    });
});
