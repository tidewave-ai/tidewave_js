/**
 * Tidewave OpenTelemetry processors for Next.js
 *
 * Importing this module will automatically patch console.log to capture console output.
 * You can then add the processors to your OpenTelemetry setup.
 */
export { TidewaveSpanProcessor, TidewaveLogRecordProcessor } from '../logger/instrumentation';
