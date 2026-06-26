import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const signatureHandlers = {
  getSignatureInfo: async (message, context) => {
    const result = await context.services.current().gitSignatureService.getSignatureInfo(message.payload.hash);
    if (result.success) {
      context.postMessage({
        type: 'signatureInfo',
        payload: { hash: message.payload.hash, signature: result.value },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({
        type: 'signatureInfo',
        payload: {
          hash: message.payload.hash,
          signature: {
            status: 'unavailable',
            signer: '',
            keyId: '',
            fingerprint: '',
            format: 'gpg',
          },
        },
      });
    }
  },

  detectSignaturePresence: async (message, context) => {
    const result = await context.services.current().gitSignatureService.detectPresence(message.payload.hashes);
    if (result.success) {
      context.postMessage({ type: 'signaturePresence', payload: { presence: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({
        type: 'signaturePresenceFailed',
        payload: { hashes: message.payload.hashes },
      });
    }
  },

  verifySignatures: async (message, context) => {
    // Stream verdicts as they resolve so the signature column fills in row-by-row
    // (the store merges each partial map). The final aggregate is intentionally
    // not re-posted — every verdict has already been streamed via onProgress.
    const result = await context.services.current().gitSignatureService.verifySignatures(
      message.payload.hashes,
      (results) => {
        context.postMessage({ type: 'signaturesVerified', payload: { results } });
      }
    );
    if (!result.success) {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  openSignatureHelp: async (_message, context) => {
    await context.editorCommands.openSignatureHelp();
  },
} satisfies Pick<
  RequestHandlerMap,
  'getSignatureInfo' | 'detectSignaturePresence' | 'verifySignatures' | 'openSignatureHelp'
>;
