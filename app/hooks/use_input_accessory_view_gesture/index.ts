// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef} from 'react';
import {Keyboard, type GestureResponderEvent} from 'react-native';
import {runOnJS, useAnimatedReaction, useSharedValue, withTiming} from 'react-native-reanimated';

import {useKeyboardState} from '@context/keyboard_state';

type UseInputAccessoryViewGestureConfig = {
    effectiveWindowHeight: number;
    onDismiss: () => void;
};

/**
 * Hook to handle emoji picker swipe-to-dismiss gesture
 * Manages touch tracking, height adjustments, and smooth scroll coordination during interactive dismissal
 */
export function useInputAccessoryViewGesture(config: UseInputAccessoryViewGestureConfig) {
    const {effectiveWindowHeight, onDismiss} = config;
    const {stateContext, listRef, showInputAccessoryView} = useKeyboardState();

    // Refs for tracking gesture state
    const previousTouchYRef = useRef<number | null>(null);
    const lastDistanceFromBottomRef = useRef<number | null>(null);
    const lastIsSwipingDownRef = useRef<boolean | null>(null);
    const originalEmojiPickerHeightRef = useRef<number>(0);
    const isGestureActiveRef = useRef<boolean>(false);
    const gestureStartedInEmojiPickerRef = useRef<boolean>(false);

    // Shared value to track scroll adjustment during emoji picker animation
    const animatedScrollAdjustment = useSharedValue(0);

    // Callback to perform scroll adjustment
    const performScrollAdjustment = useCallback((targetOffset: number) => {
        listRef.current?.scrollToOffset({
            offset: targetOffset,
            animated: false,
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // React to animatedScrollAdjustment changes and scroll the list accordingly
    // This enables smooth scrolling as emoji picker animates
    useAnimatedReaction(
        () => animatedScrollAdjustment.value,
        (current, previous) => {
            // Only scroll if value actually changed and is valid
            if (previous !== null && current !== previous && current !== 0) {
                runOnJS(performScrollAdjustment)(current);
            }
        },
        [animatedScrollAdjustment],
    );

    // Handle touch move: track finger position and adjust emoji picker height
    const handleTouchMove = useCallback((event: GestureResponderEvent) => {
        const currentShowInputAccessoryView = showInputAccessoryView;
        if (!currentShowInputAccessoryView || Keyboard.isVisible()) {
            return;
        }

        // Get finger Y position on screen
        const fingerY = event.nativeEvent.pageY;
        if (fingerY == null) {
            return;
        }

        const effectiveContainerHeight = stateContext.postInputContainerHeight.value;

        // On first touch, check if gesture started within emoji picker bounds
        if (!isGestureActiveRef.current) {
            const currentEmojiPickerHeight = stateContext.inputAccessoryHeight.value;
            const emojiPickerTopEdge = effectiveWindowHeight - effectiveContainerHeight - currentEmojiPickerHeight;
            const emojiPickerBottomEdge = effectiveWindowHeight - effectiveContainerHeight;

            // Check if touch is within emoji picker area
            const isTouchInEmojiPicker = fingerY >= emojiPickerTopEdge && fingerY <= emojiPickerBottomEdge;

            if (!isTouchInEmojiPicker) {
                return;
            }

            isGestureActiveRef.current = true;
            gestureStartedInEmojiPickerRef.current = true;

            // Set isDraggingKeyboard flag to signal that we're interactively dragging
            // This tells the state machine to skip animations in exitEmojiPickerToIdle
            stateContext.isDraggingKeyboard.value = true;
        }

        // Only process if gesture started in emoji picker
        if (!gestureStartedInEmojiPickerRef.current) {
            return;
        }

        const distanceFromBottom = effectiveWindowHeight - fingerY;

        // Subtract input container height to get emoji picker height
        const emojiPickerHeight = distanceFromBottom - effectiveContainerHeight;
        const maxHeight = originalEmojiPickerHeightRef.current;
        const clampedHeight = emojiPickerHeight < 0 ? 0 : Math.min(emojiPickerHeight, maxHeight);

        // Update emoji picker height AND input container position
        // In NEW architecture, input container position is driven by postInputTranslateY
        // postInputTranslateY also drives scroll padding (contentInset/marginBottom)
        stateContext.inputAccessoryHeight.value = clampedHeight;
        stateContext.postInputTranslateY.value = clampedHeight;
        lastDistanceFromBottomRef.current = clampedHeight;
        lastIsSwipingDownRef.current = previousTouchYRef.current !== null && fingerY > previousTouchYRef.current;
        previousTouchYRef.current = fingerY;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInputAccessoryView, effectiveWindowHeight]);

    // Handle touch end: decide whether to collapse or expand emoji picker
    const handleTouchEnd = useCallback(() => {
        isGestureActiveRef.current = false;

        // Only process if gesture started in emoji picker
        if (!gestureStartedInEmojiPickerRef.current) {
            // Reset dragging flag if gesture didn't start in emoji picker
            stateContext.isDraggingKeyboard.value = false;
            return;
        }

        if (lastDistanceFromBottomRef.current !== null && lastIsSwipingDownRef.current !== null) {
            const currentInsetHeight = lastDistanceFromBottomRef.current;
            const currentScrollValue = stateContext.scrollPosition.value;

            if (lastIsSwipingDownRef.current) {
                // User was swiping DOWN → Collapse and dismiss emoji picker
                // Calculate scroll positions: as postInputTranslateY decreases from current to 0,
                // list should scroll from current position to final position
                const startScrollOffset = -currentInsetHeight + currentScrollValue;
                const endScrollOffset = currentScrollValue;

                // CRITICAL: Keep isDraggingKeyboard = true during animation to prevent reconciler sync
                // The exit action will clear it after setting final values
                // Animate emoji picker height AND input container position to 0
                stateContext.inputAccessoryHeight.value = withTiming(
                    0,
                    {duration: 250},
                    () => {
                        // After animation completes, call onDismiss to update state machine
                        runOnJS(onDismiss)();
                    },
                );
                stateContext.postInputTranslateY.value = withTiming(0, {duration: 250});

                // Animate scroll position from start to end - this makes list scroll down smoothly
                animatedScrollAdjustment.value = startScrollOffset;
                animatedScrollAdjustment.value = withTiming(endScrollOffset, {
                    duration: 250,
                }, () => {
                    animatedScrollAdjustment.value = 0;
                });
            } else {
                // User was swiping UP → Expand to full height
                const targetHeight = originalEmojiPickerHeightRef.current;

                // Calculate scroll positions: as postInputTranslateY increases from current to targetHeight,
                // list should scroll from current position to final position
                const startScrollOffset = -currentInsetHeight + currentScrollValue;
                const endScrollOffset = -targetHeight + currentScrollValue;

                // CRITICAL: Keep isDraggingKeyboard = true during animation to prevent reconciler sync
                // Clear it after animation completes
                // Animate emoji picker height AND input container position to target height
                stateContext.inputAccessoryHeight.value = withTiming(targetHeight, {
                    duration: 250,
                }, () => {
                    // Clear dragging flag after swipe up animation completes
                    'worklet';
                    stateContext.isDraggingKeyboard.value = false;
                });
                stateContext.postInputTranslateY.value = withTiming(targetHeight, {duration: 250});

                // Animate scroll position from start to end - this makes list scroll up smoothly
                animatedScrollAdjustment.value = startScrollOffset;
                animatedScrollAdjustment.value = withTiming(endScrollOffset, {
                    duration: 250,
                }, () => {
                    animatedScrollAdjustment.value = 0;
                });
            }
        }

        previousTouchYRef.current = null;
        lastDistanceFromBottomRef.current = null;
        lastIsSwipingDownRef.current = null;
        gestureStartedInEmojiPickerRef.current = false;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onDismiss]);

    return {
        handleTouchMove,
        handleTouchEnd,
        originalEmojiPickerHeightRef,
    };
}
