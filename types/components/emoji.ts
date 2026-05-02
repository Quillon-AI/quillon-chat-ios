// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ImageStyle} from 'expo-image';
import type {StyleProp, TextStyle} from 'react-native';

type ImageStyleUniques = Omit<ImageStyle, keyof(TextStyle)>
export type EmojiCommonStyle = Omit<ImageStyle, keyof(ImageStyleUniques)>

export type EmojiProps = {
    emojiName: string;
    literal?: string;
    size?: number;
    textStyle?: StyleProp<TextStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    commonStyle?: StyleProp<Intersection<TextStyle, EmojiCommonStyle>>;
    testID?: string;
}

export type EmojiComponent = (props: EmojiProps) => JSX.Element;
