import 'dotenv/config';

interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  database: {
    url: string;
  };
  discord: {
    botToken: string | null;
    userId: string | null;
  };
  messageAnalysis: {
    llmEndpoint: string;
    llmModel: string;
    messageHistoryLimit: number;
    batchMaxChars: number;
    workerIntervalMs: number;
    confidenceThreshold: number;
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function createConfig(): Config {
  const nodeEnv = (process.env.NODE_ENV || 'development') as Config['nodeEnv'];

  return {
    port: parseInt(getOptionalEnv('PORT', '2999'), 10),
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    database: {
      url: getOptionalEnv('DATABASE_URL', 'file:./data/.db'),
    },
    discord: {
      botToken: process.env.DISCORD_BOT_TOKEN || null,
      userId: process.env.DISCORD_USER_ID || null,
    },
    messageAnalysis: {
      llmEndpoint: getOptionalEnv('LLM_ENDPOINT', 'http://localhost:11434'),
      llmModel: getOptionalEnv('LLM_MODEL', 'llama3'),
      messageHistoryLimit: parseInt(getOptionalEnv('MESSAGE_HISTORY_LIMIT', '500'), 10),
      batchMaxChars: parseInt(getOptionalEnv('MESSAGE_BATCH_MAX_CHARS', '1000'), 10),
      workerIntervalMs: parseInt(getOptionalEnv('ANALYSIS_WORKER_INTERVAL_MS', '5000'), 10),
      confidenceThreshold: parseFloat(getOptionalEnv('SUGGESTION_CONFIDENCE_THRESHOLD', '0.7')),
    },
  };
}

// Create and export the config
export const config = createConfig();
