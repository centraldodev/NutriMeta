const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolver para fontes do vector-icons
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
  },
  // Melhorar resolução de assets
  assetExts: [
    ...config.resolver.assetExts,
    'ttf',
    'otf',
  ],
};

// Adicionar sourceExts padrão se não existir
if (!config.resolver.sourceExts) {
  config.resolver.sourceExts = [
    'jsx',
    'js',
    'ts',
    'tsx',
    'json',
    'mjs',
  ];
}

module.exports = config;
