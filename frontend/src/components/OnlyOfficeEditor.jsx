import React, { useEffect, useRef } from 'react';

let apiScriptPromise;

const loadOnlyOfficeApi = (documentServerUrl) => {
  if (window.DocsAPI?.DocEditor) return Promise.resolve();
  if (apiScriptPromise) return apiScriptPromise;

  const source = `${documentServerUrl.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
  apiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${source}"]`);
    const script = existing || document.createElement('script');
    const onLoad = () => window.DocsAPI?.DocEditor
      ? resolve()
      : reject(new Error('ONLYOFFICE API yuklanmadi'));
    const onError = () => reject(new Error('ONLYOFFICE API faylini yuklab bo‘lmadi'));

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = source;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    apiScriptPromise = undefined;
    throw error;
  });
  return apiScriptPromise;
};

export default function OnlyOfficeEditor({
  id,
  documentServerUrl,
  config,
  onDocumentReady,
  onError,
}) {
  const editorRef = useRef();
  const readyRef = useRef(onDocumentReady);
  const errorRef = useRef(onError);
  readyRef.current = onDocumentReady;
  errorRef.current = onError;

  useEffect(() => {
    let disposed = false;

    loadOnlyOfficeApi(documentServerUrl)
      .then(() => {
        if (disposed) return;
        editorRef.current = new window.DocsAPI.DocEditor(id, {
          ...config,
          events: {
            ...(config.events || {}),
            onDocumentReady: (...args) => readyRef.current?.(...args),
            onError: (event) => errorRef.current?.(
              event?.data?.errorCode,
              event?.data?.errorDescription,
            ),
          },
        });
      })
      .catch((error) => {
        if (!disposed) errorRef.current?.('API_LOAD_ERROR', error.message);
      });

    return () => {
      disposed = true;
      const editor = editorRef.current;
      editorRef.current = undefined;
      try {
        editor?.destroyEditor?.();
      } catch {
        // The editor may already be destroyed by its iframe during navigation.
      }
    };
  }, [id, documentServerUrl, config]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div id={id} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
