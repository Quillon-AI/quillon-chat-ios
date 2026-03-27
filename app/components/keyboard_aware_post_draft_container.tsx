// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, type ReactNode, type MutableRefObject} from 'react';
import {BackHandler, DeviceEventEmitter, Platform, type StyleProp, StyleSheet, type ViewStyle, View, type LayoutChangeEvent, type GestureResponderEvent, type FlatList} from 'react-native';
import {KeyboardGestureArea} from 'react-native-keyboard-controller';
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CustomEmojiPicker from '@components/post_draft/custom_emoji_picker';
import {Events} from '@constants';
import {isEdgeToEdge} from '@constants/device';
import {useKeyboardState} from '@context/keyboard_state';
import {useIsTablet, useWindowDimensions} from '@hooks/device';
import {useInputAccessoryViewGesture} from '@hooks/use_input_accessory_view_gesture';

import type PostModel from '@typings/database/models/servers/post';

// Use KeyboardGestureArea on iOS and Android 35+ (with edge-to-edge)
// Android < 35 uses native keyboard handling with adjustResize
const Wrapper = isEdgeToEdge ? KeyboardGestureArea : View;

type RenderListProps = {
    listRef: MutableRefObject<FlatList<string | PostModel> | null>;
    onTouchMove: (event: GestureResponderEvent) => void;
    onTouchEnd: () => void;
};

type Props = {
    children: ReactNode;
    renderList: (props: RenderListProps) => ReactNode;
    textInputNativeID: string;
    containerStyle?: StyleProp<ViewStyle>;
};

const styles = StyleSheet.create({
    gestureArea: {
        justifyContent: 'flex-end',
        flex: 1,
    },
    inputContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
});

