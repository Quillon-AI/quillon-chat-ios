// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useKeyboardHandler, useReanimatedFocusedInput} from 'react-native-keyboard-controller';
import {makeMutable, useSharedValue} from 'react-native-reanimated';

import {isAndroidEdgeToEdge} from '@constants/device';
import {StateMachineEventType, InputContainerStateType} from '@keyboard';

import type {KeyboardStateContextReturn} from '@hooks/use_keyboard_state_context';

export function useKeyboardEvents(context: KeyboardStateContextReturn, inputTag: number | null) {
    const isRotating = makeMutable(false);
    const wasRotating = useSharedValue(false);

    // Destructure to avoid passing context object into worklets
    const {processEvent, isDraggingKeyboard, isReconcilerPaused, currentState} = context;
    const {input} = useReanimatedFocusedInput();

    // Handle keyboard events from react-native-keyboard-controller
    useKeyboardHandler({
        onStart: (e) => {
            'worklet';

            isDraggingKeyboard.value = false;
            isReconcilerPaused.value = false;
            const focusedInputTag = isAndroidEdgeToEdge ? input.value?.target : e.target;

            if (inputTag != null && focusedInputTag != null && focusedInputTag === inputTag) {
                processEvent({
                    type: StateMachineEventType.USER_FOCUS_INPUT,
                    rawHeight: e.height,
                    progress: e.progress,
                });
            }

            if (currentState.value === InputContainerStateType.KEYBOARD_OPEN && e.height === 0 && e.progress === 0 && focusedInputTag === inputTag) {
                isRotating.value = true;
                return;
            }

            processEvent({
                type: StateMachineEventType.KEYBOARD_EVENT_START,
                rawHeight: e.height,
                progress: e.progress,
            });
        },
        onInteractive: (e) => {
            'worklet';

            isDraggingKeyboard.value = true;
            isReconcilerPaused.value = true;

            processEvent({
                type: StateMachineEventType.KEYBOARD_EVENT_MOVE,
                rawHeight: e.height,
                progress: e.progress,
            });
        },
        onMove: (e) => {
            'worklet';

            // If progress is 1, the keyboard animation is complete
            // Synthesize an END event instead of MOVE
            if (!isAndroidEdgeToEdge && e.progress === 1) {
                processEvent({
                    type: StateMachineEventType.KEYBOARD_EVENT_END,
                    rawHeight: e.height,
                    progress: e.progress,
                });
            } else {
                processEvent({
                    type: StateMachineEventType.KEYBOARD_EVENT_MOVE,
                    rawHeight: e.height,
                    progress: e.progress,
                });
            }
        },
        onEnd: (e) => {
            'worklet';

            if (isRotating.value && e.height === 0 && e.target === inputTag) {
                wasRotating.value = true;
                isRotating.value = false;
                return;
            }
            isRotating.value = false;

            processEvent({
                type: StateMachineEventType.KEYBOARD_EVENT_END,
                rawHeight: e.height,
                progress: e.progress,
                isRotating: wasRotating.value && e.target === inputTag,
            });

            if (wasRotating.value) {
                wasRotating.value = false;
            }
        },
    });
}
