import type { TidewaveConfig } from './core';
import {
  tidewaveConfig,
  type LocalPortGetter,
  type TidewaveConfigPayload,
} from './http/handlers/config';

interface ToolbarPayload {
  tidewave: TidewaveConfigPayload;
  root: string;
  wsl_distro: string | null;
  framework: Record<string, string>;
}

export function injectToolbarHtml(
  html: string,
  config: TidewaveConfig,
  getLocalPort?: LocalPortGetter,
): string {
  if (config.toolbar === false) return html;
  if (toolbarAlreadyInjected(html)) return html;

  const closingHeadIndex = html.toLowerCase().indexOf('</head>');
  if (closingHeadIndex === -1) return html;

  return `${html.slice(0, closingHeadIndex)}${toolbarHtml(config, getLocalPort)}${html.slice(closingHeadIndex)}`;
}

function toolbarHtml(config: TidewaveConfig, getLocalPort?: LocalPortGetter): string {
  const clientUrl = config.clientUrl || 'https://tidewave.ai';
  const payload = toolbarPayload(config, getLocalPort);

  return `
<meta name="tidewave:config" content="${escapeHtmlAttribute(JSON.stringify(payload))}" />
<script async type="module" src="${escapeHtmlAttribute(`${clientUrl}/tc/toolbar.js`)}"></script>
`;
}

export function toolbarAlreadyInjected(html: string): boolean {
  return html.includes('name="tidewave:config"') || html.includes('/tc/toolbar.js');
}

function toolbarPayload(config: TidewaveConfig, getLocalPort?: LocalPortGetter): ToolbarPayload {
  return {
    tidewave: tidewaveConfig(config, getLocalPort),
    root: process.cwd(),
    wsl_distro: process.env['WSL_DISTRO_NAME'] ?? null,
    framework: {},
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
