export const SHARE_STUB = `
(() => {
  let clicking = false;
  const after = new MessageChannel();
  after.port1.onmessage = () => { clicking = false; };
  addEventListener("click", () => { clicking = true; after.port2.postMessage(0); }, true);
  window.__shared = [];
  window.__files = [];
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => window.__canShare !== false });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: (data) => {
      const [file] = data.files;
      window.__files.push(file);
      window.__shared.push({
        activated: navigator.userActivation ? navigator.userActivation.isActive : null,
        bytes: file.size,
        name: file.name,
        sameTask: clicking,
        type: file.type,
      });
      return Promise.resolve();
    },
  });
  window.__report = async () => {
    const sizes = await Promise.all(window.__files.map(async (file) => {
      const bitmap = await createImageBitmap(file);
      return { height: bitmap.height, width: bitmap.width };
    }));
    return JSON.stringify(window.__shared.map((entry, index) => ({ ...entry, ...sizes[index] })));
  };
  window.__pictures = async () => JSON.stringify(await Promise.all(window.__files.map(async (file) => ({
    bytes: [...new Uint8Array(await file.arrayBuffer())],
    name: file.name,
  }))));
})();
`;
