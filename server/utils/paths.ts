import path from 'path';
import appRoot from 'app-root-path';
import { config } from '../config';

/**
 * Centralized path resolution utility for the server
 * All paths are resolved relative to the application root
 */

/**
 * Get the base config directory path
 * In development: /src/config
 * In production: /build/config
 */
export const getConfigPath = (): string => {
  return path.join(appRoot.path, config.isProduction ? 'build' : 'src', 'config');
};

/**
 * Get the path to the SMS configuration file
 */
export const getSmsConfigPath = (): string => {
  return path.join(getConfigPath(), 'sms.yml');
};

/**
 * Get the path to the tasks configuration file
 */
export const getTasksConfigPath = (): string => {
  return path.join(getConfigPath(), 'tasks.yaml');
};

/**
 * Get the path to the admins configuration file
 */
export const getAdminsConfigPath = (): string => {
  return path.join(getConfigPath(), 'admins.yaml');
};

/**
 * Get the path to a specific form configuration file
 * @param formName - The name of the form (e.g., 'eventForm')
 */
export const getFormConfigPath = (formName: string): string => {
  return path.join(getConfigPath(), `${formName}.yaml`);
};

/**
 * Get the path to the users data file
 */
export const getUsersFilePath = (): string => {
  return path.join(appRoot.path, 'data', 'users.json');
};

/**
 * Get the path to the frontend build directory (static files)
 * In development: /build (doesn't exist in dev, but included for consistency)
 * In production: /build/public
 */
export const getBuildPath = (): string => {
  return path.join(appRoot.path, 'build', config.isProduction ? 'public' : '');
};

/**
 * Get the path to the data directory
 */
export const getDataPath = (): string => {
  return path.join(appRoot.path, 'data');
};
