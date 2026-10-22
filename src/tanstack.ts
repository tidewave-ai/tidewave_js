import { patchConsole } from './logger/console-patch';
import { installEvalListener } from './evaluation/runtime';

type HotMeta = ImportMeta & { hot?: Parameters<typeof installEvalListener>[0] };

patchConsole();

// The Vite module runner loads this module in the app server runtime, so
// we can evaluate code there
installEvalListener((import.meta as HotMeta).hot, url => import(url));
