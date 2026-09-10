import { api } from './client';

export type AppLatest = {
  version: string;
  version_code: number;
  filename: string;
  size_bytes: number;
  updated_at: string;
  download_url: string;
  latest_url: string;
};

export async function getAppLatest(): Promise<AppLatest> {
  return api.get<AppLatest>('/api/v1/app/latest', { auth: false });
}