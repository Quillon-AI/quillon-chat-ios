// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {Platform, StyleSheet, type FlatList, type GestureResponderEvent} from 'react-native';
import {useKeyboardState as useControllerKeyboardState} from 'react-native-keyboard-controller';
import Animated, {runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle} from 'react-native-reanimated';

import {isAndroidEdgeToEdge, isEdgeToEdge} from '@constants/device';
import {useKeyboardState} from '@context/keyboard_state';
import useDidMount from '@hooks/did_mount';
import {DEFAULT_INPUT_ACCESSORY_HEIGHT} from '@keyboard';

import AgentChatIntro from './agent_chat_intro';

import type PostModel from '@typings/database/models/servers/post';

type Props = {
    loading: boolean;
    error: string | null;
    listRef?: React.RefObject<FlatList<string | PostModel>>;
    onTouchMove?: (event: GestureResponderEvent) => void;
    onTouchEnd?: () => void;
}

const emptyList: string[] = [];
const renderItem = () => null;

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
});

const AgentChatContent = ({error, loading, listRef, onTouchEnd, onTouchMove}: Props) => {
    const {isVisible: isKeyboardVisible} = useControllerKeyboardState();
    const {stateContext, onScroll: onScrollProp, postInputContainerHeight, stateMachine} = useKeyboardState();
    const [emojiPickerPadding, setEmojiPickerPadding] = useState(0);

    const {
        scrollOffset: scrollOffsetShared,
        scrollPosition: scrollPositionShared,
        postInputTranslateY,
        inputAccessoryHeight,
    } = stateContext;

    const scrollToOffsetCallback = useCallback((offset: number, position: number) => {
        const targetOffset = -offset + position;
        listRef?.current?.scrollToOffset({
            offset: targetOffset,
            animated: false,
        });
    }, [listRef]);

    useAnimatedReaction(
        () => ({
            scrollOffset: scrollOffsetShared.value,
            scrollPosition: scrollPositionShared.value,
            isReconcilerPaused: stateContext.isReconcilerPaused.value,
        }),
        (current, previous) => {
            'worklet';

            // Skip scroll compensation if reconciler is paused
            // This allows exit actions to manually adjust scrollPosition without interference
            if (current.isReconcilerPaused) {
                return;
            }

            // Trigger scroll compensation if EITHER scrollOffset or scrollPosition changed
            // This ensures we continuously adjust scroll as contentInset changes during keyboard animation
            const offsetChanged = previous === null || Math.abs(current.scrollOffset - (previous?.scrollOffset || 0)) > 0.5;

            if (!offsetChanged) {
                return;
            }

            runOnJS(scrollToOffsetCallback)(current.scrollOffset, current.scrollPosition);
        },
        [scrollToOffsetCallback],
    );

    useAnimatedReaction(
        () => {
            const shouldAddEmojiPickerPadding = Platform.OS === 'android' && !isAndroidEdgeToEdge && !isKeyboardVisible && stateMachine.isEmojiPickerActive();
            const emojiPickerHeight = shouldAddEmojiPickerPadding ? (inputAccessoryHeight.value || DEFAULT_INPUT_ACCESSORY_HEIGHT) : 0;
            return emojiPickerHeight;
        },
        (emojiPickerHeight) => {
            runOnJS(setEmojiPickerPadding)(emojiPickerHeight);
        },
        [isKeyboardVisible],
    );

    const scrollToEnd = useCallback(() => {
        listRef?.current?.scrollToOffset({offset: -postInputTranslateY.value, animated: true});
    }, [listRef, postInputTranslateY.value]);

    useDidMount(() => {
        const t = setTimeout(() => {
            scrollToEnd();
        }, 300);

        return () => clearTimeout(t);
    });

    const contentContainerStyleWithPadding = useMemo(() => {
        return {paddingTop: isEdgeToEdge ? postInputContainerHeight + emojiPickerPadding : 0};
    }, [emojiPickerPadding, postInputContainerHeight]);

    const animatedProps = useAnimatedProps(
        () => {
            return {
                contentInset: {
                    top: Math.max(postInputTranslateY.value, 0),
                },
            };
        },
        [],
    );

    const androidExtra = useAnimatedStyle(() => {
        if (isAndroidEdgeToEdge) {
            return {
                marginBottom: Math.max(postInputTranslateY.value, 0),
            };
        }
        return {};
    }, []);

    return (
        <Animated.FlatList
            animatedProps={animatedProps}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior='never'
            contentContainerStyle={contentContainerStyleWithPadding}
            data={emptyList}
            keyboardDismissMode='interactive'
            keyboardShouldPersistTaps='handled'
            ListHeaderComponent={
                <AgentChatIntro
                    loading={loading}
                    error={error}
                />
            }
            onScroll={onScrollProp}
            ref={listRef}
            removeClippedSubviews={true}
            renderItem={renderItem}
            style={[styles.flex, androidExtra]}
            inverted={true}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        />
    );
};

export default AgentChatContent;

