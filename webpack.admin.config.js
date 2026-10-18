// The admin build (v0.89.7): CITY HALL, the old dev menu, as one script,
// dist-admin/city.js, which goes to b0r3d.org's _admin/games/city.js (behind
// Cloudflare Access: only the owner's login loads it). The game's own bundle
// (webpack.config.js) doesn't carry it.
//
// It must drive the running game, not a copy: every module src/dev/ imports from
// outside the folder is left out of this bundle and read from window.__bc.lib,
// which micropolis.js fills with the game's live modules (a bundled copy of
// devMode.js would never hear of the running Game). A new import there needs a
// matching entry in micropolis.js's lib.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'production',
  entry: './src/dev/admin.js',
  output: {
    path: path.resolve(__dirname, 'dist-admin'),
    filename: 'city.js',
    iife: true,
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: { '.js': ['.js', '.ts'] }
  },
  module: {
    rules: [{ test: /\.([cm]?ts|tsx)$/, loader: 'ts-loader' }]
  },
  externals: [
    function({ context, request }, callback) {
      if (/[\\/]src[\\/]dev$/.test(context) && request.startsWith('../')) {
        var key = path.basename(request).replace(/\.(js|ts)$/, '');
        return callback(null, 'window.__bc.lib.' + key, 'var');
      }
      callback();
    }
  ],
  devtool: false,
  performance: { hints: false }
};
