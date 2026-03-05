declare module '@/utils/logger' {
  export const wordLogger: any;
  export const syncLogger: any;
  export const dbLogger: any;
}

declare module '@/utils/generator' {
  export const generateCardHTML: (data: Record<string, unknown>) => string;
  export const generateMarkdown: (data: Record<string, unknown>) => string;
}

declare module '@/utils/template' {
  export const renderTemplate: (template: string, data: Record<string, unknown>) => string;
}
