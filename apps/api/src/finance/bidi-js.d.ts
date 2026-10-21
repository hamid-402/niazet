declare module 'bidi-js' {
  export default function createBidi(): {
    getEmbeddingLevels(
      text: string,
      direction: 'rtl' | 'ltr',
    ): { levels: Uint8Array };
  };
}