/**
 * Wrapper component that provides keyboard-aware behavior for post draft screens
 * Handles keyboard animations, scroll adjustments, and input container positioning
*/
export const KeyboardAwarePostDraftContainer = ({
    children,
    renderList,
    textInputNativeID,
    containerStyle,
}: Props) => {
    const {height: windowHeight} = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isTablet = useIsTablet();

    const effectiveWindowHeight = isTablet ? windowHeight : windowHeight - insets.bottom;

    const {
        stateContext,
        stateMachine,
        setIsEmojiSearchFocused,
        showInputAccessoryView,
        closeInputAccessoryView,
        listRef,
        postInputContainerHeight,
    } = useKeyboardState();

    const inputContainerAnimatedStyle = useAnimatedStyle(
        () => {
            return {
                transform: [{translateY: isEdgeToEdge ? -stateContext.postInputTranslateY.value : 0}],
            };
        },
        [],
    );

    // Ref to track if a layout update is already scheduled
    const layoutUpdateScheduledRef = useRef(false);
    const pendingHeightRef = useRef<number | null>(null);

    // Helper to apply the batched height update
    const applyBatchedHeightUpdate = useCallback(() => {
        layoutUpdateScheduledRef.current = false;

        if (pendingHeightRef.current !== null) {
            const heightToSet = pendingHeightRef.current;
            pendingHeightRef.current = null;

            // Only update if the rounded height changed by more than 0.5px (a real change).
            // This prevents jitter in FlatList paddingTop and improves performance.
            const currentHeight = stateContext.postInputContainerHeight.value;
            const roundedCurrentHeight = Math.round(currentHeight);
            if (roundedCurrentHeight !== heightToSet) {
                stateContext.postInputContainerHeight.value = heightToSet;
            }
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const newHeight = e.nativeEvent.layout.height;
        const roundedHeight = Math.round(newHeight);

        // Store the latest height value
        pendingHeightRef.current = roundedHeight;

        // If an update is already scheduled, skip scheduling another one
        // This batches all layout updates during animations to a single update per frame
        if (layoutUpdateScheduledRef.current) {
            return;
        }

        // Schedule update for next frame to batch rapid layout changes during animations
        layoutUpdateScheduledRef.current = true;
        requestAnimationFrame(applyBatchedHeightUpdate);
    }, [applyBatchedHeightUpdate]);

    // Callback to dismiss emoji picker after swipe gesture animation completes
    const dismissEmojiPicker = useCallback(() => {
        // Reset emoji search focus when dismissing emoji picker
        setIsEmojiSearchFocused(false);

        // IMPORTANT: Dispatch USER_CLOSE_EMOJI event to state machine
        // The gesture already animated the values, and isDraggingKeyboard flag is set
        // exitEmojiPickerToIdle will check this flag and skip animations
        stateMachine.onUserCloseEmoji();
    }, [stateMachine, setIsEmojiSearchFocused]);

    // Emoji picker swipe-to-dismiss gesture handling
    const {handleTouchMove, handleTouchEnd, originalEmojiPickerHeightRef} = useInputAccessoryViewGesture({
        effectiveWindowHeight,
        onDismiss: dismissEmojiPicker,
    });

    useEffect(() => {
        if (Platform.OS !== 'android') {
            return undefined;
        }

        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            // Check emoji picker visibility based on architecture

            if (showInputAccessoryView) {
                closeInputAccessoryView();
                return true;
            }

            return false;
        });

        return () => backHandler.remove();
    }, [closeInputAccessoryView, showInputAccessoryView]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.CLOSE_INPUT_ACCESSORY_VIEW, () => {
            closeInputAccessoryView();
        });

        return () => listener.remove();
    }, [closeInputAccessoryView]);

    // After emoji picker renders, adjust heights and scroll to keep messages visible
    // On iOS, contentInset changes cause the list to shift, so we need to scroll to compensate
    // On Android, marginBottom is used instead and doesn't require scroll adjustment
    useEffect(() => {
        if (showInputAccessoryView) {
            // Wait one frame to ensure emoji picker has rendered
            requestAnimationFrame(() => {
                // Use targetHeight instead of inputAccessoryHeight because inputAccessoryHeight
                // is still animating (via withTiming) when this runs, so we'd capture a tiny intermediate value
                const emojiPickerHeight = stateContext.targetHeight.value;
                const currentScroll = stateContext.scrollPosition.value;

                originalScrollBeforeEmojiPicker.value = currentScroll;
                originalEmojiPickerHeightRef.current = emojiPickerHeight;

                // Note: postInputTranslateY and scrollOffset are already set by emoji picker entry action
                // with smooth animations, so we don't need to set them here

                // Only perform scroll adjustment on iOS
                // Android uses marginBottom which doesn't require scroll compensation
                if (Platform.OS === 'ios') {
                    // For inverted list: when bottomInset increases, content shifts UP visually. Scroll UP to compensate.
                    const targetContentOffset = currentScroll - emojiPickerHeight;

                    listRef.current?.scrollToOffset({
                        offset: targetContentOffset,
                        animated: false,
                    });
                }
            });
        }

        // Only depend on showInputAccessoryView - the effect should only run when emoji picker visibility changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInputAccessoryView]);

    // Store the original scroll value when emoji picker opens (used by gesture)
    const originalScrollBeforeEmojiPicker = useSharedValue(0);

    const wrapperProps = useMemo(() => {
        if (isEdgeToEdge) {
            return {
                textInputNativeID,

                // Use state variable instead of .value to avoid "Reading from value during render" warning
                offset: postInputContainerHeight,
                style: styles.gestureArea,
            };
        }
        return {style: styles.gestureArea};
    }, [textInputNativeID, postInputContainerHeight]);

    const content = (
        <>
            <View style={containerStyle}>
                {renderList({
                    listRef,
                    onTouchMove: handleTouchMove,
                    onTouchEnd: handleTouchEnd,
                })}
            </View>
            <Animated.View
                style={[
                    inputContainerAnimatedStyle,
                    isEdgeToEdge && styles.inputContainer,
                ]}
            >
                <View onLayout={onLayout}>
                    {children}
                </View>
            </Animated.View>
            {showInputAccessoryView && <CustomEmojiPicker/>}
        </>
    );

    return (
        <Wrapper
            {...wrapperProps}
            enableSwipeToDismiss={false} // this applies only to Android
        >
            {content}
        </Wrapper>
    );
};

