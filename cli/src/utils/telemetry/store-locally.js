'use strict';

const telemetryUrl = require('@serverless/utils/analytics-and-notfications-url');
const isTelemetryDisabled = require('./is-disabled');
const cacheDirPath = require('./cache-path');
const { join } = require('path');
const { v1: uuid } = require('uuid');
const fse = require('fs-extra');
const ensurePlainObject = require('type/plain-object/ensure');

/**
 * This method is explicitly kept as synchronous. The reason for it being the fact that in the future in will need to be
 * be executed in such manner due to its potential use in `process.on('SIGINT')` handler.
 * @param {import('../../Context')} context
 */
function storeLocally(payload, context) {
  ensurePlainObject(payload);
  if (!telemetryUrl || isTelemetryDisabled || !cacheDirPath) return null;
  const id = uuid();

  return (function self() {
    try {
      // Additionally, we also append `id` to the payload to be used as $insert_id in Mixpanel to ensure event deduplication
      return fse.writeJsonSync(join(cacheDirPath, id), {
        payload: { ...payload, id },
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          fse.ensureDirSync(cacheDirPath);
          return self();
        } catch (ensureDirError) {
          if (context) {
            context.output.verbose('Cache dir creation error:', ensureDirError);
          }
        }
      }
      if (context) {
        context.output.verbose(`Write cache file error: ${id}`, error);
      }
      return null;
    }
  })();
}

module.exports = storeLocally;
