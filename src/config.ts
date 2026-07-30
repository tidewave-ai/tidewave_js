import type { TidewaveConfig } from './core';
import { default as tidewavePackage } from '../package.json' with { type: 'json' };

export type LocalScheme = 'http' | 'https';

export interface LocalRequestInfo {
  port: number | undefined;
  scheme: LocalScheme;
}

export type LocalRequestInfoGetter<Request = unknown> = (request?: Request) => LocalRequestInfo;

export interface TidewaveConfigPayload {
  project_name: string;
  framework_type: string;
  tidewave_version: string;
  team: NonNullable<TidewaveConfig['team']> | Record<string, never>;
  local_port: number | undefined;
  local_scheme: LocalScheme;
  tmp_dir: string;
}

export interface TidewaveMetaConfig {
  tidewave: TidewaveConfigPayload;
  root: string;
  wsl_distro: string | null;
  framework: Record<string, string>;
}

export function tidewaveConfig<Request = unknown>(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<Request>,
  request?: Request,
): TidewaveConfigPayload {
  const localRequestInfo = getLocalRequestInfo?.(request) ?? defaultLocalRequestInfo();

  if (!config.projectName) {
    throw new Error('Tidewave projectName must be configured');
  }

  if (!config.framework) {
    throw new Error('Tidewave framework must be configured');
  }

  return {
    project_name: config.projectName,
    framework_type: config.framework,
    tidewave_version: tidewavePackage.version,
    team: config.team || {},
    local_port: localRequestInfo.port,
    local_scheme: localRequestInfo.scheme,
    tmp_dir: config.tmpDir || 'tmp',
  };
}

export function tidewaveConfigMeta<Request = unknown>(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<Request>,
  request?: Request,
): TidewaveMetaConfig {
  return {
    tidewave: tidewaveConfig(config, getLocalRequestInfo, request),
    root: process.cwd(),
    wsl_distro: process.env['WSL_DISTRO_NAME'] ?? null,
    framework: {},
  };
}

export function tidewaveConfigMetaHtml<Request = unknown>(
  config: TidewaveConfig,
  getLocalRequestInfo?: LocalRequestInfoGetter<Request>,
  request?: Request,
): string {
  return `<meta name="tidewave:config" content="${escapeHtmlAttribute(
    JSON.stringify(tidewaveConfigMeta(config, getLocalRequestInfo, request)),
  )}" />`;
}

function defaultLocalRequestInfo(): LocalRequestInfo {
  return { port: undefined, scheme: 'http' };
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
