// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {map} from 'rxjs/operators';

import {Preferences} from '@constants';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeConfigBooleanValue, observeConfigValue, observeIsFreeEdition, observeReportAProblemMetadata} from '@queries/servers/system';

import ReportProblem from './report_problem';

const enhanced = withObservables([], ({database}) => ({
    allowDownloadLogs: observeConfigBooleanValue(database, 'AllowDownloadLogs', true),
    attachLogsEnabled: queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.ADVANCED_SETTINGS, Preferences.ATTACH_APP_LOGS).
        observeWithColumns(['value']).
        pipe(map((prefs) => prefs[0]?.value === 'true')),
    isFreeEdition: observeIsFreeEdition(database),
    reportAProblemMail: observeConfigValue(database, 'ReportAProblemMail'),
    reportAProblemType: observeConfigValue(database, 'ReportAProblemType'),
    siteName: observeConfigValue(database, 'SiteName'),
    metadata: observeReportAProblemMetadata(database),
}));

export default withDatabase(enhanced(ReportProblem));
