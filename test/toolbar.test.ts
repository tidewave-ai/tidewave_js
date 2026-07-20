import { describe, expect, it } from 'vitest';
import { injectToolbarHtml } from '../src/toolbar';

describe('toolbar HTML injection', () => {
  it('should inject before the first closing head tag', () => {
    const html =
      '<html><head><title>App</title></head><body><script>const marker = "</head>";</script></body></html>';

    const injected = injectToolbarHtml(html, { clientUrl: 'http://localhost:4000' }, () => 5173);

    const toolbarIndex = injected.indexOf('/tc/toolbar.js');
    const firstClosingHeadIndex = injected.indexOf('</head>');
    const scriptMarkerIndex = injected.indexOf('const marker = "</head>";');

    expect(toolbarIndex).toBeGreaterThan(-1);
    expect(toolbarIndex).toBeLessThan(firstClosingHeadIndex);
    expect(firstClosingHeadIndex).toBeLessThan(scriptMarkerIndex);
  });
});
