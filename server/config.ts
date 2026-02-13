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
  };
}

// Create and export the config
export const config = createConfig();
