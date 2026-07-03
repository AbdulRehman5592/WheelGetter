import { PostHog } from 'posthog-node'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { ANALYTICS_ID } from '../constants/config'

const posthogClient = new PostHog(
    'phc_19FEaqf2nfrvPoNcw6H7YjhERoiXJ7kamkQrvvFnQhw',
    { host: 'https://us.i.posthog.com' }
)

const DEFAULT_DISTINCT_ID = "oss";

function getOssVersion() {
    try {
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        return packageJson.version || 'unknown';
    } catch {
        return 'unknown';
    }
}

function analyticsMetadata() {
    return {
        os: os.type().toLowerCase(),
        oss_version: getOssVersion(),
        machine: os.arch(),
        platform: os.platform(),
        node_version: process.version,
        environment: process.env.ENV || 'production',
    };
}

export function capture(event: any, data = {}) {
    if (process.env.MAXUN_TELEMETRY !== 'true') return;

    const distinctId = ANALYTICS_ID || DEFAULT_DISTINCT_ID;
    const payload = { ...data, ...analyticsMetadata() };

    posthogClient.capture({
        distinctId,
        event,
        properties: payload,
    });
}
