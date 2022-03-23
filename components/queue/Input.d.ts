export type QueueInput = {
  worker: {
    entry?: string;
    handler?: string;
    timeout?: number;
  };
  maxRetries?: number;
  batchSize?: number;
  maxBatchingWindow?: number;
  delay?: number;
  fifo?: boolean;
  encryption?: string;
  encryptionKey?: string;
};
