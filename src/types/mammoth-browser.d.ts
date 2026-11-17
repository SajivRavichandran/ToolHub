// mammoth ships types for its main entry but not the browser subpath, which we
// import at runtime for client-side .docx text extraction.
declare module "mammoth/mammoth.browser" {
  export interface MammothMessage {
    type: string;
    message: string;
  }
  export interface RawTextResult {
    value: string;
    messages: MammothMessage[];
  }
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<RawTextResult>;
}
