import { patchConsole } from '../logger/console-patch';

export { TidewaveSpanProcessor } from '../logger/tidewave-span-processor';
export { TidewaveLogRecordProcessor } from '../logger/tidewave-log-record-processor';

patchConsole();
