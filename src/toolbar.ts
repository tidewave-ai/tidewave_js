import type { TidewaveConfig } from './core';
import { escapeHtmlAttribute, type LocalRequestInfoGetter, tidewaveConfigMetaHtml } from './config';

export function injectToolbarHtml<Request = unknown>(
  html: string,
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<Request>,
  request?: Request,
): string {
  if (config.toolbar === false) return html;
  if (toolbarAlreadyInjected(html)) return html;

  const closingHeadIndex = html.toLowerCase().indexOf('</head>');
  if (closingHeadIndex === -1) return html;

  return `${html.slice(0, closingHeadIndex)}${toolbarHtml(config, getLocalRequestInfo, request)}${html.slice(closingHeadIndex)}`;
}

function toolbarHtml<Request = unknown>(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<Request>,
  request?: Request,
): string {
  const clientUrl = config.clientUrl || 'https://tidewave.ai';

  return `
${tidewaveConfigMetaHtml(config, getLocalRequestInfo, request)}
<script async type="module" src="${escapeHtmlAttribute(`${clientUrl}/tc/toolbar.js`)}"></script>
`;
}

export function toolbarAlreadyInjected(html: string): boolean {
  return html.includes('name="tidewave:config"') || html.includes('/tc/toolbar.js');
}
