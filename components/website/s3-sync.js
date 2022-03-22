const crypto = require('crypto');
const ServerlessError = require('../../src/serverless-error');
const fs = require('fs-extra');
const path = require('path');
const { flatten } = require('ramda');
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { sdkConfig } = require('../cdk/sdk-config');
const { chunk } = require('lodash');
const { lookup } = require('mime-types');

/**
 * @typedef {import('@aws-sdk/client-s3')._Object} S3Object
 * @typedef {Record<string, S3Object>} S3Objects
 */

/**
 * Synchronize a local folder to a S3 bucket.
 *
 * @param {{
 *     localPath: string;
 *     targetPathPrefix?: string;
 *     bucketName: string;
 *     logVerbose: (string) => void;
 * }} param
 * @return {Promise<{ hasChanges: boolean; fileChangeCount: number }>}
 */
async function s3Sync({ localPath, targetPathPrefix, bucketName, logVerbose }) {
  let hasChanges = false;
  let fileChangeCount = 0;
  /** @type {string[]} */
  const filesToUpload = await listFilesRecursively(localPath);
  const existingS3Objects = await s3ListAll(bucketName, targetPathPrefix);

  // Upload files by chunks
  let skippedFiles = 0;
  for (const batch of chunk(filesToUpload, 2)) {
    await Promise.all(
      batch.map(async (file) => {
        const targetKey =
          targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file;
        const fileContent = fs.readFileSync(path.posix.join(localPath, file));

        // Check that the file isn't already uploaded
        if (targetKey in existingS3Objects) {
          const existingObject = existingS3Objects[targetKey];
          const etag = computeS3ETag(fileContent);
          if (etag === existingObject.ETag) {
            skippedFiles++;

            return;
          }
        }

        logVerbose(`Uploading ${file}`);
        await s3Put(bucketName, targetKey, fileContent);
        hasChanges = true;
        fileChangeCount++;
      })
    );
  }
  if (skippedFiles > 0) {
    logVerbose(`Skipped uploading ${skippedFiles} unchanged files`);
  }

  const targetKeys = filesToUpload.map((file) =>
    targetPathPrefix !== undefined ? path.posix.join(targetPathPrefix, file) : file
  );
  const keysToDelete = findKeysToDelete(Object.keys(existingS3Objects), targetKeys);
  if (keysToDelete.length > 0) {
    keysToDelete.map((key) => {
      logVerbose(`Deleting ${key}`);
      fileChangeCount++;
    });
    await s3Delete(bucketName, keysToDelete);
    hasChanges = true;
  }

  return { hasChanges, fileChangeCount };
}

/**
 * @param {string} directory
 * @return {Promise<string[]>}
 */
async function listFilesRecursively(directory) {
  const items = await fs.readdir(directory);

  const files = await Promise.all(
    items.map(async (fileName) => {
      const fullPath = path.posix.join(directory, fileName);
      const fileStat = await fs.stat(fullPath);
      if (fileStat.isFile()) {
        return [fileName];
      } else if (fileStat.isDirectory()) {
        const subFiles = await listFilesRecursively(fullPath);

        return subFiles.map((subFileName) => path.posix.join(fileName, subFileName));
      }

      return [];
    })
  );

  return flatten(files);
}

/**
 * @param {string} bucketName
 * @param {string|undefined} pathPrefix
 * @return {Promise<S3Objects>}
 */
async function s3ListAll(bucketName, pathPrefix) {
  const s3Client = new S3Client(await sdkConfig());

  let result;
  let continuationToken = undefined;
  /** @type {Record<string, S3Object>} */
  const objects = {};
  do {
    result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: pathPrefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      })
    );
    (result.Contents ?? []).forEach((object) => {
      if (object.Key === undefined) {
        return;
      }
      objects[object.Key] = object;
    });
    continuationToken = result.NextContinuationToken;
  } while (result.IsTruncated === true);

  return objects;
}

/**
 * @param {string[]} existing
 * @param {string[]} target
 * @return {string[]}
 */
function findKeysToDelete(existing, target) {
  // Returns every key that shouldn't exist anymore
  return existing.filter((key) => target.indexOf(key) === -1);
}

/**
 * @param {string} bucket
 * @param {string} key
 * @param {Buffer} fileContent
 */
async function s3Put(bucket, key, fileContent) {
  const s3Client = new S3Client(await sdkConfig());

  let contentType = lookup(key);
  if (contentType === false) {
    contentType = 'application/octet-stream';
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
    })
  );
}

/**
 * @param {string} bucket
 * @param {string[]} keys
 */
async function s3Delete(bucket, keys) {
  const s3Client = new S3Client(await sdkConfig());

  const response = await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => {
          return {
            Key: key,
          };
        }),
      },
    })
  );

  // S3 deleteObjects operation will fail silently
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
  if (response.Errors !== undefined && response.Errors.length !== 0) {
    response.Errors.forEach((error) => console.log(error));
    throw new ServerlessError(
      `Unable to delete some files in S3. The "static-website" and "server-side-website" construct require the s3:DeleteObject IAM permissions to synchronize files to S3, is it missing from your deployment policy?`,
      'LIFT_S3_DELETE_OBJECTS_FAILURE'
    );
  }
}

/**
 *
 * @param {Buffer} fileContent
 * @return {string}
 */
function computeS3ETag(fileContent) {
  return `"${crypto.createHash('md5').update(fileContent).digest('hex')}"`;
}

module.exports = {
  s3Sync,
  s3Put,
};
