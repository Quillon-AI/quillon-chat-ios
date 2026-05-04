// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Quillon v4: replaced the upstream SVG dot-grid with a solid warm
// near-black surface. The original 100KB inline SVG is intentionally gone —
// premium-dev language doesn't decorate empty space.

import React from 'react';
import {StyleSheet, View} from 'react-native';

type Props = {
    theme: Theme;
}

const styles = StyleSheet.create({
    background: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#08090A',
    },
});

const Background = (_: Props) => <View style={styles.background}/>;

export default Background;
