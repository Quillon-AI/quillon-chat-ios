// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import http from 'http';
import https from 'https';

import axios from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';

// Force IPv4 to avoid IPv6 connection timeouts in CI environments
// where the test server is behind Cloudflare and IPv6 is unreachable.
const httpAgent = new http.Agent({family: 4});
const httpsAgent = new https.Agent({family: 4});

const jar = new CookieJar();
const baseClient = wrapper(axios.create({
    headers: {'X-Requested-With': 'XMLHttpRequest'},
    jar,
    httpAgent,
    httpsAgent,
}));

// Add request interceptor to handle CSRF tokens
baseClient.interceptors.request.use(async (config) => {
    // Extract CSRF token from MMCSRF cookie and add as header
    const cookies = jar.getCookiesSync(config.url || '');
    const csrfCookie = cookies.find((cookie) => cookie.key === 'MMCSRF');

    if (csrfCookie && csrfCookie.value) {
        config.headers = config.headers || {};
        config.headers['X-CSRF-Token'] = csrfCookie.value;
    }

    return config;
});

export const client = baseClient;

export default client;
