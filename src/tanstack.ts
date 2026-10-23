import { patchConsole } from './logger/console-patch';
import { installEvalListener } from './evaluation/runtime';

patchConsole();

// The Vite module runner loads this module in the app server runtime, so
// we can evaluate code there. We keep import.meta in a variable, because
// Bun replaces import.meta.hot with undefined when building.
const meta = import.meta as ImportMeta & { hot?: Parameters<typeof installEvalListener>[0] };

installEvalListener(meta.hot, url => import(url));
