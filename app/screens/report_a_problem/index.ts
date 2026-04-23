// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase} from '@nozbe/watermelondb/DatabaseProvider';
import {withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {License, Preferences} from '@constants';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeConfigBooleanValue, observeConfigValue, observeCurrentUserId, observeLicense, observeReportAProblemMetadata} from '@queries/servers/system';

import ReportProblem from './report_problem';

const enhanced = withObservables([], ({database}) => {
    return {
        reportAProblemType: observeConfigValue(database, 'ReportAProblemType'),
        reportAProblemMail: observeConfigValue(database, 'ReportAProblemMail'),
        reportAProblemLink: observeConfigValue(database, 'ReportAProblemLink'),
        siteName: observeConfigValue(database, 'SiteName'),
        allowDownloadLogs: observeConfigBooleanValue(database, 'AllowDownloadLogs', true),
        isFreeEdition: observeLicense(database).pipe(
            switchMap((license) => {
                const isLicensed = license?.IsLicensed === 'true';
                const isEntry = license?.SkuShortName === License.SKU_SHORT_NAME.Entry;
                return of$(!isLicensed || isEntry);
            }),
        ),
        metadata: observeReportAProblemMetadata(database),
        currentUserId: observeCurrentUserId(database),
        attachLogsEnabled: queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.ADVANCED_SETTINGS, Preferences.ATTACH_APP_LOGS).
            observeWithColumns(['value']).
            pipe(map((prefs) => prefs[0]?.value === 'true')),
    };
});

export default withDatabase(enhanced(ReportProblem));
