'use strict';

const { join } = require('path');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const fsp = require('fs').promises;
const telemetryUrl = require('@serverless/utils/analytics-and-notfications-url');
const isTelemetryDisabled = require('./is-disabled');
const cacheDirPath = require('./cache-path');

const timestampWeekBefore = Date.now() - 1000 * 60 * 60 * 24 * 7;

const isUuid = RegExp.prototype.test.bind(
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
);

const processResponseBody = async (response, ids, context) => {
  let result;
  try {
    result = await response.json();
  } catch (error) {
    context.output.verbose(`Response processing error for ${ids || '<no id>'}: ${error}`);
    return null;
  }
  return result;
};

async function request(payload, { ids, timeout, context } = {}) {
  let response;
  const body = JSON.stringify(payload);
  try {
    response = await fetch(telemetryUrl, {
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      timeout,
      body,
    });
  } catch (networkError) {
    context.output.verbose(`Request network error: ${networkError}`);
    return null;
  }

  if (response.status < 200 || response.status >= 300) {
    context.output.verbose(`Unexpected request response: ${response}`);
    return processResponseBody(response, ids, context);
  }

  if (!ids) return processResponseBody(response, ids, context);

  await Promise.all(
    ids.map(async (id) => {
      const cachePath = join(cacheDirPath, id);
      try {
        await fsp.unlink(cachePath);
      } catch (error) {
        context.output.verbose(`Could not remove cache file ${id}: ${error}`);
      }
    })
  );

  return processResponseBody(response, ids, context);
}

/**
 * @param {import('../../Context')} context
 */
async function send(context) {
  if (!telemetryUrl || isTelemetryDisabled || !cacheDirPath) return null;
  let dirFilenames;
  try {
    dirFilenames = await fsp.readdir(cacheDirPath);
  } catch (readdirError) {
    if (readdirError.code !== 'ENOENT') {
      context.output.verbose(`Cannot access cache dir: ${readdirError}`);
    }
    return null;
  }

  const payloadsWithIds = (
    await Promise.all(
      dirFilenames.map(async (dirFilename) => {
        if (!isUuid(dirFilename)) return null;
        let data;
        try {
          data = await fse.readJson(join(cacheDirPath, dirFilename));
        } catch (readJsonError) {
          if (readJsonError.code === 'ENOENT') return null; // Race condition
          context.output.verbose(`Cannot read cache file: ${dirFilename}: ${readJsonError}`);
          const cacheFile = join(cacheDirPath, dirFilename);
          try {
            return await fsp.unlink(cacheFile);
          } catch (error) {
            context.output.verbose(`Could not remove cache file ${dirFilename}: ${error}`);
          }
        }

        if (data && data.payload) {
          const timestamp = Number(data.timestamp);
          if (timestamp > timestampWeekBefore) {
            return {
              payload: data.payload,
              id: dirFilename,
            };
          }
        } else {
          context.output.verbose(`Invalid cached data ${dirFilename}: ${data}`);
        }

        const cacheFile = join(cacheDirPath, dirFilename);
        try {
          return await fsp.unlink(cacheFile);
        } catch (error) {
          context.output.verbose(`Could not remove cache file ${dirFilename}: ${error}`);
        }
        return null;
      })
    )
  ).filter(Boolean);

  if (!payloadsWithIds.length) return null;

  return request(
    payloadsWithIds
      .map((item) => item.payload)
      .sort((item, other) => item.timestamp - other.timestamp),
    {
      ids: payloadsWithIds.map((item) => item.id),
      timeout: 3000,
      context,
    }
  );
}

module.exports = send;
