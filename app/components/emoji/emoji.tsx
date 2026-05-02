// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {EmojiIndicesByAlias, Emojis} from '@utils/emoji';

import type {EmojiProps} from '@typings/components/emoji';

const HEX_RE = /^[0-9a-f]+$/i;

const codePointsToString = (image: string): string => {
    return image.split('-').reduce((acc, c) => {
        const cp = parseInt(c, 16);
        if (cp <= 0xFFFF) {
            return acc + String.fromCharCode(cp);
        }
        const adjusted = cp - 0x10000;
        return acc + String.fromCharCode(0xD800 + (adjusted >> 10), 0xDC00 + (adjusted & 0x3FF));
    }, '');
};

const isUnicodeImage = (image: string): boolean => {
    return image.split('-').every((c) => HEX_RE.test(c));
};

const Emoji = ({emojiName, literal = '', testID, textStyle, commonStyle, ...props}: EmojiProps) => {
    const name = emojiName.trim();

    let size = props.size;
    if (!size && textStyle) {
        const flatten = StyleSheet.flatten(textStyle);
        size = flatten.fontSize;
    }

    const idx = EmojiIndicesByAlias.get(name);
    const emoji = idx !== undefined ? Emojis[idx] : undefined;

    const sizeStyle = size ? {fontSize: size} : undefined;

    if (emoji && emoji.image && isUnicodeImage(emoji.image)) {
        return (
            <Text
                style={[commonStyle, textStyle, sizeStyle]}
                testID={testID}
            >
                {codePointsToString(emoji.image)}
            </Text>
        );
    }

    return (
        <Text
            style={[commonStyle, textStyle, sizeStyle]}
            testID={testID}
        >
            {literal || `:${name}:`}
        </Text>
    );
};

export default Emoji;
