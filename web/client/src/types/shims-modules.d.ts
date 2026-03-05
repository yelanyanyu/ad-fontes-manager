declare module '@/stores/wordStore' {
  export const useWordStore: () => any;
}

declare module '@/stores/appStore' {
  export const useAppStore: () => any;
}

declare module '@/utils/conflict' {
  export const deepDiffAdapter: any;
  export const yamlFormatter: any;
}

declare module '@/utils/search' {
  export const normalizeSearchInput: (value: string) => string;
  export const isBlankSearch: (value: string) => boolean;
  export const filterRecordsBySearch: <T>(records: T[], value: string, mode?: string) => T[];
}

declare module '@/utils/request' {
  const request: any;
  export default request;
}

declare module '@/utils/logger' {
  export const wordLogger: any;
}
