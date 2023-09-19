import dc from 'npm:dd-trace/packages/diagnostics_channel/index.js';

// TODO = use TBD naming convention
export const bodyParser = dc.channel('datadog:body-parser:read:finish');
export const graphqlFinishExecute = dc.channel('apm:graphql:execute:finish');
export const incomingHttpRequestStart = dc.channel('dd-trace:incomingHttpRequestStart');
export const incomingHttpRequestEnd = dc.channel('dd-trace:incomingHttpRequestEnd');
export const passportVerify = dc.channel('datadog:passport:verify:finish');
export const queryParser = dc.channel('datadog:query:read:finish');
export const setCookieChannel = dc.channel('datadog:iast:set-cookie');
