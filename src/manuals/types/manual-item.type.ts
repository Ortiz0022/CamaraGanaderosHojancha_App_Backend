export type ManualItem = {
  name: string;
  path: string;
  size: number;
  extension: string;
  clientModified?: string;
  serverModified?: string;
  previewable: boolean;
};