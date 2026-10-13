/* Keep game/iframe regression tests isolated from the owner's production Firebase.
   Online integration tests use their own demo-emulator configuration instead. */
module.exports = async function offlineConfig(pageOrContext) {
  await pageOrContext.addInitScript(() => {
    const config = { season: 'season-1', firebase: null, appCheckSiteKey: '' };
    // Handles both external online-config.js and the inlined Colab bundle.
    Object.defineProperty(window, 'RUN188_ONLINE_CONFIG', {
      get: () => config,
      set: () => {},
      configurable: true
    });
  });
};
